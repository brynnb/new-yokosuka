import * as BABYLON from "@babylonjs/core";
import { fetchAssetBuffer as fetchArrayBuffer } from "../src/AssetCache.js";
import {
  applyGlobalWaterTimeOfDay,
} from "../src/GlobalWater.js";
import {
  createDobuitaCinemaPoster,
  suppressDobuitaCinemaFacadeFaces,
} from "./world/DobuitaCinemaPoster.js";
import {
  DEFAULT_FORKLIFT_TUNING_CONTROLS,
} from "./forklift/ForkliftTuningControls.js";
import {
  applyTimeOfDay,
  applyTimeOfDayLighting,
} from "../src/lighting.js";
import { RYO_YK_RENDER_MATRIX_ROUTES } from "../src/RuntimeMatrixRecording.js";
import { StuckMovementDetector } from "../src/StuckMovementDetector.js";
import state from "../src/state.js";
import {
  DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
} from "../src/ThirdPersonController.js";
import { updateModelVisibility } from "../src/variants.js";
import {
  CHARACTER_BY_ID,
  SELECTABLE_CHARACTERS,
} from "./config/characters.js";
import {
  EMOTES,
  LOCOMOTION_BLEND_SECONDS,
  NETWORK_EMOTE_IDS,
  RUNTIME_EMOTES,
} from "./config/animations.js";
import {
  YOU_ARCADE_SPOT_LIGHTS,
} from "./config/arcadeFixtures.js";
import {
  createYouArcadeBacklitSigns,
  createYouArcadeDigitalDisplays,
  createYouArcadePosters,
  hideYouArcadeScreenFaces,
  keepOnlyYouArcadeMap01Jukebox,
} from "./arcade/ArcadeFixtures.js";
import { PlayArcadeAssembly } from "./arcade/PlayArcadeAssembly.js";
import { PlayDebugAssembly } from "./debug/PlayDebugAssembly.js";
import { ForkliftRaceRuntime } from "./forklift/ForkliftRaceRuntime.js";
import {
  PlayForkliftAssembly,
} from "./forklift/PlayForkliftAssembly.js";
import { ensureForkliftPhysics } from "../src/ForkliftPhysicsBodies.js";
import {
  supportsPlayableEmotes,
} from "./characters/PlayableLocomotionRuntime.js";
import {
  ScheduledActorNetworkState,
} from "./characters/ScheduledActorNetworkState.js";
import {
  PlayCharacterAssembly,
} from "./characters/PlayCharacterAssembly.js";
import { MjqPoolRuntime } from "./pool/MjqPoolRuntime.js";
import {
  configurePoolUi,
  openPoolChooser,
} from "./ui/react/poolStore.js";
import { TravelTransitions } from "./world/TravelTransitions.js";
import {
  ScheduledSceneObjectRuntime,
} from "./world/ScheduledSceneObjectRuntime.js";
import { WorldClock } from "./world/WorldClock.js";
import { WorldWeatherRuntime } from "./world/WorldWeatherRuntime.js";
import { WorldMapLayerState } from "../src/rendering/WorldMapLayerState.js";
import { NativeMapClipState } from "./world/NativeMapClipState.js";
import {
  NativeMapRenderPreparationState,
} from "./world/NativeMapRenderPreparationState.js";
import { NativeSceneLighting } from "../src/rendering/NativeSceneLighting.js";
import {
  WorldLoadCancelledError,
  WorldLoader,
} from "./world/WorldLoader.js";
import { WorldRuntime } from "./world/WorldRuntime.js";
import { PlayWorldLifecycle } from "./world/PlayWorldLifecycle.js";
import {
  WorldEnvironmentRuntime,
} from "./world/WorldEnvironmentRuntime.js";
import {
  PlayInteractionAssembly,
} from "./interactions/PlayInteractionAssembly.js";
import {
  createNativeDialogueAssembly,
} from "./dialogue/NativeDialogueAssembly.js";
import {
  createNativePlayerSceneAssembly,
  createNativeRoomScriptAssembly,
  createNativeScriptedEventAssembly,
} from "./events/NativeEventAssembly.js";
import {
  createNativeSelectedObjectActionController,
} from "./scripts/NativeSelectedObjectActionController.js";
import {
  createNativeCutsceneAssembly,
} from "./cutscenes/NativeCutsceneAssembly.js";
import {
  createNativeActorLookPointSceneControl,
} from "./events/NativeAseqActorLookPointPresentation.js";
import {
  composeNativeRoomScene,
} from "./events/NativeRoomSceneComposition.js";
import {
  createNativeSceneResourceRegistry,
} from "./events/NativeSceneResourceRegistry.js";
import {
  FORKLIFT_DRIVER_HORIZONTAL_OFFSET,
  FORKLIFT_FIRST_PERSON_CAMERA_BACK_OFFSET,
} from "./config/forklifts.js";
import { availableCutscene } from "./config/cutscenes.js";
import { WORLDS } from "./config/worlds.js";
import { LoadingScreen } from "./ui/LoadingScreen.js";
import {
  WorldHud,
  formatGameTime,
} from "./ui/WorldHud.js";
import { SelectionMenus } from "./ui/SelectionMenus.js";
import { MobileControls } from "./ui/MobileControls.js";
import { PlayInterfaceAssembly } from "./ui/PlayInterfaceAssembly.js";
import { audioPreferences } from "./audio/AudioPreferences.js";
import { PlayAudioAssembly } from "./audio/PlayAudioAssembly.js";
import {
  isPersistentPlayerWorld,
  PlayerPersistence,
} from "./state/PlayerPersistence.js";
import {
  formatControlBinding,
  generalPreferences,
} from "./settings/GeneralPreferences.js";
import {
  graphicsPreferences,
  renderPixelRatioCap,
} from "../src/rendering/GraphicsPreferences.js";
import {
  PlayMultiplayerRuntime,
} from "./multiplayer/PlayMultiplayerRuntime.js";
import {
  PlayMultiplayerAdapter,
} from "./multiplayer/PlayMultiplayerAdapter.js";
import {
  SCRIPT_DEBUG_SCENARIOS,
  scriptDebugScenarioById,
} from "./scripts/ScriptDebugScenarios.js";
import {
  ScriptDebugScenarioRuntime,
} from "./debug/ScriptDebugScenarioRuntime.js";
import {
  scriptEventPlayerMotionDefinitions,
} from "./scripts/ScriptEventPresentationCatalog.js";
import {
  createScriptEventAssembly,
} from "./scripts/ScriptEventAssembly.js";
import { NativeStoryRuntime } from "./scripts/NativeStoryRuntime.js";
import {
  CutscenePreviewRuntime,
} from "./cutscenes/CutscenePreviewRuntime.js";
import { CombatHud } from "./combat/CombatHud.js";
import { accountSession } from "./account/AccountSession.js";
import { PlayLoopRuntime } from "./PlayLoopRuntime.js";
import { PlaySceneRuntime } from "./PlaySceneRuntime.js";
import { PlaySimulationRuntime } from "./PlaySimulationRuntime.js";
import { PlayPresentationRuntime } from "./PlayPresentationRuntime.js";
const INITIAL_SERVER_CONNECT_TIMEOUT_MS = 2_000;
const RENDER_MATRIX_BY_KEY = new Map(RYO_YK_RENDER_MATRIX_ROUTES);

