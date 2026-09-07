import { WorldSessionRuntime } from "./WorldSessionRuntime.js";

export class WorldRuntime {
  constructor({
    initialWorld,
    initialSpawn,
    initialYaw = 0,
    invalidatePendingLoads,
    isCancellation,
    createCancellationError,
    vectorFromArray,
    leaveRaceWorld,
    hasPendingTransition,
    collapseSidebar,
    beginLoading,
    waitUntilLoadingPainted,
    loadWorldAssets,
    clearWorld,
    initializeWorld,
    ensurePlayerLoaded,
    getController,
    resetPlayer,
    leaveServerWorld,
    clearRemotePlayers,
    clearCollisionDebug,
    syncAnimationMenu,
    syncCombat,
    advanceLoading,
    finishLoading,
    showLoadingError,
    persistLocation,
    markPresenceDirty,
    exitCinemaSeat,
  }) {
    this.activeWorld = initialWorld;
    this.spawn = initialSpawn;
    this.spawnYaw = initialYaw;
    this.raycastIndex = null;
    this.water = null;
    this.ready = false;
    this.vectorFromArray = vectorFromArray;
    this.createCancellationError = createCancellationError;
    this.leaveRaceWorld = leaveRaceWorld;
    this.hasPendingTransition = hasPendingTransition;
    this.collapseSidebar = collapseSidebar;
    this.beginLoading = beginLoading;
    this.waitUntilLoadingPainted = waitUntilLoadingPainted;
    this.loadWorldAssets = loadWorldAssets;
    this.clearWorld = clearWorld;
    this.initializeWorld = initializeWorld;
    this.ensurePlayerLoaded = ensurePlayerLoaded;
    this.getController = getController;
    this.resetPlayer = resetPlayer;
    this.leaveServerWorld = leaveServerWorld;
    this.clearRemotePlayers = clearRemotePlayers;
    this.clearCollisionDebug = clearCollisionDebug;
    this.syncAnimationMenu = syncAnimationMenu;
    this.syncCombat = syncCombat;
    this.advanceLoading = advanceLoading;
    this.finishLoading = finishLoading;
    this.showLoadingError = showLoadingError;
    this.persistLocation = persistLocation;
    this.markPresenceDirty = markPresenceDirty;
    this.exitCinemaSeat = exitCinemaSeat;
    this.session = new WorldSessionRuntime({
      invalidatePendingLoads,
      isCancellation,
    });
    this.environment = null;
  }

  get switching() { return this.session.switching; }

  setEnvironment(runtime) {
    this.environment = runtime;
  }

  ensureLoadActive(signal) {
    if (signal?.aborted) {
      throw this.createCancellationError();
    }
  }

  async load(world, signal = null) {
    this.ensureLoadActive(signal);
    await this.clear();
    const result = await this.loadWorldAssets(world, signal);
    this.ensureLoadActive(signal);
    this.activeWorld = world;
    this.raycastIndex = result.loaded.raycastIndex;
    this.water = result.loaded.water;
    this.spawn = world.spawn.clone();
    this.spawnYaw = world.yaw;
    await this.initializeWorld({
      world,
      environment: result.environment,
      loaded: result.loaded,
      signal,
    });
    this.ensureLoadActive(signal);
  }

  async clear() {
    await this.clearWorld({
      world: this.activeWorld,
      raycastIndex: this.raycastIndex,
      water: this.water,
    });
    this.raycastIndex = null;
    this.water = null;
  }

  async select(world, options = {}) {
    this.leaveRaceWorld(world);
    const {
      transition = null,
      controllerState = undefined,
      serverDepartureCommitted = false,
      debugSpawn = null,
      persistLocation = true,
    } = options;
    if (!this.switching && this.hasPendingTransition() && !transition) {
      return false;
    }
    const controller = this.getController();
    const travelState = controllerState === undefined
      ? controller?.captureTravelState() || null
      : controllerState;
    if (!this.switching && this.ready && world === this.activeWorld) {
      this.exitCinemaSeat();
      const position = debugSpawn
        ? this.vectorFromArray(debugSpawn.position)
        : this.spawn;
      this.resetPlayer(position, debugSpawn?.yaw ?? this.spawnYaw, {
        persist: persistLocation,
      });
      controller?.restoreTravelState(travelState);
      this.syncCombat();
      if (persistLocation) this.persistLocation();
      this.markPresenceDirty();
      return true;
    }
    return this.session.run({
      onQueue: () => {
        this.collapseSidebar();
        this.beginLoading(world);
      },
      onStart: () => {
        this.collapseSidebar();
        if (!serverDepartureCommitted) this.leaveServerWorld();
        this.clearRemotePlayers();
        this.ready = false;
        this.clearCollisionDebug();
        this.beginLoading(world);
      },
      load: async (signal) => {
        await this.waitUntilLoadingPainted(signal);
        this.ensureLoadActive(signal);
        await this.load(world, signal);
        this.ensureLoadActive(signal);
        await this.ensurePlayerLoaded(world, signal);
        this.ensureLoadActive(signal);
        const transitionSpawn = transition?.destination.browserSpawn;
        const selectedSpawn = debugSpawn ?? transitionSpawn;
        this.resetPlayer(
          selectedSpawn
            ? this.vectorFromArray(selectedSpawn.position)
            : this.spawn,
          selectedSpawn?.yaw ?? this.spawnYaw,
          { persist: persistLocation },
        );
        this.ready = true;
        this.syncAnimationMenu();
        this.markPresenceDirty();
        this.advanceLoading();
        await this.finishLoading(signal);
        this.ensureLoadActive(signal);
        this.syncCombat();
        return true;
      },
      onError: (error) => {
        console.error(error);
        this.showLoadingError("This area couldn’t be loaded.\nPlease try again.");
      },
      onFinally: ({ cancelled, failed }) => {
        this.getController()?.restoreTravelState(travelState);
        if (!cancelled && !failed && persistLocation) this.persistLocation();
      },
    });
  }

  async initialize(world, {
    beforeLoad = null,
    savedPosition = null,
    savedYaw = 0,
    persistLocation = true,
  } = {}) {
    return this.session.run({
      onStart: () => { this.ready = false; },
      load: async (signal) => {
        await beforeLoad?.();
        this.ensureLoadActive(signal);
        this.beginLoading(world);
        await this.load(world, signal);
        this.ensureLoadActive(signal);
        await this.ensurePlayerLoaded(world, signal);
        this.ensureLoadActive(signal);
        if (savedPosition) {
          this.getController()?.reset(savedPosition, savedYaw);
        }
        this.ready = true;
        this.syncAnimationMenu();
        this.advanceLoading();
        await this.finishLoading(signal);
        this.ensureLoadActive(signal);
        this.syncCombat();
        if (persistLocation) this.persistLocation();
        return true;
      },
      onError: error => { throw error; },
    });
  }

  cancel() {
    this.ready = false;
    this.session.cancel();
  }
}
