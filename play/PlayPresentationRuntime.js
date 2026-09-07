export class PlayPresentationRuntime {
  constructor({
    story,
    world,
    player,
    forklifts,
    arcade,
    poolRuntime,
    multiplayerRuntime,
    dom,
    transientNotice,
    toDegrees,
    now = performance.now.bind(performance),
  }) {
    this.story = story;
    this.world = world;
    this.player = player;
    this.forklifts = forklifts;
    this.arcade = arcade;
    this.poolRuntime = poolRuntime;
    this.multiplayerRuntime = multiplayerRuntime;
    this.dom = dom;
    this.transientNotice = transientNotice;
    this.toDegrees = toDegrees;
    this.now = now;
  }

  diagnosticSnapshot() {
    const { story } = this;
    const activeMotion = story.animation.activeOneShot;
    return {
      payload: {
        native: story.scriptedEvents.diagnosticSnapshot(),
        animation: activeMotion ? {
          clipState: activeMotion.clipState,
          playbackRevision: activeMotion.playbackRevision,
          endNotified: activeMotion.endNotified,
          tick: story.animation.tick,
          accumulator: story.animation.accumulator,
        } : null,
        motionStatus: story.playerMotion.readMotionStatus({
          actorCode: "AKIR",
        }) ?? null,
        dialogue: {
          active: story.dialogueOverlay.active,
          status: story.dialogueOverlay.interaction?.status ?? null,
        },
        operation0050Active: Boolean(
          story.roomScripts.sceneState.readNativeOperation0050Activity(),
        ),
      },
      runId: story.eventController.active?.runId ?? null,
    };
  }

  update({
    deltaSeconds,
    wallDeltaSeconds,
    animationDeltaSeconds,
    fixedStepAlpha,
  }) {
    const {
      story,
      world,
      player,
      forklifts,
      arcade,
    } = this;

    story.runtime.updateOverlay(this.now());
    this.poolRuntime.update(deltaSeconds);
    story.runtime.updateEventController(deltaSeconds);
    story.runtime.updateDiagnostics(
      wallDeltaSeconds,
      () => this.diagnosticSnapshot(),
    );

    const performanceChange = arcade.performance.observeFrame(
      wallDeltaSeconds,
      {
        active: world.runtime.ready
          && world.runtime.activeWorld.id === arcade.worldId,
      },
    );
    if (performanceChange) {
      arcade.attractScreens.setPerformanceVideosEnabled(
        performanceChange.videosEnabled,
      );
      arcade.lighting.setPerformanceLightsEnabled(
        performanceChange.lightsEnabled,
      );
    }
    arcade.debugPanel.updateArcadePerformance(
      arcade.performance.getDebugState(),
      arcade.attractScreens.getDebugState(),
    );
    this.multiplayerRuntime.remotePlayers?.update(deltaSeconds);

    const controller = player.getController();
    if (world.runtime.ready && controller) {
      forklifts.network.updatePresentation(animationDeltaSeconds);
      world.scheduledActors.update(animationDeltaSeconds);
      story.runtime.updateFaces(animationDeltaSeconds);
      world.scheduledSceneObjects.update(animationDeltaSeconds);
      forklifts.cargo.physics?.updatePresentation(deltaSeconds);
      forklifts.mode.applyPresentation(fixedStepAlpha);
      // ACAM owns the camera during AUTH presentation. The gameplay camera
      // runs at render frequency, so allowing both owners would replace the
      // authored view between native 30 Hz presentation frames.
      if (
        !this.poolRuntime.active
        && !world.runtime.activeWorld.cutsceneOnly
        && !story.runtime.ownsPlayerPresentation
      ) {
        controller.updateCamera(deltaSeconds);
      }
      story.runtime.updateCutscenes(deltaSeconds);
      arcade.debugPanel.updateCutsceneTransport(
        story.cutsceneDirector.transportState(),
      );
      story.runtime.updateScriptedEvents(deltaSeconds);
      story.runtime.updateAutomatic({
        world: world.runtime.activeWorld,
        enabled: !world.runtime.activeWorld.cutsceneOnly
          && story.scriptedEvents.status === "idle",
        playerPosition: player.actorRoot.position,
        playerYaw: player.actorRoot.rotation.y,
      });

      const movement = player.simulation.lastMovement;
      const vehicleActive = player.simulation.vehicleActive;
      if (movement) {
        this.updatePlayerPresentation({
          movement,
          vehicleActive,
          controller,
          wallDeltaSeconds,
          animationDeltaSeconds,
        });
      }
    }

    if (world.sceneState.currentSkybox && world.scene.activeCamera) {
      world.sceneState.currentSkybox.position.copyFrom(
        world.scene.activeCamera.position,
      );
    }
    arcade.cabinetView.updateTransition(
      () => player.getController()?.setMovementLocked(false),
    );
    arcade.cabinetView.updateScreen(arcade.getGames());
  }

  updatePlayerPresentation({
    movement,
    vehicleActive,
    controller,
    wallDeltaSeconds,
    animationDeltaSeconds,
  }) {
    const { story, world, player, forklifts, arcade, dom } = this;
    if (!vehicleActive) {
      player.runtime.combat?.updateAnimation(animationDeltaSeconds);
    }
    if (vehicleActive && forklifts.mode.lastPhysicsMovement) {
      forklifts.effects.updateTireMarks(forklifts.mode.lastPhysicsMovement);
    } else {
      forklifts.effects.endTireMarks();
    }
    if (player.runtime.modelRoot?.isEnabled() === movement.firstPerson) {
      player.runtime.setModelVisible(!movement.firstPerson);
    }
    if (!story.runtime.ownsPlayerPresentation) {
      player.updateAnimation(
        animationDeltaSeconds,
        player.simulation.lastAnimationState,
      );
      player.runtime.updateCloth(animationDeltaSeconds);
    }
    world.interactions.update(wallDeltaSeconds);
    world.travelTransitions.finishDoor();
    arcade.lighting.update(
      animationDeltaSeconds,
      world.runtime.activeWorld.id,
    );
    forklifts.race.updateHud();

    const showForkliftTipHint = Boolean(
      vehicleActive && forklifts.mode.chassisState.tipped,
    );
    dom.forkliftTipHint.hidden = !showForkliftTipHint;
    dom.transientNotice.hidden = (
      showForkliftTipHint || !this.transientNotice.active
    );
    dom.stuckHint.hidden = (
      showForkliftTipHint
      || this.transientNotice.active
      || !player.simulation.stuckHintVisible
    );
    dom.noClipState.textContent = movement.noClip
      ? "No-clip on"
      : "No-clip off";
    dom.noClipState.classList.toggle("active", movement.noClip);
    dom.mobileStuckButton.classList.toggle("active", movement.noClip);
    dom.mobileStuckButton.setAttribute("aria-pressed", String(movement.noClip));
    dom.runState.textContent = vehicleActive
      ? `Lift ${Math.round(
        forklifts.mode.state.lift / forklifts.maximumLift * 100,
      )}%`
      : movement.runToggled
        ? "Run on"
        : "Run off";
    dom.runState.classList.toggle(
      "active",
      vehicleActive ? forklifts.mode.state.lift > 0 : movement.runToggled,
    );
    // Controller resets intentionally clear transient movement state while a
    // world is loading. Preserve the user's saved preference until restore.
    player.persistRunToggle(
      vehicleActive && forklifts.mode.runToggleBefore !== null
        ? forklifts.mode.runToggleBefore
        : movement.runToggled,
    );
    dom.autoRunState.textContent = vehicleActive
      ? movement.autoRun ? "Auto-drive on" : "Auto-drive off"
      : movement.autoRun ? "Auto-run on" : "Auto-run off";
    dom.autoRunState.classList.toggle("active", movement.autoRun);
    dom.worldCoordinates.textContent = [
      player.actorRoot.position.x,
      player.actorRoot.position.y,
      player.actorRoot.position.z,
    ].map((value) => value.toFixed(2)).join(", ");
    dom.worldFacing.textContent = `${this.toDegrees(
      player.actorRoot.rotation.y,
    ).toFixed(2)}°`;
    dom.worldFacing.dataset.pose = JSON.stringify({
      actorYaw: Number(player.actorRoot.rotation.y.toFixed(6)),
      cameraYaw: Number(controller.cameraYaw.toFixed(6)),
      cameraPitch: Number(controller.cameraPitch.toFixed(6)),
      cameraDistance: Number(controller.cameraDistance.toFixed(6)),
      firstPerson: controller.firstPerson,
    });
    player.publishPresence();
  }
}
