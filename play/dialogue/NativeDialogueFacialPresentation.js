import { resolveGenericFaceMorph } from "../../src/GenericFaceMorph.js";
import { NativeGenericFaceSpeech } from "../../src/NativeGenericFaceSpeech.js";
import { NATIVE_LIP_SYNC_FRAME_RATE } from "../../src/NativeLipSync.js";

export class NativeDialogueFacialPresentation {
  constructor({ scheduledActors } = {}) {
    if (typeof scheduledActors?.dialogueActorModel !== "function") {
      throw new TypeError("dialogue faces require scheduled actor models");
    }
    this.scheduledActors = scheduledActors;
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
    const speech = new NativeGenericFaceSpeech(binding);
    if (!speech.start(message.lipSync)) return false;
    this.active = { message, model, speech };
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
      this.active.speech.advance();
    }
    return true;
  }

  endMessage(message) {
    if (this.active?.message !== message) return false;
    this.stop();
    return true;
  }

  stop() {
    this.active?.speech.stop();
    this.active = null;
    this.accumulator = 0;
  }
}

export function createNativeDialogueFacialPresentation(options) {
  return new NativeDialogueFacialPresentation(options);
}
