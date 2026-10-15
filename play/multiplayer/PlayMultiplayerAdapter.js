import storyDestinations from "../data/story-destinations.json" with { type:"json" };

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
    worlds,
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
      worlds,
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
      onVendingResult: result => this.accountSession.applyPurchase(result),
      onCapsuleResult: result => this.accountSession.applyPurchase(result),
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
      onScriptEventCommitted: message => {
        const character = this.accountSession.character;
        if (!character || message.characterId !== character.id
          || message.modeRevision !== character.modeRevision) return;
        this.nativeStoryRuntime.applyScriptSettlement(message.state);
        const state = message.state;
        if (Number.isSafeInteger(state?.revision) && Number.isSafeInteger(state.yen)
          && state.flags && typeof state.flags === "object"
          && state.revision >= (character.scriptStateRevision ?? -1)) {
          this.accountSession.applyWelcome({ yen: state.yen, storyFlags: state.flags,
            scriptStateRevision: state.revision,
            ...(Number.isSafeInteger(state.storyTimeMs) ? { storyTimeMs:state.storyTimeMs } : {}) }, this.accountSession.inventory);
          if (state.destination) {
            void this.applyStoryDestination(message).catch(error => {
              console.error("Committed Story destination could not be loaded:",error);
              this.multiplayerRuntime.chat?.addSystem("Your Story arrival is saved. Reload to continue at the destination.");
            });
          }
        }
      },
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
    const character = this.accountSession.character;
    if (reconnected && character?.playMode === "story" && this.worlds?.[character.worldId]
      && character.worldId !== this.worldRuntime.activeWorld.id) {
      // A receipt lost with the socket is recovered from the persisted welcome.
      void this.loadStoryArrival({worldId:character.worldId,position:[character.x,character.y,character.z],yaw:character.yaw},false)
        .catch(error=>console.error("Saved Story arrival could not be restored:",error));
    }
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

  async applyStoryDestination(message) {
    const identity = `${message.characterId}:${message.modeRevision}:${message.state.revision}`;
    if (this.storyDestinationReceipt === identity) return false;
    const destination = storyDestinations.destinations.find(value=>value.id===message.state.destination.id);
    if (!destination || JSON.stringify([destination.worldId,destination.position,destination.yaw])
      !== JSON.stringify([message.state.destination.worldId,message.state.destination.position,message.state.destination.yaw])) {
      throw new Error("Unrecognized Story destination receipt");
    }
    this.storyDestinationReceipt = identity;
    await this.scriptEventController.waitForRunEnd(message.runId);
    const character = this.accountSession.character;
    if (!character || character.id !== message.characterId || character.modeRevision !== message.modeRevision
      || character.scriptStateRevision !== message.state.revision) return false;
    this.accountSession.applyWelcome({worldId:destination.worldId,x:destination.position[0],y:destination.position[1],z:destination.position[2],yaw:destination.yaw});
    return this.loadStoryArrival(destination,true,message.state.revision);
  }

  async loadStoryArrival(destination,serverDepartureCommitted,arrivalRevision=null) {
    const world = this.worlds[destination.worldId];
    if (!world) throw new Error(`Unknown Story arrival world ${destination.worldId}`);
    this.playerRuntime.controller?.setMovementLocked(true);
    try {
      const loaded = await this.worldRuntime.select(world,{
        serverDepartureCommitted,persistLocation:false,
        transition:{destination:{worldId:destination.worldId,scene:destination.scene,area:destination.area,entry:destination.entry,
          browserSpawn:{position:destination.position,yaw:destination.yaw}}},
      });
      if (!loaded) throw new Error("Story destination load was interrupted");
      // Stamp only after the actual world/pose is loaded, never when the
      // receipt first arrives. Old same-world presence must not consume it.
      if (arrivalRevision !== null && !this.multiplayerRuntime.client?.setAppliedStoryArrivalRevision(arrivalRevision)) {
        throw new Error("Story arrival acknowledgement could not be prepared");
      }
      this.multiplayerRuntime.publishPresence(true);
      return true;
    } finally { this.playerRuntime.controller?.setMovementLocked(false); }
  }
}
