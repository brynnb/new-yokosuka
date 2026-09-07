export class PlayMultiplayerAdapter {
  constructor({
    multiplayerRuntime,
    worldRuntime,
    worldLifecycle,
    playerRuntime,
    actorRoot,
    simulationRuntime,
    networkEmoteIds,
    forkliftAssembly,
    forkliftChassisPose,
    accountSession,
    nativeStoryRuntime,
    scheduledActorNetworkState,
    remoteForkliftSounds,
    arcadeCoordinator,
    scriptEventController,
    applyWorldState,
    synchronizeWorldTime,
    refreshLoadingDateTime,
    vectorFromArray,
    arcadeWorldId,
  }) {
    Object.assign(this, {
      multiplayerRuntime,
      worldRuntime,
      worldLifecycle,
      playerRuntime,
      actorRoot,
      simulationRuntime,
      networkEmoteIds,
      forkliftAssembly,
      forkliftChassisPose,
      accountSession,
      nativeStoryRuntime,
      scheduledActorNetworkState,
      remoteForkliftSounds,
      arcadeCoordinator,
      scriptEventController,
      applyWorldState,
      synchronizeWorldTime,
      refreshLoadingDateTime,
      vectorFromArray,
      arcadeWorldId,
    });
    this.animationRevision = 0;
  }

  markAnimationChanged() {
    this.animationRevision += 1;
    this.multiplayerRuntime.markPresenceDirty();
  }

  playerPresence() {
    const animationId = this.playerRuntime.animation.activeEmote?.emote?.id;
    return {
      worldId: this.worldRuntime.activeWorld.id,
      avatarId: this.playerRuntime.activeCharacterId,
      position: this.actorRoot.position,
      yaw: this.actorRoot.rotation.y,
      movement: this.simulationRuntime.movementState,
      animationId: this.networkEmoteIds.has(animationId) ? animationId : null,
      animationRevision: this.animationRevision,
    };
  }

  vehiclePresence() {
    const { mode, cargo } = this.forkliftAssembly;
    if (!mode.driving) return null;
    const authoritativePose = cargo.physics?.dynamicForkliftPose(mode.activeId);
    const orientation = authoritativePose?.orientation
      || this.forkliftAssembly.orientationQuaternion(this.actorRoot.rotation.y);
    if (!authoritativePose) this.forkliftChassisPose.computeWorldMatrix(true);
    return {
      id: mode.activeId,
      position: authoritativePose?.position
        || this.forkliftChassisPose.getAbsolutePosition(),
      lift: mode.state.lift,
      steering: mode.state.steeringAngle,
      wheelRoll: mode.state.wheelRoll,
      orientation,
    };
  }

  callbacks() {
    return {
      onStuck: () => this.recoverFromCollision(),
      onWarp: coordinates => this.warp(coordinates),
      onWorldState: worldState => {
        this.applyWorldState(worldState);
        this.synchronizeWorldTime();
        this.refreshLoadingDateTime();
      },
      onCharacterState: (character, inventory, dialogueState) => {
        this.accountSession.applyWelcome(character, inventory);
        this.nativeStoryRuntime.applyDialogueState(dialogueState);
      },
      onConnected: reconnected => this.onConnected(reconnected),
      onVendingResult: result => {
        if (result.outcome !== "purchased") return;
        this.accountSession.applyWelcome(
          { yen: result.yen },
          result.inventory || [],
        );
      },
      onSnapshot: (forklifts, cargo, npcs) => {
        this.forkliftAssembly.network.replaceServerSnapshot(forklifts);
        this.forkliftAssembly.cargo.replaceServerSnapshot(cargo);
        this.scheduledActorNetworkState.replaceSnapshot(
          this.worldRuntime.activeWorld.id,
          npcs,
        );
        this.forkliftAssembly.network.reconcileLocalOwnership();
        this.forkliftAssembly.mode.tryEnterPendingRaceForklift();
      },
      onRemotePlayersChanged: () => {
        this.forkliftAssembly.network.reconcileLocalOwnership();
        this.forkliftAssembly.network.syncVisibility();
      },
      onForkliftState: forklift => {
        this.forkliftAssembly.mode.onForkliftState(forklift);
        this.forkliftAssembly.network.reconcileLocalOwnership();
      },
      onForkliftSound: event => this.remoteForkliftSounds.playEvent(event),
      onForkliftRemoved: id => (
        this.forkliftAssembly.network.removeServerForklift(id)
      ),
      onCargoState: cargo => this.forkliftAssembly.cargo.applyServerState(cargo),
      onCargoRemoved: id => this.forkliftAssembly.cargo.removeServerCargo(id),
      onNPCState: npc => this.scheduledActorNetworkState.upsert(npc),
      onNPCRemoved: (id, worldId, revision) => {
        this.scheduledActorNetworkState.remove(id, worldId, revision);
      },
      onArcadeHighScore: event => this.arcadeCoordinator.applyLiveHighScore(event),
      onScriptEventYield: message => this.scriptEventController.handleYield(message),
      onScriptEventRejected: message => (
        this.scriptEventController.handleRejected(message)
      ),
      onReset: () => this.resetAfterDisconnect(),
    };
  }

  recoverFromCollision() {
    const controller = this.playerRuntime.controller;
    if (!controller) {
      return { recovered: false, message: "The world is still loading." };
    }
    if (this.forkliftAssembly.mode.driving) {
      return {
        recovered: false,
        message: "Exit the forklift before using /stuck.",
      };
    }
    const result = controller.recoverFromCollision({
      fallbackPosition: this.worldRuntime.spawn,
    });
    if (result.recovered) {
      this.multiplayerRuntime.markPresenceDirty();
      this.multiplayerRuntime.publishPresence(true);
    }
    const messages = {
      nearby: "Moved you to the nearest clear position.",
      "recent-safe": "Moved you back to your last safe position.",
      "world-spawn": "Moved you back to this area's entrance.",
    };
    return { ...result, message: messages[result.source] };
  }

  warp([x, y, z]) {
    if (
      !this.playerRuntime.controller
      || !this.worldRuntime.ready
      || this.worldRuntime.switching
    ) {
      return { warped: false, message: "The world is still loading." };
    }
    if (this.forkliftAssembly.mode.driving) {
      return { warped: false, message: "Exit the forklift before using /warp." };
    }
    this.worldLifecycle.resetPlayer(
      this.vectorFromArray([x, y, z]),
      this.actorRoot.rotation.y,
      { snapToTerrain: false },
    );
    return { warped: true, message: `Warped to ${x}, ${y}, ${z}.` };
  }

  onConnected(reconnected) {
    if (!reconnected || this.worldRuntime.activeWorld.id !== this.arcadeWorldId) {
      return;
    }
    void this.arcadeCoordinator.refreshLoadedHighScores({ force: true })
      .catch(() => {
        this.multiplayerRuntime.chat?.addSystem(
          "Arcade high scores could not be refreshed after reconnecting.",
        );
      });
  }

  resetAfterDisconnect() {
    this.nativeStoryRuntime.resetAfterDisconnect();
    if (this.forkliftAssembly.mode.driving) this.forkliftAssembly.mode.exit();
    this.forkliftAssembly.network.clearServerSnapshot();
    this.remoteForkliftSounds.reset();
    this.forkliftAssembly.network.syncVisibility();
    this.forkliftAssembly.cargo.handleDisconnect();
    this.scheduledActorNetworkState.clear();
  }
}
