import { createNativeAseqFrameClock } from "./NativeAseqFrameClock.js";

export class NativeAseqStandaloneActivityRuntime {
  constructor({
    activityRuntime,
    frameRate = 30,
    onStarted = null,
    onComplete = null,
    onStopped = null,
  } = {}) {
    if (!activityRuntime) throw new TypeError("AUTH activity runtime is required");
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
      throw new RangeError("AUTH standalone frame rate must be positive");
    }
    this.activityRuntime = activityRuntime;
    this.clock = createNativeAseqFrameClock({ frameRate });
    this.onStarted = onStarted;
    this.onComplete = onComplete;
    this.onStopped = onStopped;
    this.active = null;
  }

  async start({ id, activity } = {}) {
    if (!id || !activity) throw new TypeError("AUTH standalone scene is required");
    if (this.active) this.stop("restarted");
    const started = await this.activityRuntime.startActivity(activity);
    this.active = {
      id,
      activity: { ...started, slot: activity.slot },
      frame: 0,
    };
    this.clock.reset();
    if (this.onStarted?.(this.active.activity) === false) {
      this.#finish("start-rejected");
      throw new Error(`AUTH standalone scene ${id} start was rejected`);
    }
    return true;
  }

  update(deltaSeconds) {
    const active = this.active;
    if (!active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return false;
    }
    const nativeFrames = this.clock.consume(deltaSeconds);
    for (
      let nativeFrame = 0;
      this.active === active && nativeFrame < nativeFrames;
      nativeFrame += 1
    ) {
      const nextFrame = active.frame + 1;
      if (nextFrame > active.activity.durationFrames) {
        this.#finish("complete");
        this.onComplete?.(active.id);
        return false;
      }
      const accepted = this.activityRuntime.updateActivity({
        ...active.activity,
        previousFrame: active.frame,
        currentFrame: nextFrame,
      });
      if (accepted !== true) {
        this.active = null;
        this.onStopped?.("presentation-failed", active.id);
        throw new Error(`AUTH standalone scene ${active.id} rejected frame ${nextFrame}`);
      }
      active.frame = nextFrame;
    }
    return true;
  }

  stop(reason = "stopped") {
    const active = this.active;
    if (!active) return true;
    if (!this.#finish(reason)) return false;
    this.onStopped?.(reason, active.id);
    return true;
  }

  #finish(reason) {
    const active = this.active;
    if (!active) return true;
    const accepted = this.activityRuntime.stopActivity({
      reason,
      activity: active.activity,
    });
    if (accepted !== true) return false;
    this.active = null;
    this.clock.reset();
    return true;
  }
}

export function createNativeAseqStandaloneActivityRuntime(options) {
  return new NativeAseqStandaloneActivityRuntime(options);
}
