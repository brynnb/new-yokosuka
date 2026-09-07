export const ARCADE_PERFORMANCE_LEVEL = Object.freeze({
  FULL: 0,
  STATIC_SCREENS: 1,
  MINIMAL_LIGHTS: 2,
});

const ARCADE_PERFORMANCE_LEVEL_NAME = Object.freeze([
  "Full",
  "Static screens",
  "Minimal lights",
]);

export class ArcadePerformanceController {
  constructor({
    degradeFps = 28,
    recoverFps = 50,
    sampleSeconds = 2,
    settleSeconds = 4,
    recoverySeconds = 10,
  } = {}) {
    this.degradeFps = degradeFps;
    this.recoverFps = recoverFps;
    this.sampleSeconds = sampleSeconds;
    this.settleSeconds = settleSeconds;
    this.recoverySeconds = recoverySeconds;
    this.level = ARCADE_PERFORMANCE_LEVEL.FULL;
    this.active = false;
    this.sampleElapsed = 0;
    this.sampleFrames = 0;
    this.timeSinceChange = 0;
    this.recoveryElapsed = 0;
    this.lastFps = null;
    this.lastReason = "initial";
  }

  get videosEnabled() {
    return this.level < ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS;
  }

  get lightsEnabled() {
    return this.level < ARCADE_PERFORMANCE_LEVEL.MINIMAL_LIGHTS;
  }

  resetSamples() {
    this.sampleElapsed = 0;
    this.sampleFrames = 0;
    this.recoveryElapsed = 0;
  }

  result(reason, fps = null) {
    this.lastReason = reason;
    if (Number.isFinite(fps)) this.lastFps = fps;
    return {
      reason,
      fps,
      level: this.level,
      videosEnabled: this.videosEnabled,
      lightsEnabled: this.lightsEnabled,
    };
  }

  setInactive() {
    const changed = this.level !== ARCADE_PERFORMANCE_LEVEL.FULL;
    this.active = false;
    this.level = ARCADE_PERFORMANCE_LEVEL.FULL;
    this.timeSinceChange = 0;
    this.resetSamples();
    return changed ? this.result("reset") : null;
  }

  getDebugState() {
    return {
      active: this.active,
      level: this.level,
      levelName: ARCADE_PERFORMANCE_LEVEL_NAME[this.level] || "Unknown",
      videosEnabled: this.videosEnabled,
      lightsEnabled: this.lightsEnabled,
      lastFps: this.lastFps,
      lastReason: this.lastReason,
    };
  }

  observeFrame(elapsedSeconds, { active = true } = {}) {
    if (!active) return this.setInactive();
    if (!this.active) {
      this.active = true;
      this.timeSinceChange = 0;
      this.resetSamples();
    }

    const elapsed = Number(elapsedSeconds);
    if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 0.25) {
      this.resetSamples();
      return null;
    }

    this.timeSinceChange += elapsed;
    this.sampleElapsed += elapsed;
    this.sampleFrames += 1;
    if (this.sampleElapsed < this.sampleSeconds) return null;

    const measuredSeconds = this.sampleElapsed;
    const fps = this.sampleFrames / measuredSeconds;
    this.lastFps = fps;
    this.sampleElapsed = 0;
    this.sampleFrames = 0;

    if (fps < this.degradeFps) {
      this.recoveryElapsed = 0;
      if (
        this.level < ARCADE_PERFORMANCE_LEVEL.MINIMAL_LIGHTS
        && (
          this.level === ARCADE_PERFORMANCE_LEVEL.FULL
          || this.timeSinceChange >= this.settleSeconds
        )
      ) {
        this.level += 1;
        this.timeSinceChange = 0;
        return this.result(
          this.level === ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS
            ? "disable-videos"
            : "disable-lights",
          fps,
        );
      }
      return null;
    }

    if (fps < this.recoverFps) {
      this.recoveryElapsed = 0;
      return null;
    }

    if (this.level === ARCADE_PERFORMANCE_LEVEL.FULL) return null;
    this.recoveryElapsed += measuredSeconds;
    if (this.recoveryElapsed < this.recoverySeconds) return null;

    this.level -= 1;
    this.timeSinceChange = 0;
    this.resetSamples();
    return this.result(
      this.level === ARCADE_PERFORMANCE_LEVEL.STATIC_SCREENS
        ? "restore-lights"
        : "restore-videos",
      fps,
    );
  }
}
