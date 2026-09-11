import { ArcadeGames } from "../../src/ArcadeGames.js";
import {
  ARCADE_ATTRACT_MAX_DRIFT_SECONDS,
  ARCADE_ATTRACT_SYNC_INTERVAL_MS,
  ARCADE_CABINET_VIEWS,
  JAPANESE_TV_SYNC_EPOCH_MS,
  YOU_ARCADE_POINT_LIGHTS,
  YOU_ARCADE_SPOT_LIGHTS,
} from "../config/arcadeFixtures.js";
import { ArcadeAudioControls } from "../ui/ArcadeAudioControls.js";
import { ArcadeControlsHud } from "../ui/ArcadeControlsHud.js";
import { AudioSettingsControls } from "../ui/AudioSettingsControls.js";
import { ArcadeAttractScreens } from "./ArcadeAttractScreens.js";
import { ArcadeCabinetView } from "./ArcadeCabinetView.js";
import { ArcadeCoordinator, arcadeMachineId } from "./ArcadeCoordinator.js";
import { closeArcadeResults, openArcadeResults } from "../ui/react/arcadeResultsStore.js";
import { ArcadeLighting } from "./ArcadeLighting.js";
import { dartCabinetView } from "./DartsPhysicalRuntime.js";
import { ArcadePerformanceController } from "../performance/ArcadePerformanceController.js";

export class PlayArcadeAssembly {
  constructor({
    scene,
    engine,
    camera,
    dom,
    worldId,
    getWorld,
    getActorPosition,
    getCurrentMeshes,
    getSkybox,
    getServerWallTimeMs,
    isPickerActive,
    getController,
    accountSession,
    mobileControls,
    audioPreferences,
    audio,
    setEmulatorAudio,
  }) {
    Object.assign(this, {
      scene,
      engine,
      camera,
      dom,
      worldId,
      getWorld,
      getActorPosition,
      getController,
      mobileControls,
      isPickerActive,
    });
    this.games = null;
    this.pendingResults = null;
    this.cabinetView = new ArcadeCabinetView({
      scene,
      engine,
      camera,
      dom,
      definitions: ARCADE_CABINET_VIEWS,
      worldId,
      getActiveWorldId: () => getWorld().id,
      isPickerActive,
      updateAttractScreens: (...args) => this.updateAttractScreens(...args),
    });
    this.attractScreens = new ArcadeAttractScreens({
      scene,
      definitions: ARCADE_CABINET_VIEWS,
      defaultWorldId: worldId,
      syncEpochMs: JAPANESE_TV_SYNC_EPOCH_MS,
      syncIntervalMs: ARCADE_ATTRACT_SYNC_INTERVAL_MS,
      maxDriftSeconds: ARCADE_ATTRACT_MAX_DRIFT_SECONDS,
      getServerWallTimeMs,
      masterMuted: audio.preferenceState.masterMuted,
      overallVolume: audio.preferenceState.overallVolume,
    });
    this.audioControls = new ArcadeAudioControls({
      dom,
      runtime: this.attractScreens,
    });
    this.audioSettingsControls = new AudioSettingsControls({
      dom,
      preferences: audioPreferences,
      music: audio.musicControls,
      ambient: audio.ambientDirector,
      dialogue: audio.dialogueAudio,
      arcade: this.attractScreens,
      setEmulatorAudio,
    });
    this.lighting = new ArcadeLighting({
      scene,
      cabinetDefinitions: ARCADE_CABINET_VIEWS,
      pointLights: YOU_ARCADE_POINT_LIGHTS,
      spotLights: YOU_ARCADE_SPOT_LIGHTS,
      worldId,
      getCurrentMeshes,
      getSkybox,
    });
    this.performance = new ArcadePerformanceController();
    this.coordinator = new ArcadeCoordinator({
      accountSession,
      dom,
      getGames: () => this.games,
    });
    this.controlsHud = new ArcadeControlsHud({
      dom,
      syncMobileControls: active => mobileControls.syncArcadeJoystick(active),
    });
    this.bindEmulatorAudioActivation();
  }

  updateAttractScreens(liveGameId = null) {
    this.attractScreens.update({
      activeWorldId: this.getWorld().id,
      actorPosition: this.getActorPosition(),
      focusedGameId: this.games?.active ? this.games.game?.id : null,
      liveGameId,
      pickerActive: this.isPickerActive(),
    });
  }

  initializeGames() {
    if (this.games) return this.games;
    this.games = new ArcadeGames({
      overlay: this.dom.arcadeOverlay,
      canvas: this.dom.arcadeCanvas,
      title: this.dom.arcadeTitle,
      instructions: this.dom.arcadeInstructions,
      score: this.dom.arcadeScore,
      highScore: this.dom.arcadeHighScore,
      status: this.dom.arcadeStatus,
      closeButton: this.dom.arcadeClose,
      emulatorFrame: this.dom.arcadeEmulatorFrame,
      paddleRuntime: this.coordinator.paddleRuntime,
      dartsRuntime: this.coordinator.dartsRuntime,
      getHighScore: (gameId, context) => (
        this.coordinator.getHighScore(gameId, context)
      ),
      submitScore: (gameId, score, context) => (
        this.coordinator.submitScore(gameId, score, context)
      ),
      onFinished: round => { this.pendingResults = round; },
      onActiveChange: (active, game, context) => {
        if (active) {
          this.clearResults();
          void this.coordinator.refreshActiveGame(game, context);
          this.getController()?.setMovementLocked(true);
          const definition = game?.physicalKind === "darts"
            ? dartCabinetView(context?.interaction)
            : null;
          this.cabinetView.setActive(true, game, definition);
          return;
        }
        const zoomingOut = this.cabinetView.setActive(false, game);
        this.getController()?.setMovementLocked(zoomingOut);
      },
      onControlsChange: game => this.controlsHud.show(game),
    });
    this.updateAttractScreens();
    this.mobileControls.syncJoystick();
    return this.games;
  }

  bindEmulatorAudioActivation() {
    this.activateEmulatorAudio = () => {
      if (this.getWorld()?.id !== this.worldId) return;
      try {
        this.dom.arcadeEmulatorFrame.contentWindow
          ?.__newYokosukaActivateArcadeAudio?.();
      } catch {
        // The same-origin emulator may still be navigating during early input.
      }
    };
    window.addEventListener("pointerdown", this.activateEmulatorAudio, true);
    window.addEventListener("keydown", this.activateEmulatorAudio, true);
  }

  updateResults() {
    // Wait for cabinet camera restoration before the modal snapshots the
    // movement lock; otherwise closing it could leave the avatar locked.
    if (!this.pendingResults || this.cabinetView.transition) return;
    const { game, score, sessionContext, submission } = this.pendingResults;
    this.pendingResults = null;
    const machineId = arcadeMachineId(game.id, sessionContext);
    if (!machineId) return;
    openArcadeResults({
      title: game.id === "darts" ? `${game.title} · Board ${Number(machineId.slice(-1)) + 1}` : game.title,
      score, decimalScores: game.decimalScores === true,
      characterId: this.coordinator.accountSession.character?.id,
      machineId, submission, scoreClient: this.coordinator.scoreClient,
    });
  }

  clearResults() {
    this.pendingResults = null;
    closeArcadeResults();
  }

  disposeActivation() {
    this.clearResults();
    window.removeEventListener("pointerdown", this.activateEmulatorAudio, true);
    window.removeEventListener("keydown", this.activateEmulatorAudio, true);
  }
}
