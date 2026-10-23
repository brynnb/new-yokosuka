import { GenericFaceMorphController } from "./GenericFaceMorph.js";
import { NativeLipSyncCuePlayer } from "./NativeLipSync.js";

/** Original SRF timing driving the body's authored closed/open mouth targets. */
export class NativeGenericFaceSpeech {
  constructor(binding) {
    this.controller = new GenericFaceMorphController(binding);
    this.player = new NativeLipSyncCuePlayer();
    this.frame = 0;
    this.cueIndex = -1;
    this.prefetched = false;
  }

  start(descriptor) {
    this.stop();
    const started = this.player.start(descriptor);
    if (started) this.#syncCue();
    return started;
  }

  advance(frames = 1) {
    if (!Number.isInteger(frames) || frames < 0) {
      throw new TypeError("generic speech frames must be a non-negative integer");
    }
    for (let index = 0; index < frames; index += 1) {
      this.controller.advanceTick();
      this.player.advance(1);
      this.#syncCue();
      this.frame += 1;
    }
  }

  seekFrame(frame) {
    if (!Number.isInteger(frame) || frame < 0) {
      throw new TypeError("generic speech frame must be a non-negative integer");
    }
    // Reconstruct the morph from its source cue on a seek; do not interpolate
    // backwards from whatever pose happened to be visible in the previous shot.
    if (frame < this.frame) {
      const descriptor = this.player.descriptor;
      if (descriptor) this.start(descriptor);
      else this.stop();
    }
    this.advance(frame - this.frame);
  }

  finish() {
    this.player.stop();
    this.cueIndex = -1;
    this.prefetched = false;
    this.controller.transition(false, 8);
  }

  stop() {
    this.controller.reset();
    this.player.stop();
    this.frame = 0;
    this.cueIndex = -1;
    this.prefetched = false;
  }

  #syncCue() {
    const state = this.player.snapshot();
    if (state.cueIndex === this.cueIndex && state.prefetched === this.prefetched) return;
    this.cueIndex = state.cueIndex;
    this.prefetched = state.prefetched;
    if (state.transitionTicksRemaining > 0) {
      this.controller.transition(state.genericOpen, state.transitionTicksRemaining);
    }
  }
}
