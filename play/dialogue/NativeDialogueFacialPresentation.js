import {
  GenericFaceMorphController,
  resolveGenericFaceMorph,
} from "../../src/GenericFaceMorph.js";
import {
  NATIVE_LIP_SYNC_FRAME_RATE,
  NativeLipSyncCuePlayer,
} from "../../src/NativeLipSync.js";

export class NativeDialogueFacialPresentation {
  constructor({ scheduledActors } = {}) {
    if (typeof scheduledActors?.dialogueActorModel !== "function") {
      throw new TypeError("dialogue faces require scheduled actor models");
    }
    this.scheduledActors = scheduledActors;
    this.player = new NativeLipSyncCuePlayer();
    this.active = null;
    this.accumulator = 0;
  }

  start(message) {
    this.stop();
    const actorCode = String(
      message?.nativeParticipantCode || message?.speakerId || "",
    ).toUpperCase();
    const model = this.scheduledActors.dialogueActorModel(actorCode);
    const binding = resolveGenericFaceMorph(model);
    if (!binding || !message?.lipSync) return false;
    const controller = new GenericFaceMorphController(binding);
    if (!this.player.start(message.lipSync)) return false;
    const state = this.player.snapshot();
    controller.transition(state.genericOpen, state.transitionTicksRemaining);
    this.active = {
      message,
      model,
      controller,
      cueIndex: state.cueIndex,
      prefetched: state.prefetched,
    };
    this.accumulator = 0;
    return true;
  }

  update(deltaSeconds) {
    if (!this.active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return false;
    }
    this.accumulator += Math.min(deltaSeconds, 0.25) * NATIVE_LIP_SYNC_FRAME_RATE;
    while (this.active && this.accumulator >= 1) {
      this.accumulator -= 1;
      this.active.controller.advanceTick();
      const state = this.player.advance(1);
      if (
        state.cueIndex !== this.active.cueIndex
        || state.prefetched !== this.active.prefetched
      ) {
        this.active.cueIndex = state.cueIndex;
        this.active.prefetched = state.prefetched;
        this.active.controller.transition(
          state.genericOpen,
          state.transitionTicksRemaining,
        );
      }
    }
    return true;
  }

  endMessage(message) {
    if (this.active?.message !== message) return false;
    this.stop();
    return true;
  }

  stop() {
    this.active?.controller.reset();
    this.active = null;
    this.accumulator = 0;
    this.player.stop();
  }
}

export function createNativeDialogueFacialPresentation(options) {
  return new NativeDialogueFacialPresentation(options);
}