// Runtime state belongs to one application lifetime. Keep cross-domain wiring
// here; domain modules own the player, world, story, and network behavior.
function createPlayRuntime() {
  const LOCAL_DEBUG = import.meta.env.DEV && [
    "127.0.0.1",
    "localhost",
    "::1",
  ].includes(window.location.hostname);
  const MOBILE_UI_QUERY = window.matchMedia("(max-width: 850px)");
  const lifetime = new AbortController();
  let disposed = false;

  let controller = null;
  let poolRuntime = null;
  let audioRuntime = null;
  const interfaceRuntime = new PlayInterfaceAssembly({
    localDebug: LOCAL_DEBUG,
    getController: () => controller,
    getMenuSounds: () => audioRuntime.menuSounds,
    getWorldReady: () => worldRuntime.ready,
    getArcadeGames: () => arcadeGames,
    getForkliftMode: () => forkliftModeRuntime,
    getPoolRuntime: () => poolRuntime,
    resetAudio: () => {
      audioRuntime.musicControls.reset();
      audioRuntime.dialogueAudioControls.reset();
      arcadeAudioControls.reset();
    },
    mobileUiQuery: MOBILE_UI_QUERY,
  });
  const {
    dom,
    transientNotice,
    displayOptions,
    playUi,
    playInput,
  } = interfaceRuntime;
  function focusGameSurface() {
    return interfaceRuntime.focusGameSurface();
  }

  audioRuntime = new PlayAudioAssembly({
    dom,
    audioPreferences,
    dialogueAudioEnabled: generalPreferences.getState().dialogueAudio,
    ninePmWorldIds: [
      WORLDS.exterior.id,
      WORLDS.yamanose.id,
      WORLDS.sakuragaoka.id,
      WORLDS.dobuita.id,
      WORLDS.mfbt.id,
      WORLDS.mfsy.id,
      WORLDS.mksg.id,
      WORLDS.ma00.id,
    ],
    getActiveForkliftId: () => forkliftModeRuntime?.activeId,
    sendForkliftSound: (forkliftId, cue) => (
      multiplayerRuntime.client?.sendForkliftSound(forkliftId, cue)
    ),
  });
  const {
    preferenceState: audioPreferenceState,
    menuSounds,
    combatSounds,
    poolSounds,
    worldSounds,
    forkliftSounds,
    musicControls,
    ambientDirector,
    dialogueAudio,
    dialogueAudioControls,
    ninePmMusicCue,
  } = audioRuntime;
  const playerPersistence = new PlayerPersistence();

  function applyArcadeEmulatorAudioPreferences(state) {
    try {
      dom.arcadeEmulatorFrame.contentWindow
        ?.__newYokosukaSetArcadeAudioPreferences?.(state);
    } catch {
      // The same-origin emulator may still be navigating.
    }
  }

  window.addEventListener("message", (event) => {
    if (
      event.origin !== window.location.origin
      || event.source !== dom.arcadeEmulatorFrame.contentWindow
      || event.data?.source !== "new-yokosuka-arcade"
      || event.data?.type !== "started"
    ) {
      return;
    }
    // A preloaded emulator can focus its iframe while it initializes even though
    // the player has not entered arcade mode. Return keyboard control to the
    // world once that background boot finishes.
    window.requestAnimationFrame(focusGameSurface);
  }, { signal: lifetime.signal });

  const sceneRuntime = new PlaySceneRuntime({ dom, graphicsPreferences });
  const {
    engine,
    scene,
    camera,
    actorRoot,
    forkliftChassisPose,
    modelOffset,
    combatEnemyRoot,
    combatEnemyModelOffset,
  } = sceneRuntime;
  interfaceRuntime.attachEngine(engine);
  const remoteForkliftSounds = audioRuntime.attachScene(scene, audioPreferences);

  let arcadeGames = null;
  const mobileControls = new MobileControls({
    dom,
    engine,
    mediaQuery: MOBILE_UI_QUERY,
    getController: () => controller,
    getArcadeGames: () => arcadeGames,
    exitForklift: () => forkliftModeRuntime.exit(),
    exitCinemaSeat: () => cinemaSeatInteractions.exit(),
  });
  mobileControls.initialize();
  const arcadeAssembly = new PlayArcadeAssembly({
    scene,
    engine,
    camera,
    dom,
    worldId: WORLDS.arcade.id,
    getWorld: () => worldRuntime.activeWorld,
    getActorPosition: () => actorRoot.position,
    getCurrentMeshes: () => state.currentMeshes,
    getSkybox: () => state.currentSkybox,
    getServerWallTimeMs: currentServerWallTimeMs,
    isPickerActive: () => trianglePicker.active || collisionPicker?.active,
    getController: () => controller,
    accountSession,
    mobileControls,
    audioPreferences,
    audio: audioRuntime,
    setEmulatorAudio: applyArcadeEmulatorAudioPreferences,
  });
  const {
    cabinetView: arcadeCabinetView,
    attractScreens: arcadeAttractScreens,
    audioControls: arcadeAudioControls,
    audioSettingsControls,
    lighting: arcadeLighting,
    performance: arcadePerformance,
    coordinator: arcadeCoordinator,
    controlsHud: arcadeControlsHud,
    paddleRuntime: paddleReactionRuntime,
    dartsRuntime: dartsPhysicalRuntime,
  } = {
    ...arcadeAssembly,
    paddleRuntime: arcadeAssembly.coordinator.paddleRuntime,
    dartsRuntime: arcadeAssembly.coordinator.dartsRuntime,
  };
  const debugAssembly = new PlayDebugAssembly({
    scene,
    dom,
    enabled: LOCAL_DEBUG,
    getActorPosition: () => actorRoot.position,
    getReferenceTargetMeshes: () => (
      arcadeLighting.targetMeshes(YOU_ARCADE_SPOT_LIGHTS[0])
    ),
    refreshLightTargets: light => arcadeLighting.refreshTargets(light),
    getSkybox: () => state.currentSkybox,
    getWorld: () => worldRuntime.activeWorld,
    getArcadeGames: () => arcadeGames,
    getPlayerCollider: () => controller?.collider || null,
    getWorldEnvironment: () => worldEnvironment,
    synchronizeWorldTime,
    refreshLoadingDateTime,
    setRunSpeedMultiplier: multiplier => {
      debugRunSpeedMultiplier = multiplier;
      if (controller) controller.options.runSpeedMultiplier = multiplier;
    },
    playerPersistence,
    getScheduledActorNetworkState: () => scheduledActorNetworkState,
    getPoolRuntime: () => poolRuntime,
    getForkliftMode: () => forkliftModeRuntime,
    persistPhysicsTuning: persistDebugForkliftPhysicsTuning,
    scriptScenarios: SCRIPT_DEBUG_SCENARIOS,
    applyScriptScenario: scenarioId => scriptDebugScenarios.apply(scenarioId),
    resetScriptScenario: () => scriptDebugScenarios.reset(),
    getCutsceneDirector: () => nativeCutsceneDirector,
  });
  const {
    light: lightDebugger,
    triangle: trianglePicker,
    collisions: collisionDebugger,
    collisionPicker,
    panel: debugPanel,
  } = debugAssembly;
  const interactionAssembly = new PlayInteractionAssembly({
    scene,
    sceneState: state,
    modelOffset,
    dom,
    fetchArrayBuffer,
    signedRenderKey,
    getActorRoot: () => actorRoot,
    getCharacterRoot: () => playerRuntime.modelRoot,
    getCharacterPoseAt: (clipState, tick) => characterRuntime.retarget(
      playerRuntime.clipRoutesAt(clipState, tick),
    ),
    getController: () => controller,
    worldSounds,
    getMultiplayerClient: () => multiplayerRuntime.client,
    publishPresence: force => publishLocalPresence(force),
    playEmote,
    runtimeEmotes: RUNTIME_EMOTES,
    fallbackEmotes: EMOTES,
    getAnimation: () => animation,
    getRetargetMatrices: () => characterRuntime.activeRetargetByRenderKey,
    getNativeSceneState: () => nativeRoomScriptRuntime?.sceneState,
    arcadeCoordinator,
    getPoolRuntime: () => poolRuntime,
    transientNotice,
    localDebug: LOCAL_DEBUG,
  });
  const {
    clock: clockInteractions,
    drawer: drawerInteractions,
    door: doorInteractions,
    inspectable: inspectableInteractions,
    authMovement: authMovementRuntime,
    vending: vendingInteractions,
    manager: interactionManager,
    dobuitaProps: dobuitaInteractionProps,
    placement: placementRuntime,
  } = interactionAssembly;
  const forkliftRace = new ForkliftRaceRuntime({
    scene,
    dom,
    getWorldId: () => worldRuntime.activeWorld.id,
    getActorPosition: () => (
      forkliftModeRuntime.driving ? actorRoot.position : null
    ),
    setMovementLocked: (locked) => controller?.setMovementLocked(locked),
    addWorldMesh: (mesh) => state.currentMeshes.push(mesh),
  });
  const dialogueControlModes = new Set();
  function setDialogueControlsActive(mode, active) {
    if (active) dialogueControlModes.add(mode);
    else dialogueControlModes.delete(mode);
    const dialogueActive = dialogueControlModes.size > 0;
    document.body.classList.toggle("dialogue-active", dialogueActive);
    dom.dialogueControlsHud.hidden = !dialogueActive;
  }
  function setCutscenePresentationActive(active) {
    document.body.classList.toggle("cutscene-active", Boolean(active));
    setDialogueControlsActive("cutscene", active);
  }

  function setCutsceneStarting(active) {
    document.body.classList.toggle("cutscene-starting", Boolean(active));
  }

  let nativeCutsceneDirector = null;
  let nativeScriptedEventRuntime = null;
  let cutscenePreviewRuntime = null;

  async function ensureCutscenePreviewCharacter() {
    if (playerRuntime.activeCharacterId === "ryo") return true;
    await switchCharacter(CHARACTER_BY_ID.get("ryo"), { persist: false });
    if (playerRuntime.activeCharacterId !== "ryo") {
      throw new Error("Cutscene preview could not load Ryo's authored actor model");
    }
    return true;
  }
  let scriptDebugScenarios = null;
  let worldLifecycle = null;
  const worldRuntime = new WorldRuntime({
    initialWorld: WORLDS.exterior,
    initialSpawn: BABYLON.Vector3.Zero(),
    invalidatePendingLoads: () => { state.currentLoadId += 1; },
    isCancellation: (error, signal) => (
      signal.aborted || error instanceof WorldLoadCancelledError
    ),
    createCancellationError: () => new WorldLoadCancelledError(),
    vectorFromArray: values => BABYLON.Vector3.FromArray(values),
    leaveRaceWorld: world => {
      if (world !== WORLDS.ma00race) forkliftModeRuntime.leaveRaceWorld();
    },
    hasPendingTransition: () => travelTransitions.pending,
    collapseSidebar: () => mobileControls.collapseSidebar(),
    beginLoading,
    waitUntilLoadingPainted: signal => loadingScreen.waitUntilPainted(signal),
    loadWorldAssets,
    clearWorld: clearActiveWorldRuntime,
    initializeWorld: initializeLoadedWorld,
    ensurePlayerLoaded: ensurePlayableCharacterRuntime,
    getController: () => controller,
    resetPlayer: resetPlayerAtActiveWorldSpawn,
    leaveServerWorld: () => multiplayerRuntime.client?.leaveWorld(),
    clearRemotePlayers: () => multiplayerRuntime.remotePlayers?.clear(),
    clearCollisionDebug: () => collisionDebugger.clear(),
    syncAnimationMenu: syncAnimationMenuAvailability,
    syncCombat: syncCombatForActiveWorld,
    advanceLoading: advanceLoadingProgress,
    finishLoading,
    showLoadingError: setLoadingError,
    persistLocation: persistPlayerLocation,
    markPresenceDirty: () => { multiplayerRuntime.markPresenceDirty(); },
    exitCinemaSeat: () => cinemaSeatInteractions.exit({ restorePosition: false }),
  });
  poolRuntime = new MjqPoolRuntime({
    scene,
    camera,
    canvas: dom.canvas,
    dom,
    getWorldId: () => worldRuntime.activeWorld.id,
    setMovementLocked: (locked) => controller?.setMovementLocked(locked),
    getLeaveBinding: () => generalPreferences.binding("cancel") || "KeyX",
    sounds: poolSounds,
    onActiveChange: (active) => {
      if (active) {
        musicControls.playTemporaryTrack("mjq-jazz-bar", {
          gain: 0.68,
          loop: true,
        });
      } else {
        musicControls.stopTemporaryTrack("mjq-jazz-bar");
        focusGameSurface();
      }
    },
  });
  configurePoolUi({
    onChoose: (mode) => {
      const started = poolRuntime.start(mode);
      if (started) playUi.handoffModal("pool-chooser");
      return started;
    },
    onCancel: () => {
      playUi.closeModal("pool-chooser");
      focusGameSurface();
    },
    onPowerChange: (value) => poolRuntime.setPower(value),
    onSpinChange: (value) => poolRuntime.setSideSpin(value),
    onTopSpinChange: (value) => poolRuntime.setTopSpin(value),
    onShoot: () => poolRuntime.shoot(),
    onPrimaryAction: () => poolRuntime.primaryAction(),
    onConfirmPlacement: () => poolRuntime.confirmPlacement(),
    onRestart: () => poolRuntime.restart(),
    onLeave: () => poolRuntime.close(),
  });
  let multiplayerAdapter = null;
  const multiplayerRuntime = new PlayMultiplayerRuntime({
    getSessionOptions: () => ({
      scene,
      dom,
      worlds: WORLDS,
      createAvatar: (characterId, initialPosition) => (
        characterAssembly.createRemoteAvatar(characterId, initialPosition)
      ),
      stopBlendSeconds: LOCOMOTION_BLEND_SECONDS,
      getWorld: () => worldRuntime.activeWorld,
      getActor: () => actorRoot,
      getController: () => controller,
      arcadeActive: () => arcadeGames?.active,
      characterId: accountSession.character?.id,
    }),
    getCallbacks: () => multiplayerAdapter.callbacks(),
    canPublishPresence: () => (
      Boolean(controller)
      && worldRuntime.ready
      && isPersistentPlayerWorld(worldRuntime.activeWorld)
    ),
    getPlayerPresence: () => multiplayerAdapter.playerPresence(),
    getVehiclePresence: () => multiplayerAdapter.vehiclePresence(),
    onSessionReplaced: message => (
      worldLifecycle.unloadForReplacedSession(message)
    ),
  });
  let debugRunSpeedMultiplier = 1;
  const worldClock = new WorldClock({
    onClockChanged: () => arcadeAttractScreens.markClockChanged(),
  });
  const worldWeather = new WorldWeatherRuntime({ scene });
  const worldEnvironment = new WorldEnvironmentRuntime({
    clock: worldClock,
    weather: worldWeather,
    sceneState: state,
    getWorld: () => worldRuntime.activeWorld,
    getReady: () => worldRuntime.ready,
    isSwitching: () => worldRuntime.switching,
    getWater: () => worldRuntime.water,
    getMeshes: () => state.currentMeshes,
    getCutsceneLightingPreset: () => (
      nativeCutsceneDirector?.activeLightingPresetIndex ?? null
    ),
    dailyMusicCue: ninePmMusicCue,
    setWorldDate: date => worldHud.setWorldDate(date),
    updateDebugClock: ({ serverDate, date, clock }) => {
      if (!LOCAL_DEBUG) return;
      if (clock.debugHour === null) {
        dom.debugTimeOfDay.value = String(
          serverDate.getUTCHours() + serverDate.getUTCMinutes() / 60,
        );
        dom.debugTimeOfDayValue.value = `Live · ${formatGameTime(serverDate)}`;
        dom.debugLiveClock.disabled = true;
        return;
      }
      dom.debugTimeOfDayValue.value = formatGameTime(date);
      dom.debugLiveClock.disabled = false;
    },
    showDayRollover: (world, date, signal) => (
      loadingScreen.showDayRollover(world, date, signal)
    ),
    getMovementLocked: () => Boolean(controller?.movementLocked),
    setMovementLocked: locked => controller?.setMovementLocked(locked),
    updateSceneLighting: () => nativeSceneLighting.update(),
    applyTimeOfDay,
    updateModelVisibility,
    updateMapLayer: (date, changed) => worldMapLayerState.update(date, changed),
    applyTimeOfDayLighting,
    applyWaterTimeOfDay: applyGlobalWaterTimeOfDay,
  });
  worldRuntime.setEnvironment(worldEnvironment);
  const worldMapLayerState = new WorldMapLayerState();
  const nativeSceneLighting = new NativeSceneLighting({
    scene,
    getActorPosition: () => actorRoot.position,
  });
  const nativeMapClipState = new NativeMapClipState();
  const nativeMapRenderPreparationState = new NativeMapRenderPreparationState({
    lightDirtyFlag: BABYLON.Material.LightDirtyFlag,
  });
  const scheduledActorNetworkState = new ScheduledActorNetworkState({
    getServerWallTimeMs: currentServerWallTimeMs,
    getDayLengthMs: () => worldEnvironment.dayLengthMs(),
  });
  const scheduledSceneObjects = new ScheduledSceneObjectRuntime({
    scene,
    state,
    getGameDate: () => worldEnvironment.gameDate(),
  });
  const characterAssembly = new PlayCharacterAssembly({
    scene,
    sceneState: state,
    renderMatrixByKey: RENDER_MATRIX_BY_KEY,
    fetchArrayBuffer,
    getWorld: () => worldRuntime.activeWorld,
    getGameDate: () => (
      worldEnvironment.lightingState(worldRuntime.activeWorld).date
    ),
    getCameraOcclusionTarget: () => (
      controller?.cameraTarget
      || actorRoot.position.add(new BABYLON.Vector3(0, 1.4, 0))
    ),
    networkState: scheduledActorNetworkState,
    localDebug: LOCAL_DEBUG,
    remoteAvatar: {
      isKnownEmote: emoteId => NETWORK_EMOTE_IDS.has(emoteId),
      forkliftModelForId,
      chassisTiltFromOrientation,
      quaternionFromNetworkState,
      getForkliftEffects: () => forkliftEffects,
    },
  });
  const {
    characterRuntime,
    motionRuntime: scheduledActorMotionRuntime,
    locomotionRuntime: playableLocomotionRuntime,
    scheduledActors,
  } = characterAssembly;
  // Player construction must precede menus and story adapters that read its
  // initial character and animation state synchronously.
  const playerRuntime = characterAssembly.createPlayer({
    scene,
    camera,
    actorRoot,
    modelOffset,
    combatEnemyRoot,
    combatEnemyModelOffset,
    getWorld: () => worldRuntime.activeWorld,
    getRaycastIndex: () => worldRuntime.raycastIndex,
    getSpawn: () => worldRuntime.spawn,
    getSpawnYaw: () => worldRuntime.spawnYaw,
    getRunSpeedMultiplier: () => debugRunSpeedMultiplier,
    getMouseSensitivity: () => generalPreferences.getState().mouseSensitivity,
    getBinding: action => generalPreferences.binding(action),
    noClipEnabled: LOCAL_DEBUG,
    presentationMotionDefinitions: scriptEventPlayerMotionDefinitions,
    applySupplementalPose: ({ frame, nextFrame, amount, state }) => {
      dobuitaInteractionProps.update(frame, nextFrame, amount);
      vendingInteractions.updateProp(frame, nextFrame, amount, state);
    },
    onActionCue: event => worldSounds.handleActionCue(event),
    onEmoteCleared: (emote) => {
      dobuitaInteractionProps.restore();
      if (NETWORK_EMOTE_IDS.has(emote?.id)) {
        vendingInteractions.finishAnimation();
        multiplayerRuntime.markPresenceDirty();
      }
    },
    onEmoteStarted: (emote) => {
      if (NETWORK_EMOTE_IDS.has(emote.id)) {
        multiplayerAdapter.markAnimationChanged();
      }
    },
    closeEmoteMenu: () => selectionMenus.setAnimationOpen(false),
    setActiveEmote: emoteId => selectionMenus.setActiveEmote(emoteId),
    setCharacterDisabled: disabled => selectionMenus.setCharacterDisabled(disabled),
    isReady: () => worldRuntime.ready,
    setActiveCharacter: characterId => selectionMenus.setActiveCharacter(characterId),
    shouldUseOutdoorFootwear: characterId => (
      characterId === "ryo" && worldRuntime.activeWorld.id !== WORLDS.interior.id
    ),
    persistRunToggle,
    persistLocation: () => persistPlayerLocation(),
    markPresenceDirty: () => { multiplayerRuntime.markPresenceDirty(); },
    syncWorldMode: () => syncForkliftMode(),
    onFirstPersonChanged: (firstPerson) => {
      if (forkliftModeRuntime.driving && !firstPerson) {
        forkliftController.cameraManuallyPositioned = false;
      }
    },
    onLoaded: () => initializeArcadeGames(),
    combatSounds,
    onCombatStateChanged: snapshot => combatHud.update(snapshot),
  });
  const animation = playerRuntime.animation;
  const selectionMenus = new SelectionMenus({
    emotes: EMOTES,
    characters: SELECTABLE_CHARACTERS,
    getActiveCharacterId: () => playerRuntime.activeCharacterId,
    getDefaultCharacterId: () => (
      accountSession.character?.avatarId || "ryo"
    ),
    onTravel: (worldId) => void travelToWorld(worldId),
    onCutscene: cutsceneId => void cutscenePreviewRuntime.requestInGame(cutsceneId),
    onEmote: playEmote,
    onCharacter: switchCharacter,
    onSelectionCommitted: focusGameSurface,
  });
  const nativeDialogue = createNativeDialogueAssembly({
    scheduledActors,
    networkState: scheduledActorNetworkState,
    getWorldId: () => worldRuntime.activeWorld.id,
    saveSnapshot: snapshot => (
      multiplayerRuntime.client.saveDialogueState(snapshot)
    ),
    addSystemMessage: message => multiplayerRuntime.chat?.addSystem(message),
    getController: () => controller,
    getScriptedEvents: () => nativeScriptedEventRuntime,
    dom,
    dialogueAudio,
    setControlsActive: active => setDialogueControlsActive("native", active),
    transientNotice,
  });
  const {
    readActorRuntimeValue: readNativeDialogueActorRuntimeValue,
    persistence: nativeDialoguePersistence,
    persistMutation: persistNativeDialogueMutation,
    sceneStaging: nativeDialogueSceneStaging,
    freeConversationState: nativeFreeConversationState,
    faces: nativeDialogueFaces,
    overlay: nativeDialogueOverlay,
  } = nativeDialogue;
  const nativePlayerScene = createNativePlayerSceneAssembly({
    getAnimation: () => animation,
    actorRoot,
    getController: () => controller,
    getRoomScripts: () => nativeRoomScriptRuntime,
    camera,
    vectorFromArray: values => BABYLON.Vector3.FromArray(values),
    musicControls,
  });
  const {
    playerMotion: nativePlayerScriptedMotionRuntime,
    syncMomtState: syncNativePlayerMomtState,
    playerXmpt: nativePlayerXmptRuntime,
    eventCamera: nativeEventCameraRuntime,
    roomMusic: nativeRoomMusicRuntime,
    cameraPresentation: nativeCameraPresentation,
  } = nativePlayerScene;
  const controlNativeActorLookPoint = createNativeActorLookPointSceneControl({
    getSceneState: () => nativeRoomScriptRuntime.sceneState,
  });
  nativeCutsceneDirector = createNativeCutsceneAssembly({
    scene,
    camera,
    scheduledActors,
    motionRuntime: scheduledActorMotionRuntime,
    audioPreferences,
    dialogueAudio,
    dialogueDom: {
      root: dom.dialogueOverlay,
      speaker: dom.dialogueSpeaker,
      sourceText: dom.dialogueSource,
      japaneseText: dom.dialogueJapanese,
      options: dom.dialogueOptions,
    },
    musicControls,
    fetchArrayBuffer,
    getSkybox: () => state.currentSkybox,
    controlActorLookPoint: controlNativeActorLookPoint,
    getPlayerModel: () => {
      const character = CHARACTER_BY_ID.get(playerRuntime.activeCharacterId);
      if (
        character?.nativeActorTag !== "AKIR"
        || !playerRuntime.characterLoader
        || !playerRuntime.modelRoot
      ) return null;
      return characterRuntime.presentationModel(
        playerRuntime.characterLoader,
        playerRuntime.modelRoot,
        actorRoot,
      );
    },
    syncPlayerTransform: () => {
      controller?.collider?.position.copyFrom(actorRoot.position);
    },
    getController: () => controller,
    setPresentationActive: setCutscenePresentationActive,
    synchronizeWorldTime,
    getNativeRuntime: () => nativeScriptedEventRuntime,
    getRoomScripts: () => nativeRoomScriptRuntime,
    getWorldId: () => worldRuntime.activeWorld.id,
    getPreviewRuntime: () => cutscenePreviewRuntime,
    transientNotice,
    getWorld: worldId => WORLDS[worldId],
    selectWorld,
  });
  const nativeCutsceneActivityAdapter = nativeCutsceneDirector
    .nativeActivityAdapter(() => worldRuntime.activeWorld.id);
  const nativeAseqActorTags = nativeCutsceneDirector.actorTags();
  const nativeSceneResourceRegistry = createNativeSceneResourceRegistry();
  const nativeSelectedObjectActionController =
    createNativeSelectedObjectActionController();
  const nativeRoomScriptRuntime = createNativeRoomScriptAssembly({
    scheduledActors,
    currentGameDate: currentServerGameDate,
    sceneResourceRegistry: nativeSceneResourceRegistry,
    cutsceneActivityAdapter: nativeCutsceneActivityAdapter,
    mapClipState: nativeMapClipState,
    mapRenderPreparationState: nativeMapRenderPreparationState,
    cutsceneDirector: nativeCutsceneDirector,
    selectedObjectActionController: nativeSelectedObjectActionController,
    eventCamera: nativeEventCameraRuntime,
    playerMotion: nativePlayerScriptedMotionRuntime,
    syncPlayerMomtState: syncNativePlayerMomtState,
    playerXmpt: nativePlayerXmptRuntime,
    actorLookPoint: controlNativeActorLookPoint,
    worldSounds,
    roomMusic: nativeRoomMusicRuntime,
    freeConversationState: nativeFreeConversationState,
    getController: () => controller,
    cameraPresentation: nativeCameraPresentation,
  });
  let nativeScriptActivityRunner = null;
  nativeScriptedEventRuntime = createNativeScriptedEventAssembly({
    dialoguePersistence: nativeDialoguePersistence,
    dialogueOverlay: nativeDialogueOverlay,
    freeConversationState: nativeFreeConversationState,
    roomScripts: nativeRoomScriptRuntime,
    actorTags: nativeAseqActorTags,
    actorRoot,
    getActivityRunner: () => nativeScriptActivityRunner,
    persistDialogueMutation: persistNativeDialogueMutation,
    addSystemMessage: message => multiplayerRuntime.chat?.addSystem(message),
    localDebug: LOCAL_DEBUG,
  });
  const scriptEvents = createScriptEventAssembly({
    nativeRuntime: nativeScriptedEventRuntime,
    getArea: () => worldRuntime.activeWorld.nativeArea,
    dialoguePersistence: nativeDialoguePersistence,
    selectedObjectActionController: nativeSelectedObjectActionController,
    modelOffset,
    currentMeshes: () => state.currentMeshes,
    renderMatrixByKey: RENDER_MATRIX_BY_KEY,
    animation,
    retargetCharacterMatrices: routes => (
      characterAssembly.retargetMatrices(routes)
    ),
    worldSounds,
    roomScripts: nativeRoomScriptRuntime,
    playerXmptRuntime: nativePlayerXmptRuntime,
    playerMotionRuntime: nativePlayerScriptedMotionRuntime,
    cameraRuntime: nativeEventCameraRuntime,
    scheduledActors,
    getPlayerPosition: () => [
      actorRoot.position.x,
      actorRoot.position.y,
      actorRoot.position.z,
    ],
    cameraPresentation: nativeCameraPresentation,
    getMovementLocked: () => Boolean(controller?.movementLocked),
    setMovementLocked: locked => controller?.setMovementLocked(locked),
    dom,
    dialogueAudio,
    setDialogueControlsActive: active => (
      setDialogueControlsActive("server-script", active)
    ),
    getMultiplayerClient: () => multiplayerRuntime.client,
    addSystemMessage: message => multiplayerRuntime.chat?.addSystem(message),
    transientNotice,
    localDebug: LOCAL_DEBUG,
  });
  const {
    activityRunner: assembledActivityRunner,
    dialoguePresenter: scriptEventDialoguePresenter,
    controller: scriptEventController,
    automaticEvents: scriptAutomaticEventRuntime,
  } = scriptEvents;
  nativeScriptActivityRunner = assembledActivityRunner;
  const nativeStoryRuntime = new NativeStoryRuntime({
    dialoguePersistence: nativeDialoguePersistence,
    dialogueOverlay: nativeDialogueOverlay,
    dialogueFaces: nativeDialogueFaces,
    roomScripts: nativeRoomScriptRuntime,
    scriptedEvents: nativeScriptedEventRuntime,
    automaticEvents: scriptAutomaticEventRuntime,
    eventController: scriptEventController,
    cutscenes: nativeCutsceneDirector,
    sceneResources: nativeSceneResourceRegistry,
    mapClipState: nativeMapClipState,
    mapRenderPreparation: nativeMapRenderPreparationState,
    mapLayerState: worldMapLayerState,
    sceneLighting: nativeSceneLighting,
    composeRoomScene: composeNativeRoomScene,
    getRoomComposition: () => dobuitaInteractionProps.nativeSceneComposition(),
    getGameDate: currentServerGameDate,
    getGameplayState: () => nativeDialoguePersistence.gameplayState(),
    getActivityRunner: () => nativeScriptActivityRunner,
    sendDiagnostic: ({ payload, runId }) => {
      multiplayerRuntime.client?.sendClientDiagnostic?.(
        "native-script-activity",
        payload,
        { runId },
      );
    },
  });
  scriptDebugScenarios = new ScriptDebugScenarioRuntime({
    scenarios: SCRIPT_DEBUG_SCENARIOS,
    scenarioById: scriptDebugScenarioById,
    worlds: WORLDS,
    worldRuntime,
    getController: () => controller,
    actorRoot,
    dialoguePersistence: nativeDialoguePersistence,
    scriptEventController,
    nativeScriptedEvents: nativeScriptedEventRuntime,
    selectWorld,
    enabled: LOCAL_DEBUG,
  });
  function handleDialogueControlKeyDown(event) {
    if (
      event.repeat
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || (
        !nativeDialogueOverlay.active
        && !scriptEventDialoguePresenter.active
        && !nativeCutsceneDirector?.active
      )
    ) {
      return;
    }
    const tag = event.target?.tagName;
    if (
      tag === "INPUT"
      || tag === "TEXTAREA"
      || tag === "SELECT"
      || tag === "BUTTON"
    ) return;
    const advances = event.code === generalPreferences.binding(
      "dialogueAdvance",
    );
    const stops = event.code === generalPreferences.binding("cancel");
    if (!advances && !stops) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (stops) {
      if (nativeCutsceneDirector?.active) {
        nativeCutsceneDirector.stop("user-cancelled");
        return;
      }
      if (scriptEventDialoguePresenter.active) {
        scriptEventController.cancel("user-cancelled");
        return;
      }
      if (nativeDialogueOverlay.stop("user-cancelled")) {
        nativeDialoguePersistence.rollback();
      }
      return;
    }
    if (nativeCutsceneDirector?.active) {
      nativeCutsceneDirector.seekBySeconds(5);
      return;
    }
    if (scriptEventDialoguePresenter.active) {
      scriptEventController.advanceLine();
      return;
    }
    nativeDialogueOverlay.advance();
  }
  window.addEventListener("keydown", handleDialogueControlKeyDown, true);

  const NATIVE_EVENT_CANCEL_INPUT_MASK = 0x0200;

  function handleNativeEventControlKey(event) {
    if (
      event.repeat
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || !nativeScriptActivityRunner?.active
      || nativeDialogueOverlay.active
      || scriptEventDialoguePresenter.active
      || event.code !== generalPreferences.binding("cancel")
      || !nativeRoomScriptRuntime.sceneState.readCurrentEventControlRecord()
    ) {
      return;
    }
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    nativeRoomScriptRuntime.sceneState.writeCurrentEventControllerInput(
      event.type === "keydown" ? NATIVE_EVENT_CANCEL_INPUT_MASK : 0,
    );
  }

  window.addEventListener("keydown", handleNativeEventControlKey, true);
  window.addEventListener("keyup", handleNativeEventControlKey, true);
  const worldLoader = new WorldLoader({
    scene,
    state,
    placementRuntime,
    scheduledActors,
    scheduledSceneObjects,
    onProgress: setLoadingProgress,
    beforePlacements: async (world, meshes) => {
      if (world.id === WORLDS.dobuita.id) {
        suppressDobuitaCinemaFacadeFaces(meshes);
      }
      if (world.id === WORLDS.arcade.id) {
        arcadeCoordinator.beginWorldLoad();
        keepOnlyYouArcadeMap01Jukebox(meshes);
        hideYouArcadeScreenFaces(meshes);
      }
    },
    afterPlacements: async (world, meshes) => {
      // AUTH scene objects may be resident map geometry, runtime placements, or
      // scheduled scene props. Resolve package ownership only after all three
      // sources have populated the shared world-root collection.
      await nativeCutsceneDirector.loadWorld(world.id, meshes);
      if (world.id === WORLDS.dobuita.id) {
        createDobuitaCinemaPoster(scene, meshes);
        return;
      }
      if (world.id !== WORLDS.arcade.id) return;
      await arcadeCoordinator.finishWorldLoad();
      createYouArcadeBacklitSigns(scene, meshes);
      createYouArcadePosters(scene, meshes);
      createYouArcadeDigitalDisplays(scene);
      arcadeCoordinator.redrawLoadedHighScores();
    },
  });
  function pickWorldWithRay(...args) {
    return (worldRuntime.raycastIndex || scene).pickWithRay(...args);
  }

  function syncControlHints() {
    for (const keycap of document.querySelectorAll("[data-control-binding]")) {
      keycap.textContent = formatControlBinding(
        generalPreferences.binding(keycap.dataset.controlBinding),
      );
    }
    if (forkliftModeRuntime.driving) {
      dom.runControlKey.textContent = [
        generalPreferences.binding("forkliftLower"),
        generalPreferences.binding("forkliftRaise"),
      ].map(formatControlBinding).join("/");
    }
  }

  function applyGeneralPreferences(state = generalPreferences.getState()) {
    document.body.classList.toggle(
      "dialogue-captions-disabled",
      !state.dialogueCaptions,
    );
    dialogueAudio.setEnabled(state.dialogueAudio);
    if (controller) {
      controller.options.cameraSensitivity = (
        DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.cameraSensitivity
        * state.mouseSensitivity
      );
    }
    playInput.refreshBindings();
    syncControlHints();
  }

  const forkliftAssembly = new PlayForkliftAssembly({
    scene,
    sceneState: state,
    raceWorld: WORLDS.ma00race,
    race: forkliftRace,
    getWorld: () => worldRuntime.activeWorld,
    isSwitchingWorld: () => worldRuntime.switching,
    getClient: () => multiplayerRuntime.client,
    getRemotePlayers: () => multiplayerRuntime.remotePlayers,
    getController: () => controller,
    getMobileLiftInput: () => mobileControls.forkLiftInput,
    getInputSnapshot: () => playInput.forkliftSnapshot(),
    pickWorldWithRay,
    actorRoot,
    chassisPose: forkliftChassisPose,
    modelOffset,
    sounds: forkliftSounds,
    syncMode: syncForkliftMode,
    markPresenceDirty: () => { multiplayerRuntime.markPresenceDirty(); },
    publishPresence: force => publishLocalPresence(force),
    persistLocation: persistPlayerLocation,
  });
  const {
    vehicleController: forkliftController,
    effects: forkliftEffects,
    fleet: forkliftFleet,
    cargo: forkliftCargo,
    network: forkliftNetwork,
    mode: forkliftModeRuntime,
  } = forkliftAssembly;
  const cinemaSeatInteractions = interactionAssembly.createCinemaSeat({
    getController: () => controller,
    getActorRoot: () => actorRoot,
    playEmote,
    clearEmote: clearActiveEmote,
    sitEmote: RUNTIME_EMOTES.find((emote) => emote.id === "cinemaSit"),
    onPositionChanged: () => {
      multiplayerRuntime.markPresenceDirty();
    },
    onActiveChanged: (active) => {
      syncAnimationMenuAvailability();
      selectionMenus.setCharacterDisabled(active || !worldRuntime.ready);
      mobileControls.setCinemaSeated(active);
      syncExitControlHint();
    },
  });
  const stuckMovementDetector = new StuckMovementDetector({
    durationSeconds: 1,
    minimumDistance: 0.5,
    minimumVisibleSeconds: 0.5,
  });
  const travelTransitions = new TravelTransitions({
    worlds: WORLDS,
    doorInteractions,
    getController: () => controller,
    isSwitchingWorld: () => worldRuntime.switching,
    selectWorld: (...args) => selectWorld(...args),
    persistPlayerLocation,
    authorizeTransition: (transition) => {
      if (!multiplayerRuntime.client) {
        return Promise.reject(
          new Error("This entrance requires a server connection."),
        );
      }
      // WebSocket ordering ensures this exact transform reaches the server
      // before the transition request that consumes it for proximity.
      publishLocalPresence(true);
      return multiplayerRuntime.client.requestTransition(transition);
    },
    commitTransition: (authorization) => {
      if (!multiplayerRuntime.client) {
        return Promise.reject(
          new Error("The multiplayer connection was lost before travel."),
        );
      }
      return multiplayerRuntime.client.commitTransition(authorization);
    },
    onTransitionDenied: ({ message }) => {
      inspectableInteractions.showHint(message);
    },
  });

  const worldHud = new WorldHud(dom);
  const loadingScreen = new LoadingScreen({
    dom,
    getDate: currentServerGameDate,
    worldHud,
    onFinished: focusGameSurface,
  });

  function setLoadingProgress(completed, total) {
    loadingScreen.setProgress(completed, total);
  }

  function advanceLoadingProgress(amount = 1) {
    loadingScreen.advance(amount);
  }

  function setLoadingError(message) {
    loadingScreen.setError(message);
  }

  function beginLoading(world) {
    worldEnvironment.abortRollover();
    loadingScreen.begin(world);
  }

  async function finishLoading(signal = null) {
    await loadingScreen.finish(signal);
  }

  worldEnvironment.start();

  function currentServerGameDate() {
    return worldEnvironment.gameDate();
  }

  function setServerWorldState(worldState, receivedAtMs = Date.now()) {
    worldEnvironment.setServerState(worldState, receivedAtMs);
  }

  function currentServerWallTimeMs() {
    return worldEnvironment.serverWallTimeMs();
  }

  function refreshLoadingDateTime() {
    loadingScreen.refreshDate();
  }

  function setWorldEnvironmentState(world) {
    return worldEnvironment.capture(world);
  }

  function synchronizeWorldTime(options = {}) {
    return worldEnvironment.synchronize(options);
  }

  async function fetchInitialServerWorldState() {
    const loaded = await worldEnvironment.fetchInitial({
      timeoutMs: INITIAL_SERVER_CONNECT_TIMEOUT_MS,
    });
    if (loaded) refreshLoadingDateTime();
  }

  function readSavedRunToggle() {
    return playerPersistence.readRunToggle();
  }

  function persistRunToggle(runToggled) {
    playerPersistence.saveRunToggle(runToggled);
  }

  function readDebugForkliftPhysicsTuning() {
    return playerPersistence.readForkliftTuning(
      DEFAULT_FORKLIFT_TUNING_CONTROLS,
    );
  }

  function persistDebugForkliftPhysicsTuning() {
    playerPersistence.saveForkliftTuning({
      centerOfMassHeight: Number(dom.forkliftComHeight.value),
      springRate: Number(dom.forkliftSpringRate.value),
      shockDamping: Number(dom.forkliftShockDamping.value),
      loadInfluence: Number(dom.forkliftLoadInfluence.value),
      tireGrip: Number(dom.forkliftTireGrip.value),
      brakeForce: Number(dom.forkliftBrakeForce.value),
      driveForce: Number(dom.forkliftDriveForce.value),
      steeringResponse: Number(dom.forkliftSteeringResponse.value),
      highSpeedSteering: Number(dom.forkliftHighSpeedSteering.value),
      rollStiffness: Number(dom.forkliftRollStiffness.value),
    });
  }

  function persistPlayerLocation() {
    return worldLifecycle?.persistPlayerLocation() ?? false;
  }

  function signedRenderKey(node) {
    return characterRuntime.signedRenderKey(node);
  }


  async function switchCharacter(character, { persist = true } = {}) {
    return playerRuntime.switchCharacter(character, { persist });
  }

  function applyAnimationFrame(amount = 0) {
    playerRuntime.applyAnimationFrame(amount);
  }

  function updateAnimation(deltaSeconds, nextState) {
    playerRuntime.updateAnimation(deltaSeconds, nextState);
  }

  const combatHud = new CombatHud({
    dom,
    getController: () => controller,
    getEncounter: () => playerRuntime.combat?.encounter,
  });
  combatHud.initialize();

  function stateForMovement(movement) {
    return playerRuntime.stateForMovement(movement);
  }

  const simulationRuntime = new PlaySimulationRuntime({
    scene,
    worldRuntime,
    ownsPlayerPresentation: () => nativeStoryRuntime.ownsPlayerPresentation,
    getController: () => controller,
    actorRoot,
    playerRuntime,
    playInput,
    mobileControls,
    nativeActorTag: () => CHARACTER_BY_ID.get(
      playerRuntime.activeCharacterId,
    )?.nativeActorTag,
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
  });

  function quaternionFromNetworkState(state, yaw = 0, prefix = "") {
    return forkliftAssembly.quaternionFromNetworkState(state, yaw, prefix);
  }

  function chassisTiltFromOrientation(orientation) {
    return forkliftAssembly.chassisTiltFromOrientation(orientation);
  }

  function clearActiveEmote() {
    playerRuntime.clearEmote();
  }

  function playEmote(emote, option, context = null) {
    return playerRuntime.playEmote(emote, option, context);
  }

  function setActiveWorldUi(world) {
    worldHud.setWorld(world);
    selectionMenus.setTravelOpen(false);
  }

  function forkliftModelForId(id, world = worldRuntime.activeWorld) {
    return forkliftAssembly.modelForId(id, world);
  }



  function syncExitControlHint() {
    const forkliftActive = forkliftModeRuntime.driving
      && Boolean(forkliftModeRuntime.rig);
    const cinemaSeated = Boolean(cinemaSeatInteractions.active);
    dom.forkliftExitControlRow.hidden = !forkliftActive && !cinemaSeated;
    dom.exitControlLabel.textContent = forkliftActive
      ? "Exit Forklift"
      : "Exit";
  }

  function syncAnimationMenuAvailability() {
    const character = CHARACTER_BY_ID.get(playerRuntime.activeCharacterId);
    if (!worldRuntime.ready) {
      selectionMenus.setAnimationDisabled(true);
      return;
    }
    if (!supportsPlayableEmotes(character)) {
      selectionMenus.setAnimationDisabled(
        true,
        "Emotes are unavailable for animal avatars",
      );
      return;
    }
    if (cinemaSeatInteractions.active) {
      selectionMenus.setAnimationDisabled(true, "Stand up to select an emote");
      return;
    }
    if (forkliftModeRuntime.driving) {
      selectionMenus.setAnimationDisabled(true, "Exit the forklift to select an emote");
      return;
    }
    selectionMenus.setAnimationDisabled(false);
  }

  function syncForkliftMode() {
    const active = (
      forkliftModeRuntime.driving
      && Boolean(forkliftModeRuntime.rig)
    );
    dom.app.classList.toggle("forklift-mode", active);
    dom.movementControlLabel.textContent = active ? "Drive" : "Move";
    dom.runControlKey.textContent = active
      ? [
        generalPreferences.binding("forkliftLower"),
        generalPreferences.binding("forkliftRaise"),
      ].map(formatControlBinding).join("/")
      : formatControlBinding(generalPreferences.binding("run"));
    dom.autoRunControlRow.hidden = false;
    dom.cameraModeControlRow.hidden = false;
    dom.zoomControlRow.hidden = active;
    syncExitControlHint();
    mobileControls.forkLiftInput = 0;

    playerRuntime.setVehicleMode(active, FORKLIFT_DRIVER_HORIZONTAL_OFFSET);

    if (controller) {
      controller.options.inputContext = active ? "forklift" : "exploration";
      controller.keys.clear();
      controller.options.toggleAutoRunKey = "KeyQ";
      controller.options.toggleFirstPersonKey = "KeyR";
      controller.options.firstPersonEnabled = true;
      controller.options.firstPersonCameraBackOffset = active
        ? FORKLIFT_FIRST_PERSON_CAMERA_BACK_OFFSET
        : 0;
      controller.options.resetThirdPersonViewOnFirstPersonExit = active;
      if (active && controller.firstPerson) {
        controller.setFirstPerson(false, { resetThirdPersonView: true });
      }
      controller.autoRun = false;
      controller.collider.ellipsoid.set(
        active ? 0.68 : controller.options.playerRadius,
        active ? 0.95 : controller.options.playerHeight / 2,
        active ? 0.68 : controller.options.playerRadius,
      );
      controller.collider.ellipsoidOffset.set(
        0,
        active ? 0.95 : controller.options.playerHeight / 2,
        0,
      );
    }
    syncControlHints();
    syncAnimationMenuAvailability();
  }

  function updateArcadeAttractScreens(liveGameId = null) {
    return arcadeAssembly.updateAttractScreens(liveGameId);
  }


  function clearActiveWorldRuntime(options) {
    return worldLifecycle.clear(options);
  }

  function loadWorldAssets(world, signal = null) {
    return worldLifecycle.loadAssets(world, signal);
  }

  function initializeLoadedWorld(options) {
    return worldLifecycle.initializeLoadedWorld(options);
  }

  function initializeArcadeGames() {
    controller = playerRuntime.controller;
    arcadeGames = arcadeAssembly.initializeGames();
  }

  async function ensurePlayableCharacterRuntime(world, signal) {
    await playerRuntime.ensureLoaded();
    await playerRuntime.prepareWorld(world, signal);
  }

  function resetPlayerAtActiveWorldSpawn(...args) {
    return worldLifecycle.resetPlayer(...args);
  }

  function syncCombatForActiveWorld() {
    return worldLifecycle.syncCombat();
  }

  function recoverPlayerFromVoid() {
    return worldLifecycle.recoverPlayerFromVoid();
  }

  function selectWorld(world, options = {}) {
    return worldRuntime.select(world, options);
  }

  function publishLocalPresence(force = false) {
    return multiplayerRuntime.publishPresence(force);
  }

  function initializeMultiplayer() {
    multiplayerRuntime.initialize();
  }

  function initialize(options = {}) {
    return worldLifecycle.initialize({
      ...options,
      fetchInitialServerWorldState,
    });
  }

  function travelToWorld(worldId) {
    return worldLifecycle.travelToWorld(worldId);
  }
  dom.raceStart.addEventListener("click", () => {
    if (worldRuntime.activeWorld !== WORLDS.ma00race || worldRuntime.switching) return;
    window.requestAnimationFrame(focusGameSurface);
    if (forkliftModeRuntime.driving) {
      if (forkliftModeRuntime.resetForRaceStart()) forkliftRace.start();
      return;
    }
    forkliftModeRuntime.requestRaceEntry({ startRace: true });
    forkliftModeRuntime.tryEnterPendingRaceForklift();
  }, { signal: lifetime.signal });
  dom.raceRestart.addEventListener("click", () => {
    window.requestAnimationFrame(focusGameSurface);
    if (!forkliftModeRuntime.resetForRaceStart()) return;
    forkliftRace.start();
  }, { signal: lifetime.signal });
  dom.raceQuit.addEventListener("click", () => {
    window.requestAnimationFrame(focusGameSurface);
    forkliftRace.abort();
    if (forkliftModeRuntime.driving) forkliftRace.holdVehicleUntilStart();
  }, { signal: lifetime.signal });
  selectionMenus.prepare();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (arcadeGames?.active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        arcadeGames.close();
        return;
      }
      if (arcadeCabinetView?.focusOnly) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const zoomingOut = arcadeCabinetView.setActive(false);
        controller?.setMovementLocked(zoomingOut);
        return;
      }
      selectionMenus.setTravelOpen(false);
      selectionMenus.setAnimationOpen(false);
      selectionMenus.setCharacterOpen(false);
      mobileControls.setChatOpen(false);
    }
    const tag = event.target?.tagName;
    if (
      event.code === generalPreferences.binding("cancel")
      && !event.repeat
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && tag !== "INPUT"
      && tag !== "TEXTAREA"
      && tag !== "SELECT"
      && tag !== "BUTTON"
    ) {
      if (cinemaSeatInteractions.exit() || forkliftModeRuntime.exit()) {
        event.preventDefault();
      }
    }
  }, { signal: lifetime.signal });

  worldLifecycle = new PlayWorldLifecycle({
    worldRuntime,
    worldLoader,
    worldEnvironment,
    sceneState: state,
    scene,
    engine,
    nativeSceneLighting,
    characterAssembly,
    playerRuntime,
    actorRoot,
    getController: () => controller,
    nativeStoryRuntime,
    simulationRuntime,
    multiplayerRuntime,
    accountSession,
    loadingScreen,
    selectionMenus,
    mobileControls,
    collisionDebugger,
    trianglePicker,
    collisionPicker,
    lightDebugger,
    scheduledActors,
    scheduledSceneObjects,
    cinemaSeatInteractions,
    interactionManager,
    dobuitaInteractionProps,
    doorInteractions,
    setInteractionMetadata: (...args) => interactionAssembly.setMetadata(...args),
    poolRuntime,
    worldSounds,
    forkliftSounds,
    remoteForkliftSounds,
    forkliftAssembly,
    forkliftRace,
    arcade: {
      getGames: () => arcadeGames,
      attractScreens: arcadeAttractScreens,
      lighting: arcadeLighting,
      cabinetView: arcadeCabinetView,
      audioControls: arcadeAudioControls,
      updateAttractScreens: updateArcadeAttractScreens,
    },
    dom,
    travelTransitions,
    audio: {
      musicControls,
      ambientDirector,
      ninePmMusicCue,
    },
    setWorldEnvironmentState,
    setActiveWorldUi,
    syncForkliftMode,
    clearActiveEmote,
    persistRunToggle,
    readSavedRunToggle,
    localDebug: LOCAL_DEBUG,
    worlds: WORLDS,
    characterById: CHARACTER_BY_ID,
    vectorFromArray: values => BABYLON.Vector3.FromArray(values),
  });
  multiplayerAdapter = new PlayMultiplayerAdapter({
    multiplayerRuntime,
    worldRuntime,
    worldLifecycle,
    playerRuntime,
    actorRoot,
    simulationRuntime,
    networkEmoteIds: NETWORK_EMOTE_IDS,
    forkliftAssembly,
    forkliftChassisPose,
    accountSession,
    nativeStoryRuntime,
    scheduledActorNetworkState,
    remoteForkliftSounds,
    arcadeCoordinator,
    scriptEventController,
    applyWorldState: setServerWorldState,
    synchronizeWorldTime,
    refreshLoadingDateTime,
    vectorFromArray: values => BABYLON.Vector3.FromArray(values),
    arcadeWorldId: WORLDS.arcade.id,
  });

  const worldInteractionDispatcher = interactionAssembly.createDispatcher({
    scripted: {
      accountSession,
      getActorRoot: () => actorRoot,
      getCurrentGameDate: currentServerGameDate,
      getMultiplayerClient: () => multiplayerRuntime.client,
      getPresentationOwned: () => nativeStoryRuntime.presentationActive,
      getWorld: () => worldRuntime.activeWorld,
      nativeDialogueOverlay,
      nativeDialoguePersistence,
      nativeRoomScriptRuntime,
      nativeScriptedEventRuntime,
      readNativeDialogueActorRuntimeValue,
      scheduledActorNetworkState,
      scriptEventController,
      transientNotice,
    },
    dispatcher: {
      arcade: {
        getGames: () => arcadeGames,
        cabinetView: arcadeCabinetView,
        paddleRuntime: paddleReactionRuntime,
        setMovementLocked: locked => controller?.setMovementLocked(locked),
      },
      camera,
      debug: {
        collisionPicker,
        debugPanel,
        enabled: LOCAL_DEBUG,
        lightDebugger,
        showLights: () => dom.showLights.checked,
        trianglePicker,
      },
      forklift: { mode: forkliftModeRuntime, network: forkliftNetwork },
      getActorPosition: () => actorRoot.position,
      getReady: () => worldRuntime.ready,
      getWorld: () => worldRuntime.activeWorld,
      openPoolChooser,
      playUi,
      poolRuntime,
      scene,
      travelTransitions,
      worldMapLayerState,
    },
  });
  debugPanel.initialize(
    readDebugForkliftPhysicsTuning(),
    playerPersistence.readDebugRunSpeed(),
    playerPersistence.readDebugNpcWalkSpeed(),
  );
  // Activate preference callbacks only after their player and vehicle owners exist.
  const unsubscribeGeneralPreferences =
    generalPreferences.subscribe(applyGeneralPreferences);
  applyGeneralPreferences();

  function disposeRuntime() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    accountSession.connectionStatus.stop();
    // Controller reset temporarily clears the run toggle while a world is
    // loading. The user's actual choice is saved immediately when toggled, so
    // never let a refresh during that transient state overwrite it.
    if (worldRuntime.ready) {
      persistRunToggle(
        forkliftModeRuntime.driving
          && forkliftModeRuntime.runToggleBefore !== null
          ? forkliftModeRuntime.runToggleBefore
          : controller?.runToggled,
      );
    }
    persistPlayerLocation();
    worldRuntime.cancel();
    worldInteractionDispatcher.dispose();
    interfaceRuntime.dispose();
    multiplayerRuntime.dispose();
    playerRuntime.dispose();
    poolRuntime.dispose();
    poolSounds.dispose();
    worldSounds.reset({ stopPersistent: true });
    forkliftSounds.reset();
    remoteForkliftSounds.dispose();
    mobileControls.dispose();
    forkliftEffects.dispose();
    loadingScreen.dispose();
    nativeCutsceneDirector.dispose();
    musicControls.dispose();
    audioRuntime.disposeActivation();
    ambientDirector.dispose();
    audioSettingsControls.dispose();
    sceneRuntime.dispose();
    unsubscribeDynamicResolutionPreference();
    unsubscribeGeneralPreferences();
    arcadeAudioControls.dispose();
    arcadeAssembly.disposeActivation();
    dialogueAudioControls.dispose();
    dialogueAudio.dispose();
    nativeDialogueOverlay.dispose();
    scriptEventController.reset("disposed");
    scriptEventDialoguePresenter.dispose();
    transientNotice.dispose();
    window.removeEventListener(
      "keydown",
      handleDialogueControlKeyDown,
      true,
    );
    window.removeEventListener("keydown", handleNativeEventControlKey, true);
    window.removeEventListener("keyup", handleNativeEventControlKey, true);
    dialogueControlModes.clear();
    document.body.classList.remove("dialogue-active");
    document.body.classList.remove("cutscene-active");
    worldEnvironment.dispose();
  }

  const presentationRuntime = new PlayPresentationRuntime({
    story: {
      runtime: nativeStoryRuntime,
      animation,
      scriptedEvents: nativeScriptedEventRuntime,
      playerMotion: nativePlayerScriptedMotionRuntime,
      dialogueOverlay: nativeDialogueOverlay,
      roomScripts: nativeRoomScriptRuntime,
      eventController: scriptEventController,
      cutsceneDirector: nativeCutsceneDirector,
    },
    world: {
      runtime: worldRuntime,
      scene,
      sceneState: state,
      scheduledActors,
      scheduledSceneObjects,
      interactions: interactionManager,
      travelTransitions,
    },
    player: {
      getController: () => controller,
      actorRoot,
      runtime: playerRuntime,
      simulation: simulationRuntime,
      updateAnimation,
      persistRunToggle,
      publishPresence: () => publishLocalPresence(),
    },
    forklifts: {
      network: forkliftNetwork,
      cargo: forkliftCargo,
      mode: forkliftModeRuntime,
      effects: forkliftEffects,
      race: forkliftRace,
      maximumLift: forkliftAssembly.maximumLift,
    },
    arcade: {
      performance: arcadePerformance,
      worldId: WORLDS.arcade.id,
      attractScreens: arcadeAttractScreens,
      lighting: arcadeLighting,
      debugPanel,
      cabinetView: arcadeCabinetView,
      getGames: () => arcadeGames,
    },
    poolRuntime,
    multiplayerRuntime,
    dom,
    transientNotice,
    toDegrees: radians => BABYLON.Angle.FromRadians(radians).degrees(),
  });

  function updateRenderFrame(timing) {
    presentationRuntime.update(timing);
  }

  const playLoop = new PlayLoopRuntime({
    engine,
    scene,
    canvas: dom.canvas,
    fixedUpdate: timing => simulationRuntime.update(timing),
    fixedPostUpdate: () => forkliftModeRuntime.capturePhysicsPose(),
    frameUpdate: updateRenderFrame,
    render: () => scene.render(),
    shouldRender: () => worldRuntime.ready,
    dispose: disposeRuntime,
    shouldAdaptResolution: () => worldRuntime.ready,
    adaptiveResolutionEnabled:
      graphicsPreferences.getState().dynamicResolution,
    maximumRenderPixelRatio: renderPixelRatioCap(
      graphicsPreferences.getState().renderResolution,
    ),
  });
  const unsubscribeDynamicResolutionPreference = graphicsPreferences.subscribe(
    ({ dynamicResolution, renderResolution }) => {
      playLoop.setMaximumRenderPixelRatio(
        renderPixelRatioCap(renderResolution),
      );
      playLoop.setAdaptiveResolutionEnabled(dynamicResolution);
    },
  );
  let playRuntimeStarted = false;
  const forkliftPhysicsReady = ensureForkliftPhysics(scene).then(() => {
    scene.physicsEnabled = false;
  });

  function disposeMenuBackground() {
    sceneRuntime.disposeMenuBackground();
  }

  function startPlayRuntime() {
    if (playRuntimeStarted) return;
    playRuntimeStarted = true;
    playLoop.start();
  }

  cutscenePreviewRuntime = new CutscenePreviewRuntime({
    getCutscene: availableCutscene,
    getWorld: worldId => WORLDS[worldId],
    getActiveWorld: () => worldRuntime.activeWorld,
    getController: () => controller,
    selectWorld,
    initializeWorld: initialize,
    ensureCharacter: ensureCutscenePreviewCharacter,
    startDirector: cutscene => nativeCutsceneDirector.start(cutscene),
    stopDirector: reason => nativeCutsceneDirector.stop(reason),
    dialoguePersistence: nativeDialoguePersistence,
    physicsReady: forkliftPhysicsReady,
    startPlayRuntime,
    disposeMenuBackground,
    setStarting: setCutsceneStarting,
    showNotice: text => transientNotice.show(text),
  });

  return {
    async start() {
      try {
        await Promise.all([
          accountSession.start({
            previewCutscene: cutsceneId => (
              cutscenePreviewRuntime.playFromMenu(cutsceneId)
            ),
          }),
          forkliftPhysicsReady,
        ]);
      } catch (error) {
        disposeMenuBackground();
        throw error;
      }
      disposeMenuBackground();
      if (disposed) return;
      initializeMultiplayer();
      startPlayRuntime();
      await initialize();
    },

    showStartupError(error) {
      console.error(error);
      setLoadingError(
        "The game couldn’t be started.\nPlease refresh and try again.",
      );
    },

    dispose() {
      playLoop.dispose();
      sceneRuntime.disposeMenuBackground();
      scene.dispose();
      engine.dispose();
    },
  };
}

export class PlayApplication {
  constructor() {
    this.runtime = null;
    this.startPromise = null;
    this.disposed = false;
  }

  start() {
    if (this.disposed) return Promise.reject(new Error("Application is disposed"));
    // Deferring construction keeps import side effects out of application setup
    // and routes synchronous setup errors through the same startup error path.
    this.startPromise ??= Promise.resolve().then(() => {
      if (this.disposed) return;
      this.runtime = createPlayRuntime();
      return this.runtime.start();
    });
    return this.startPromise;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime?.dispose();
  }

  showStartupError(error) {
    if (this.runtime) this.runtime.showStartupError(error);
    else console.error("The game couldn’t be initialized.", error);
  }
}
