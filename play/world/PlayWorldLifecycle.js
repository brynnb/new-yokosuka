import { applyGlobalWaterTimeOfDay, disposeGlobalWater } from "../../src/GlobalWater.js";
import { OUTDOOR_BOUNDARY_TRANSITIONS } from "../../src/BoundaryTransitions.js";
import {
  disposeYouArcadeBacklitSigns,
  disposeYouArcadeDigitalDisplays,
  disposeYouArcadePosters,
} from "../arcade/ArcadeFixtures.js";
import {
  disposeDobuitaCinemaPoster,
} from "./DobuitaCinemaPoster.js";
import { YOU_ARCADE_INTERACTIONS } from "../config/arcadeFixtures.js";
import { MJQ_POOL_INTERACTION } from "../config/pool.js";
import { VOID_RESET_HEIGHT } from "../config/locations.js";
import { isPersistentPlayerWorld } from "../state/PlayerPersistence.js";
import { bindShenmue2NativeDoors } from "./Shenmue2NativeDoors.js";
import {
  createArcadeInteractionAnchors,
  createMapTransitionInteractionAnchors,
  createPoolInteractionAnchor,
} from "./WorldCollision.js";
import { clearWorldSceneAssets, clearWorldSceneBeforeLighting } from "../../src/rendering/SceneResources.js";

export class PlayWorldLifecycle {
  constructor({
    worldRuntime,
    worldLoader,
    worldEnvironment,
    sceneState,
    scene,
    engine,
    nativeSceneLighting,
    characterAssembly,
    playerRuntime,
    actorRoot,
    getController,
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
    setInteractionMetadata,
    poolRuntime,
    worldSounds,
    forkliftSounds,
    remoteForkliftSounds,
    forkliftAssembly,
    forkliftRace,
    arcade,
    dom,
    travelTransitions,
    audio,
    setWorldEnvironmentState,
    setActiveWorldUi,
    syncForkliftMode,
    clearActiveEmote,
    persistRunToggle,
    readSavedRunToggle,
    localDebug,
    worlds,
    characterById,
    vectorFromArray,
    persistentPlayerWorld = isPersistentPlayerWorld,
  }) {
    Object.assign(this, {
      worldRuntime,
      worldLoader,
      worldEnvironment,
      sceneState,
      scene,
      engine,
      nativeSceneLighting,
      characterAssembly,
      playerRuntime,
      actorRoot,
      getController,
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
      setInteractionMetadata,
      poolRuntime,
      worldSounds,
      forkliftSounds,
      remoteForkliftSounds,
      forkliftAssembly,
      forkliftRace,
      arcade,
      dom,
      travelTransitions,
      audio,
      setWorldEnvironmentState,
      setActiveWorldUi,
      syncForkliftMode,
      clearActiveEmote,
      persistRunToggle,
      readSavedRunToggle,
      localDebug,
      worlds,
      characterById,
      vectorFromArray,
      persistentPlayerWorld,
    });
  }

  async clear({
    raycastIndex = this.worldRuntime.raycastIndex,
    water = this.worldRuntime.water,
  } = {}) {
    this.audio.ambientDirector.setWorld(null);
    this.cinemaSeatInteractions.clear();
    raycastIndex?.dispose?.();
    this.getController()?.setRaycastIndex(null);
    this.poolRuntime.close();
    this.nativeStoryRuntime.clearWorld(this.worldRuntime.activeWorld);
    this.playerRuntime.combat?.setActive(false);
    this.worldSounds.reset();
    this.worldEnvironment.clearWeather();
    this.forkliftSounds.reset();
    this.remoteForkliftSounds.reset();
    this.simulationRuntime.resetWorldState();
    this.forkliftAssembly.mode.lastPhysicsMovement = null;
    if (this.trianglePicker.active) this.trianglePicker.setActive(false);
    if (this.collisionPicker.active) this.collisionPicker.setActive(false);
    this.lightDebugger.clear();
    this.lightDebugger.clearSelection();
    this.arcade.attractScreens.dispose();
    this.arcade.lighting.dispose();
    disposeYouArcadeBacklitSigns();
    disposeYouArcadePosters();
    disposeDobuitaCinemaPoster();
    disposeYouArcadeDigitalDisplays();
    this.arcade.cabinetView.clearProjection();
    this.scheduledActors.clear();
    this.scheduledSceneObjects.clear();
    this.forkliftAssembly.cargo.clearWorld();
    if (this.forkliftAssembly.fleet.size > 0) {
      this.forkliftAssembly.mode.disposeWorld();
      this.dom.app.classList.remove("forklift-mode");
    }
    disposeGlobalWater(water);
    if (this.playerRuntime.animation.activeEmote) this.clearActiveEmote();
    this.dobuitaInteractionProps.clear();
    this.interactionManager.clear();
    this.poolRuntime.clearWorld();
    clearWorldSceneBeforeLighting(this.sceneState, this.nativeSceneLighting);
  }

