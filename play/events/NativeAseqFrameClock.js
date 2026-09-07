export class NativeAseqFrameClock {
  constructor({ frameRate = 30, maximumDeltaSeconds = 0.25 } = {}) {
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
      throw new RangeError("AUTH frame rate must be positive");
    }
    if (!Number.isFinite(maximumDeltaSeconds) || maximumDeltaSeconds <= 0) {
      throw new RangeError("AUTH maximum frame delta must be positive");
    }
    this.frameRate = frameRate;
    this.maximumDeltaSeconds = maximumDeltaSeconds;
    this.accumulator = 0;
  }

  reset() {
    this.accumulator = 0;
  }

  consume(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    this.accumulator += Math.min(
      deltaSeconds,
      this.maximumDeltaSeconds,
    ) * this.frameRate;
    const frames = Math.floor(this.accumulator);
    this.accumulator -= frames;
    return frames;
  }
}

export function createNativeAseqFrameClock(options) {
  return new NativeAseqFrameClock(options);
}
