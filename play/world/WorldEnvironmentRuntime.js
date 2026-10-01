export class WorldEnvironmentRuntime {
  constructor({
    clock,
    weather,
    sceneState,
    getWorld,
    getReady,
    isSwitching,
    getWater,
    getMeshes,
    getCutsceneLightingPreset,
    getCutscenePrecipitation = () => null,
    dailyMusicCue,
    setWorldDate,
    updateDebugClock,
    showDayRollover,
    getMovementLocked,
    setMovementLocked,
    updateSceneLighting,
    applyTimeOfDay,
    updateModelVisibility,
    updateMapLayer,
    applyTimeOfDayLighting,
    applyWaterTimeOfDay,
  }) {
    this.clock = clock;
    this.weather = weather;
    this.sceneState = sceneState;
    this.getWorld = getWorld;
    this.getReady = getReady;
    this.isSwitching = isSwitching;
    this.getWater = getWater;
    this.getMeshes = getMeshes;
    this.getCutsceneLightingPreset = getCutsceneLightingPreset;
    this.getCutscenePrecipitation = getCutscenePrecipitation;
    this.dailyMusicCue = dailyMusicCue;
    this.setWorldDate = setWorldDate;
    this.updateDebugClock = updateDebugClock;
    this.showDayRolloverOverlay = showDayRollover;
    this.getMovementLocked = getMovementLocked;
    this.setMovementLocked = setMovementLocked;
    this.updateSceneLighting = updateSceneLighting;
    this.applyTimeOfDay = applyTimeOfDay;
    this.updateModelVisibility = updateModelVisibility;
    this.updateMapLayer = updateMapLayer;
    this.applyTimeOfDayLighting = applyTimeOfDayLighting;
    this.applyWaterTimeOfDay = applyWaterTimeOfDay;
    this.lastCalendarDay = null;
    this.rolloverController = null;
    this.timer = null;
    this.isolatedStageOwners = new Set();
    this.isolatedSky = null;
  }

  start(schedule = window.setInterval.bind(window)) {
    if (this.timer !== null) return;
    this.timer = schedule(() => this.synchronize(), 250);
  }

  gameDate() { return this.clock.gameDate(); }
  serverWallTimeMs() { return this.clock.serverWallTimeMs(); }
  dayLengthMs() { return this.clock.worldState?.dayLengthMs; }
  lightingState(world = this.getWorld()) { return this.clock.lightingState(world); }
  setDebugHour(hour) { this.clock.setDebugHour(hour); }
  setServerGameHour(hour) { return this.clock.setServerGameHour(hour); }
  setServerState(state, receivedAtMs = Date.now()) {
    this.clock.setWorldState(state, receivedAtMs);
  }

  capture(world) {
    const environment = this.clock.environmentState(world);
    const seasonChanged =
      this.sceneState.currentSeason !== environment.seasonIndex;
    const weatherChanged = (
      this.sceneState.currentWeather !== environment.weather
      || this.sceneState.currentWeatherIndex !== environment.weatherIndex
    );
    this.sceneState.currentSeason = environment.seasonIndex;
    this.sceneState.currentWeather = environment.weather;
    this.sceneState.currentWeatherIndex = environment.weatherIndex;
    return { environment, seasonChanged, weatherChanged };
  }

  async showDayRollover(date) {
    if (this.rolloverController || !this.getReady() || this.isSwitching()) return;
    const controller = new AbortController();
    this.rolloverController = controller;
    const movementWasLocked = this.getMovementLocked();
    this.setMovementLocked(true);
    try {
      await this.showDayRolloverOverlay(
        this.getWorld(),
        date,
        controller.signal,
      );
    } finally {
      if (this.rolloverController === controller) {
        this.rolloverController = null;
        this.setMovementLocked(movementWasLocked);
      }
    }
  }

  detectDayRollover(serverDate) {
    const nextDay = Date.UTC(
      serverDate.getUTCFullYear(),
      serverDate.getUTCMonth(),
      serverDate.getUTCDate(),
    );
    const previousDay = this.lastCalendarDay;
    this.lastCalendarDay = nextDay;
    if (previousDay !== null && nextDay > previousDay) {
      void this.showDayRollover(serverDate);
    }
  }

  acquireIsolatedStage() {
    const owner = {};
    this.isolatedStageOwners.add(owner);
    if (this.isolatedStageOwners.size === 1) {
      const sky = this.sceneState.currentSkybox;
      this.isolatedSky = sky ? { sky, enabled: sky.isEnabled() } : null;
      sky?.setEnabled(false);
      this.weather.apply("clear");
    }
    return () => {
      if (!this.isolatedStageOwners.delete(owner) || this.isolatedStageOwners.size) return;
      const snapshot = this.isolatedSky;
      this.isolatedSky = null;
      if (snapshot && !snapshot.sky.isDisposed()) snapshot.sky.setEnabled(snapshot.enabled);
      // Resume from the current server environment, not a stale weather/time
      // snapshot. The game clock itself keeps running throughout the dream.
      this.synchronize();
    };
  }

  synchronize({ applyScene = true } = {}) {
    const world = this.getWorld();
    const { serverDate, date, blend: clockBlend } =
      this.clock.lightingState(world);
    const cutscenePreset = this.getCutsceneLightingPreset();
    const lightingBlend = cutscenePreset === null
      ? clockBlend
      : {
        fromIndex: cutscenePreset,
        toIndex: cutscenePreset,
        progress: 0,
        presetIndex: cutscenePreset,
      };
    this.detectDayRollover(serverDate);
    this.dailyMusicCue.update(date, world.id);
    this.setWorldDate(date);
    this.updateDebugClock({ serverDate, date, clock: this.clock });

    // An isolated stage owns its backdrop and resident-root visibility. Do not
    // let the periodic world updater recreate precipitation/sky or reveal map
    // variants. Leave the applied-state cache untouched so release catches up.
    if (this.isolatedStageOwners.size) return false;

    const nextTimeOfDay = lightingBlend.presetIndex;
    const presetChanged = this.sceneState.currentTimeOfDay !== nextTimeOfDay;
    this.sceneState.currentTimeOfDay = nextTimeOfDay;
    const { environment, seasonChanged, weatherChanged } = this.capture(world);
    if (applyScene && this.getMeshes().length > 0) {
      this.updateSceneLighting();
      if (presetChanged) this.applyTimeOfDay(nextTimeOfDay);
      if (presetChanged || seasonChanged || weatherChanged) {
        this.updateModelVisibility();
      }
      if (seasonChanged) this.weather.setOccluders(this.getMeshes());
      // Layer scripts run after general variants so environment changes cannot
      // reveal a model intentionally hidden by the room program.
      this.updateMapLayer(date, presetChanged || seasonChanged);
      // Precipitation is separate from surface variants: a later shot can
      // retain settled snow on the ground without inheriting falling flakes.
      this.weather.apply(this.getCutscenePrecipitation() ?? environment.precipitation);
      this.applyTimeOfDayLighting(lightingBlend);
      this.applyWaterTimeOfDay(this.getWater(), lightingBlend);
    }
    return presetChanged || seasonChanged || weatherChanged;
  }

  async fetchInitial(options) {
    if (!await this.clock.fetchInitial(options)) return false;
    this.synchronize({ applyScene: false });
    return true;
  }

  abortRollover() {
    this.rolloverController?.abort();
  }

  clearWeather() { this.weather.clear(); }
  setWeatherOccluders(meshes) { this.weather.setOccluders(meshes); }
  applyWeather(precipitation) { this.weather.apply(precipitation); }

  dispose(clearInterval = window.clearInterval.bind(window)) {
    this.abortRollover();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
