export class PlaySimulationRuntime {
  constructor({
    scene,
    worldRuntime,
    ownsPlayerPresentation,
    getController,
    actorRoot,
    playerRuntime,
    playInput,
    mobileControls,
    nativeActorTag,
    cinemaSeatInteractions,
    worldSounds,
    forkliftNetwork,
    forkliftModeRuntime,
    forkliftRace,
    forkliftFleet,
    forkliftCargo,
    remoteForkliftSounds,
    travelTransitions,
    stuckMovementDetector,
    recoverPlayerFromVoid,
    persistPlayerLocation,
    stateForMovement,
    now = Date.now,
  }) {
    this.scene = scene;
    this.worldRuntime = worldRuntime;
    this.ownsPlayerPresentation = ownsPlayerPresentation;
    this.getController = getController;
    this.actorRoot = actorRoot;
    this.playerRuntime = playerRuntime;
    this.playInput = playInput;
    this.mobileControls = mobileControls;
    this.nativeActorTag = nativeActorTag;
    this.cinemaSeatInteractions = cinemaSeatInteractions;
    this.worldSounds = worldSounds;
    this.forkliftNetwork = forkliftNetwork;
    this.forkliftModeRuntime = forkliftModeRuntime;
    this.forkliftRace = forkliftRace;
    this.forkliftFleet = forkliftFleet;
    this.forkliftCargo = forkliftCargo;
    this.remoteForkliftSounds = remoteForkliftSounds;
    this.travelTransitions = travelTransitions;
    this.stuckMovementDetector = stuckMovementDetector;
    this.recoverPlayerFromVoid = recoverPlayerFromVoid;
    this.persistPlayerLocation = persistPlayerLocation;
    this.stateForMovement = stateForMovement;
    this.now = now;

    this.locationSaveAccumulator = 0;
    this.movementState = "idle";
    this.lastMovement = null;
    this.lastAnimationState = "idle";
    this.vehicleActive = false;
    this.stuckHintVisible = false;
  }

  resetWorldState() {
    this.lastMovement = null;
    this.vehicleActive = false;
    this.stuckHintVisible = false;
  }

  update({ deltaSeconds }) {
    const controller = this.getController();
    // World replacement intentionally leaves a short interval with no active
    // controller during first-time startup. Never advance gameplay from that
    // incomplete state, even if a stale callback briefly changes ready.
    if (!this.worldRuntime.ready || !controller) {
      this.scene.physicsEnabled = false;
      return;
    }
    // AUTH presentation owns the player's transform and skeletal pose. Running
    // the ordinary controller would replace authored placement between native
    // 30 Hz presentation frames.
    if (
      this.worldRuntime.activeWorld.cutsceneOnly
      || this.ownsPlayerPresentation()
    ) {
      this.scene.physicsEnabled = false;
      this.lastMovement = null;
      this.vehicleActive = false;
      return;
    }

    this.forkliftNetwork.simulate(deltaSeconds);
    const vehicleActive = Boolean(
      this.forkliftModeRuntime.driving && this.forkliftModeRuntime.rig,
    );
    const inputSnapshot = this.playInput.snapshot({
      controller,
      mobileControls: this.mobileControls,
      vehicleActive,
    });
    const combatControlsActive = Boolean(
      this.playerRuntime.combat?.active && this.playerRuntime.combat.controlsActive,
    );
    // The combat runtime exists outside encounters too. Its target angle is
    // still a number then, but must not put exploration into orbit/strafing mode.
    const combatTargetYaw = combatControlsActive
      ? this.playerRuntime.combat.playerTargetYaw()
      : null;
    const movement = vehicleActive
      ? this.forkliftModeRuntime.update(deltaSeconds)
      : controller.update(deltaSeconds, {
        lockMovement: this.playerRuntime.combat?.playerMovementLocked,
        updateCamera: false,
        movementTargetYaw: combatTargetYaw,
        actorFacingYaw: combatTargetYaw,
        directionalDash: combatControlsActive,
        targetRelativeBackwardMultiplier:
          combatControlsActive ? 3 : 1,
        inputSnapshot,
      });
    this.cinemaSeatInteractions.update();
    if (!vehicleActive) this.playerRuntime.combat?.update(deltaSeconds);

    this.lastMovement = movement;
    this.worldSounds.setMovement(vehicleActive ? null : {
      ...movement,
      nativeArea: this.worldRuntime.activeWorld.collisionArea
        ?? this.worldRuntime.activeWorld.nativeArea,
      nativeActorTag: this.nativeActorTag(),
      position: {
        x: controller.collider.position.x,
        z: controller.collider.position.z,
      },
    });
    this.vehicleActive = vehicleActive;

    this.forkliftRace.simulate(deltaSeconds);
    if (!this.worldRuntime.activeWorld.cutsceneOnly) {
      this.recoverPlayerFromVoid();
      this.travelTransitions.updateBoundary(
        this.worldRuntime.activeWorld.id,
        controller.collider.position,
      );
    }

    const collisionExcludedForklifts = [...this.forkliftFleet.values()]
      .filter((entry) => (
        entry.righting
        || this.now() < (Number(entry.collisionDisabledUntilMs) || 0)
      ))
      .map((entry) => entry.id);
    if (
      vehicleActive
      && movement.noClip
      && this.forkliftModeRuntime.activeId
    ) {
      collisionExcludedForklifts.push(this.forkliftModeRuntime.activeId);
    }
    this.forkliftNetwork.syncRemoteCollisionPoses();
    this.remoteForkliftSounds.update(
      deltaSeconds,
      this.forkliftNetwork.audioSnapshots(),
    );
    this.forkliftCargo.physics?.syncForkliftPoses(
      [...this.forkliftFleet.values()],
      vehicleActive && !movement.noClip
        ? this.forkliftModeRuntime.activeId
        : null,
      collisionExcludedForklifts,
    );
    this.forkliftCargo.physics?.simulate(deltaSeconds);
    this.scene.physicsEnabled = Boolean(
      this.forkliftCargo.physics?.needsSimulation(),
    );

    this.lastAnimationState = vehicleActive
      ? "forkliftSit"
      : this.playerRuntime.combat?.playerAnimationState(movement)
        ?? this.stateForMovement(movement);
    this.movementState = vehicleActive
      ? (movement.moving ? "run" : "idle")
      : this.lastAnimationState;
    this.stuckHintVisible = this.stuckMovementDetector.update({
      moving: movement.moving,
      noClip: movement.noClip,
      position: this.actorRoot.position,
      deltaSeconds,
    });

    this.locationSaveAccumulator += deltaSeconds;
    if (this.locationSaveAccumulator >= 0.5) {
      this.locationSaveAccumulator = 0;
      this.persistPlayerLocation();
    }
  }
}