  unloadForReplacedSession(message) {
    this.worldRuntime.cancel();
    void this.worldRuntime.clear();
    this.multiplayerRuntime.remotePlayers?.clear();
    clearWorldSceneAssets(this.sceneState);
    this.sceneState.currentSkybox = null;
    this.sceneState.currentZone = null;
    this.sceneState.currentScenePrefix = null;
    this.sceneState.currentSceneComposition = null;
    this.actorRoot.setEnabled(false);
    this.scene.clearColor.set(0.025, 0.035, 0.045, 1);
    this.scene.render();
    this.engine.stopRenderLoop();
    this.audio.musicControls.setWorld("account-menu");
    this.audio.ambientDirector.setWorld(null);
    this.accountSession.showSessionReplaced(message);
  }

  async loadAssets(world, signal = null) {
    const prefetchController = new AbortController();
    const prefetchSignal = signal
      ? AbortSignal.any([signal, prefetchController.signal]) : prefetchController.signal;
    const playerData = Promise.resolve(this.playerRuntime.prefetch?.(world, prefetchSignal))
      .then(() => null, error => error);
    try {
      const { environment } = this.setWorldEnvironmentState(world);
      const scheduledActorDefinitions = await this.characterAssembly
        .definitionsForWorld(world);
      this.worldRuntime.ensureLoadActive(signal);
      const vehicleLoadCount = world.vehicle === "forklift" ? 1 : 0;
      const loaded = await this.worldLoader.load({
        world,
        scheduledActorDefinitions,
        postLoadUnits: vehicleLoadCount + 1,
        environment,
        signal,
      });
      this.worldRuntime.ensureLoadActive(signal);
      const playerError = await playerData;
      if (playerError) throw playerError;
      return { environment, loaded };
    } finally {
      prefetchController.abort();
    }
  }

  async initializeLoadedWorld({ world, environment, loaded, signal }) {
    if (this.playerRuntime.prepareWorld) await this.playerRuntime.prepareWorld(world, signal);
    this.worldRuntime.ensureLoadActive(signal);
    const controller = this.getController();
    controller?.setRaycastIndex(this.worldRuntime.raycastIndex);
    this.worldEnvironment.setWeatherOccluders(this.sceneState.currentMeshes);
    this.worldEnvironment.applyWeather(environment.precipitation);
    await this.nativeStoryRuntime.activateWorld(
      world, this.sceneState.currentMeshes, signal,
    );
    this.worldRuntime.ensureLoadActive(signal);
    this.playerRuntime.syncFootwear();
    applyGlobalWaterTimeOfDay(
      this.worldRuntime.water,
      this.worldEnvironment.lightingState(this.worldRuntime.activeWorld).blend,
    );
    bindShenmue2NativeDoors({
      currentMeshes: this.sceneState.currentMeshes,
      transitions: OUTDOOR_BOUNDARY_TRANSITIONS,
      worldId: world.id,
      doorInteractions: this.doorInteractions,
      setMetadata: this.setInteractionMetadata,
    });
    createMapTransitionInteractionAnchors({
      scene: this.scene,
      currentMeshes: this.sceneState.currentMeshes,
      interactions: world.transitionInteractions,
    });
    createArcadeInteractionAnchors({
      scene: this.scene,
      currentMeshes: this.sceneState.currentMeshes,
      interactions: YOU_ARCADE_INTERACTIONS,
      activeWorldId: this.worldRuntime.activeWorld.id,
      defaultWorldId: this.worlds.arcade.id,
    });
    createPoolInteractionAnchor({
      scene: this.scene,
      currentMeshes: this.sceneState.currentMeshes,
      interaction: MJQ_POOL_INTERACTION,
      activeWorldId: this.worldRuntime.activeWorld.id,
    });
    this.cinemaSeatInteractions.register(
      this.sceneState.currentMeshes,
      this.worldRuntime.activeWorld.id,
    );
    this.forkliftRace.prepare();
    if (world.vehicle === "forklift") {
      await this.forkliftAssembly.cargo.load();
      this.worldRuntime.ensureLoadActive(signal);
      loaded.progress.advance();
    }
    if (controller) {
      controller.options.terrainMaxHeight = (
        world.terrainMaxHeight ?? Number.POSITIVE_INFINITY
      );
    }
    this.setActiveWorldUi(world);
    this.syncForkliftMode();
    this.arcade.getGames()?.stopPreloadedEmulator();
    this.arcade.lighting.create(this.worldRuntime.activeWorld.id);
    this.arcade.updateAttractScreens();
    if (this.localDebug && this.dom.showCollisions.checked) {
      this.collisionDebugger.show();
    }
    if (this.localDebug && this.dom.showLights.checked) {
      this.lightDebugger.show();
    }
    this.arcade.audioControls.setWorld(this.worldRuntime.activeWorld.id);
    this.audio.musicControls.setWorld(
      this.worldRuntime.activeWorld.cutsceneOnly
        || this.worldRuntime.activeWorld.id === this.worlds.arcade.id
        ? null
        : this.worldRuntime.activeWorld.id,
      {
        preserveTemporary: this.audio.ninePmMusicCue
          .isEligible(this.worldRuntime.activeWorld.id),
      },
    );
    this.audio.ambientDirector.setWorld(this.worldRuntime.activeWorld.id);
  }

