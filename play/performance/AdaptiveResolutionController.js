const DEFAULT_RENDER_PIXEL_RATIOS = Object.freeze([
  2,
  1.5,
  1.25,
  1,
  0.8,
]);

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function adaptiveRenderPixelRatios(
  devicePixelRatio,
  maximumPixelRatio = 2,
  candidates = DEFAULT_RENDER_PIXEL_RATIOS,
) {
  const maximum = Math.min(
    finitePositive(maximumPixelRatio, 2),
    Math.max(1, finitePositive(devicePixelRatio, 1)),
  );
  const ratios = [maximum];
  for (const candidate of candidates) {
    const ratio = finitePositive(candidate, 0);
    if (ratio <= 0 || ratio >= maximum - 0.001) continue;
    ratios.push(ratio);
  }
  return [...new Set(ratios.map((ratio) => Number(ratio.toFixed(3))))];
}

export class AdaptiveResolutionController {
  constructor({
    devicePixelRatio = 1,
    maximumPixelRatio = 2,
    emergencyFps = 20,
    reduceFps = 45,
    recoverFps = 55,
    sampleSeconds = 2,
    emergencySampleSeconds = 1,
    recoverySeconds = 10,
    minimumUsefulGainFps = 1,
    minimumUsefulGainRatio = 0.08,
  } = {}) {
    this.maximumPixelRatio = maximumPixelRatio;
    this.emergencyFps = emergencyFps;
    this.reduceFps = reduceFps;
    this.recoverFps = recoverFps;
    this.sampleSeconds = sampleSeconds;
    this.emergencySampleSeconds = emergencySampleSeconds;
    this.recoverySeconds = recoverySeconds;
    this.minimumUsefulGainFps = minimumUsefulGainFps;
    this.minimumUsefulGainRatio = minimumUsefulGainRatio;
    this.levels = adaptiveRenderPixelRatios(
      devicePixelRatio,
      maximumPixelRatio,
    );
    this.levelIndex = 0;
    this.sampleElapsed = 0;
    this.sampleFrames = 0;
    this.recoveryElapsed = 0;
    this.reductionBlocked = false;
    this.pendingTrial = null;
  }

  get renderPixelRatio() {
    return this.levels[this.levelIndex] ?? 1;
  }

  get hardwareScalingLevel() {
    return 1 / this.renderPixelRatio;
  }

  updateDevicePixelRatio(devicePixelRatio) {
    const previousRatio = this.renderPixelRatio;
    const wasFullQuality = this.levelIndex === 0;
    this.levels = adaptiveRenderPixelRatios(
      devicePixelRatio,
      this.maximumPixelRatio,
    );
    if (wasFullQuality) {
      this.levelIndex = 0;
      return;
    }
    const preservedIndex = this.levels.findIndex(
      (ratio) => ratio <= previousRatio + 0.001,
    );
    this.levelIndex = preservedIndex >= 0
      ? preservedIndex
      : this.levels.length - 1;
  }

  setMaximumPixelRatio(maximumPixelRatio, devicePixelRatio) {
    this.maximumPixelRatio = finitePositive(maximumPixelRatio, 2);
    this.updateDevicePixelRatio(devicePixelRatio);
    this.levelIndex = 0;
    this.resetSamples();
    this.pendingTrial = null;
    this.reductionBlocked = false;
  }

  resetSamples() {
    this.sampleElapsed = 0;
    this.sampleFrames = 0;
    this.recoveryElapsed = 0;
  }

  setLevelIndex(levelIndex) {
    const nextIndex = Math.max(
      0,
      Math.min(this.levels.length - 1, levelIndex),
    );
    if (nextIndex === this.levelIndex) return false;
    this.levelIndex = nextIndex;
    this.resetSamples();
    return true;
  }

  result(reason, fps) {
    return {
      reason,
      fps,
      renderPixelRatio: this.renderPixelRatio,
      hardwareScalingLevel: this.hardwareScalingLevel,
    };
  }

  observeFrame(elapsedSeconds, { active = true } = {}) {
    const elapsed = Number(elapsedSeconds);
    if (!active) {
      this.resetSamples();
      this.pendingTrial = null;
      this.reductionBlocked = false;
      return null;
    }
    if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 0.25) {
      this.resetSamples();
      return null;
    }

    this.sampleElapsed += elapsed;
    this.sampleFrames += 1;
    const currentFps = this.sampleFrames / this.sampleElapsed;
    const emergency = (
      this.sampleElapsed >= this.emergencySampleSeconds
      && currentFps < this.emergencyFps
    );
    if (!emergency && this.sampleElapsed < this.sampleSeconds) return null;

    const fps = currentFps;
    const measuredSeconds = this.sampleElapsed;
    this.sampleElapsed = 0;
    this.sampleFrames = 0;

    if (this.pendingTrial) {
      const trial = this.pendingTrial;
      this.pendingTrial = null;
      const usefulGain = Math.max(
        this.minimumUsefulGainFps,
        trial.previousFps * this.minimumUsefulGainRatio,
      );
      if (fps < trial.previousFps + usefulGain) {
        this.setLevelIndex(trial.previousLevelIndex);
        this.reductionBlocked = true;
        return this.result("rollback-ineffective", fps);
      }
    }

    if (fps >= this.recoverFps) {
      this.recoveryElapsed += measuredSeconds;
      if (this.recoveryElapsed >= this.recoverySeconds) {
        this.reductionBlocked = false;
      }
      if (
        this.recoveryElapsed >= this.recoverySeconds
        && this.levelIndex > 0
      ) {
        this.setLevelIndex(this.levelIndex - 1);
        return this.result("recover", fps);
      }
      return null;
    }
    this.recoveryElapsed = 0;

    if (
      fps >= this.reduceFps
      || this.levelIndex >= this.levels.length - 1
      || this.reductionBlocked
    ) {
      return null;
    }

    const previousLevelIndex = this.levelIndex;
    this.setLevelIndex(previousLevelIndex + 1);
    this.pendingTrial = {
      previousFps: fps,
      previousLevelIndex,
    };
    return this.result(emergency ? "emergency-reduce" : "reduce", fps);
  }
}
