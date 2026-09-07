export class NativeStoryRuntime {
  constructor({
    dialoguePersistence,
    dialogueOverlay,
    dialogueFaces,
    roomScripts,
    scriptedEvents,
    automaticEvents,
    eventController,
    cutscenes,
    sceneResources,
    mapClipState,
    mapRenderPreparation,
    mapLayerState,
    sceneLighting,
    composeRoomScene,
    getRoomComposition,
    getGameDate,
    getGameplayState,
    getActivityRunner,
    sendDiagnostic,
  }) {
    this.dialoguePersistence = dialoguePersistence;
    this.dialogueOverlay = dialogueOverlay;
    this.dialogueFaces = dialogueFaces;
    this.roomScripts = roomScripts;
    this.scriptedEvents = scriptedEvents;
    this.automaticEvents = automaticEvents;
    this.eventController = eventController;
    this.cutscenes = cutscenes;
    this.sceneResources = sceneResources;
    this.mapClipState = mapClipState;
    this.mapRenderPreparation = mapRenderPreparation;
    this.mapLayerState = mapLayerState;
    this.sceneLighting = sceneLighting;
    this.composeRoomScene = composeRoomScene;
    this.getRoomComposition = getRoomComposition;
    this.getGameDate = getGameDate;
    this.getGameplayState = getGameplayState;
    this.getActivityRunner = getActivityRunner;
    this.sendDiagnostic = sendDiagnostic;
    this.diagnosticElapsed = 0;
  }

  get ownsPlayerPresentation() {
    return this.cutscenes.ownsPlayerPresentation;
  }

  get presentationActive() {
    return Boolean(this.cutscenes.active || this.getActivityRunner()?.active);
  }

  activateWorld(world, meshes, signal) {
    this.roomScripts.activateArea(world.nativeArea);
    const composition = this.getRoomComposition();
    this.composeRoomScene(this.roomScripts.sceneState, composition);
    for (const resource of composition.resources) {
      this.sceneResources.register(resource);
    }
    this.mapLayerState.load(world, meshes, this.getGameDate());
    this.roomScripts.sceneState.configureNativeOperation0120Records(
      this.mapClipState.load(world, meshes),
    );
    this.mapRenderPreparation.load(world, meshes);
    return this.sceneLighting.create(world, { signal });
  }

  clearWorld(world) {
    this.cutscenes.stop("world-change");
    this.dialogueOverlay.stop("world-change");
    this.automaticEvents.leaveArea();
    this.eventController.reset("world-change");
    this.scriptedEvents.cancel("world-change");
    this.scriptedEvents.resetRoomControllers();
    this.roomScripts.deactivateArea();
    this.mapClipState.clear();
    this.mapRenderPreparation.clear();
    this.sceneResources.clear();
    this.cutscenes.clearWorld(world.id);
  }

  updateOverlay(nowMs) {
    this.dialogueOverlay.update(nowMs);
  }

  updateEventController(deltaSeconds) {
    this.eventController.update(deltaSeconds);
  }

  updateFaces(deltaSeconds) {
    this.dialogueFaces.update(deltaSeconds);
  }

  updateCutscenes(deltaSeconds) { this.cutscenes.update(deltaSeconds); }
  updateScriptedEvents(deltaSeconds) { this.scriptedEvents.update(deltaSeconds); }

  updateAutomatic({ world, enabled, playerPosition, playerYaw }) {
    const gameplayState = this.getGameplayState();
    this.automaticEvents.update({
      area: world.nativeArea,
      enabled: enabled && Boolean(gameplayState),
      context: {
        nativeContext: {
          dialogueState: gameplayState?.dialogueState,
          nativePersistentScriptBitState:
            gameplayState?.persistentScriptBitState,
          gameDate: this.getGameDate(),
          playerPosition,
          playerYaw,
        },
      },
    });
  }

  updateDiagnostics(wallDeltaSeconds, snapshot) {
    if (!this.getActivityRunner()?.active) {
      this.diagnosticElapsed = 0;
      return;
    }
    this.diagnosticElapsed += wallDeltaSeconds;
    if (this.diagnosticElapsed < 1) return;
    this.diagnosticElapsed = 0;
    this.sendDiagnostic(snapshot());
  }

  resetAfterDisconnect() {
    this.dialogueOverlay.stop("disconnect");
    this.eventController.reset("disconnect");
    this.dialoguePersistence.clear();
  }

  applyDialogueState(state) {
    if (state) this.dialoguePersistence.hydrate(state);
    else this.dialoguePersistence.clear();
  }

  dispose() {
    this.cutscenes.dispose();
    this.dialogueOverlay.dispose();
    this.eventController.reset("disposed");
  }
}