  resetPlayer(position = this.worldRuntime.spawn, yaw = this.worldRuntime.spawnYaw, {
    persist = true,
    snapToTerrain = true,
  } = {}) {
    const controller = this.getController();
    if (!controller) return;
    this.playerRuntime.reset(position, yaw, { persist: false, snapToTerrain });
    this.travelTransitions.resetBoundary(
      this.worldRuntime.activeWorld.id,
      controller.collider.position,
    );
    if (persist) this.persistPlayerLocation();
  }

  syncCombat() {
    const active = this.worldRuntime.activeWorld === this.worlds.mfbt;
    this.dom.app.classList.toggle("combat-mode", active);
    this.playerRuntime.combat?.setActive(active);
  }

  recoverPlayerFromVoid() {
    const controller = this.getController();
    if (!controller || controller.collider.position.y >= VOID_RESET_HEIGHT) {
      return false;
    }
    const travelState = controller.captureTravelState();
    controller.reset(this.worldRuntime.spawn, this.worldRuntime.spawnYaw);
    controller.restoreTravelState(travelState);
    this.actorRoot.position.copyFrom(controller.collider.position);
    this.actorRoot.rotation.y = this.worldRuntime.spawnYaw;
    this.forkliftAssembly.mode.resetMountedAt(
      this.worldRuntime.spawn,
      this.worldRuntime.spawnYaw,
    );
    this.clearActiveEmote();
    this.multiplayerRuntime.markPresenceDirty();
    this.persistPlayerLocation();
    return true;
  }

  persistPlayerLocation() {
    if (!this.persistentPlayerWorld(this.worldRuntime.activeWorld)) return false;
    this.multiplayerRuntime.markPresenceDirty();
    return this.multiplayerRuntime.publishPresence(true);
  }

  async initialize({
    initialWorldOverride = null,
    fetchServerState = true,
    persistInitialLocation = true,
    fetchInitialServerWorldState,
  } = {}) {
    const savedCharacter = this.accountSession.character;
    const serverSavedWorld = savedCharacter
      ? this.worlds[savedCharacter.worldId]
      : null;
    const savedWorld = this.persistentPlayerWorld(serverSavedWorld)
      ? serverSavedWorld
      : null;
    const savedAvatar = savedCharacter
      ? this.characterById.get(savedCharacter.avatarId)
      : null;
    const savedLocation = savedWorld ? {
      world: savedWorld,
      position: this.vectorFromArray([
        savedCharacter.x,
        savedCharacter.y,
        savedCharacter.z,
      ]),
      yaw: savedCharacter.yaw,
    } : null;
    const initialWorld = initialWorldOverride || savedLocation?.world
      || (!this.persistentPlayerWorld(serverSavedWorld) && serverSavedWorld
        ? this.worlds.interior
        : this.worlds.exterior);
    const initialCharacter = savedAvatar || this.characterById.get("ryo");
    this.playerRuntime.setInitialCharacter(initialCharacter.id);
    this.loadingScreen.setWorld(initialWorld);
    const loaded = await this.worldRuntime.initialize(initialWorld, {
      beforeLoad: fetchServerState ? fetchInitialServerWorldState : null,
      savedPosition: savedLocation?.world === initialWorld
        ? savedLocation.position
        : null,
      savedYaw: savedLocation?.yaw,
      persistLocation: false,
    });
    if (this.multiplayerRuntime.sessionReplaced) return;
    if (!loaded && !this.getController()) {
      throw new Error("World loading was cancelled before a replacement loaded.");
    }
    const controller = this.getController();
    controller.runToggled = this.readSavedRunToggle();
    this.persistRunToggle(controller.runToggled);
    if (persistInitialLocation) this.persistPlayerLocation();
    this.selectionMenus.setCharacterDisabled(false);
  }

  async travelToWorld(worldId) {
    const world = this.worlds[worldId];
    if (!world) return;
    if (world !== this.worlds.ma00race) {
      await this.worldRuntime.select(world);
      return;
    }
    this.forkliftAssembly.mode.requestRaceEntry();
    const selected = await this.worldRuntime.select(world);
    if (selected && this.worldRuntime.activeWorld === this.worlds.ma00race) {
      this.forkliftAssembly.mode.tryEnterPendingRaceForklift();
      return;
    }
    this.forkliftAssembly.mode.clearRaceEntryRequest();
  }
}
