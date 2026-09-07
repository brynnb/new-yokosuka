import { createGameAudio } from "../audio/MediaElementAudio.js";
import { effectiveEffectsVolume } from "../audio/AudioPreferences.js";
import { applyMediaElementAudio } from "../audio/MediaElementAudio.js";

export class NativeAseqAudioPresentation {
  constructor({
    audioFactory = source => createGameAudio(source),
    preferences,
    dialogueAudio,
    voicePresentation = null,
  } = {}) {
    if (
      typeof audioFactory !== "function"
      || typeof preferences?.getState !== "function"
      || typeof dialogueAudio?.attach !== "function"
      || typeof dialogueAudio?.detach !== "function"
    ) {
      throw new TypeError("AUTH audio presentation requires audio preferences");
    }
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.dialogueAudio = dialogueAudio;
    if (
      voicePresentation
      && ["begin", "play", "endVoice", "end"].some(
        method => typeof voicePresentation[method] !== "function",
      )
    ) {
      throw new TypeError("AUTH voice presentation is incomplete");
    }
    this.voicePresentation = voicePresentation;
    this.active = null;
    this.unsubscribe = preferences.subscribe?.(() => this.#applyPreferences()) || null;
  }

  begin(owner) {
    if (this.active) throw new Error("AUTH audio is already owned");
    if (this.voicePresentation?.begin(owner) !== true && this.voicePresentation) {
      throw new Error("AUTH voice presentation rejected ownership");
    }
    this.active = { owner, elements: new Set(), paused: false };
    return true;
  }

  play(owner, command) {
    if (this.active?.owner !== owner || !command?.audio) return false;
    const kind = command.audio.kind;
    if (kind !== "voice" && kind !== "sound") return false;
    if (kind === "sound" && command.audio.stop === true) {
      for (const record of [...this.active.elements]) {
        if (record.kind !== "sound") continue;
        record.audio.pause?.();
        record.release?.();
      }
      return true;
    }
    if (
      kind === "voice"
      && this.voicePresentation?.play(owner, command) !== true
      && this.voicePresentation
    ) return false;
    if (command.audio.silent === true) return true;
    const state = this.preferences.getState();
    if (
      kind === "sound"
      && (state.masterMuted || state.effectsMuted)
    ) return true;

    const assetUrls = command.audio.assetUrls?.length > 0
      ? command.audio.assetUrls
      : command.audio.assetUrl
        ? [command.audio.assetUrl]
        : [];
    if (assetUrls.length === 0) return false;
    for (const assetUrl of assetUrls) {
      const audio = this.audioFactory(assetUrl);
      const record = { audio, kind, command, released: false, release: null };
      this.active.elements.add(record);
      const release = () => {
        if (record.released) return;
        record.released = true;
        const active = this.active;
        active?.elements.delete(record);
        if (kind === "voice") this.dialogueAudio.detach(audio);
        if (
          kind === "voice"
          && active?.owner === owner
          && ![...active.elements].some(value => value.command === command)
        ) {
          this.voicePresentation?.endVoice(owner, command);
        }
      };
      record.release = release;
      audio.addEventListener?.("ended", release, { once: true });
      audio.addEventListener?.("error", release, { once: true });
      if (kind === "voice") this.dialogueAudio.attach(audio);
      else this.#applySoundVolume(audio, state);
      if (!this.active.paused) this.#playRecord(record);
    }
    return true;
  }

  setPaused(owner, paused) {
    const active = this.active;
    if (active?.owner !== owner) return false;
    const next = Boolean(paused);
    if (active.paused === next) return true;
    active.paused = next;
    for (const record of [...active.elements]) {
      if (next) record.audio.pause?.();
      else this.#playRecord(record);
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    for (const record of this.active.elements) {
      const { audio, kind } = record;
      record.released = true;
      audio.pause?.();
      if (kind === "voice") this.dialogueAudio.detach(audio);
    }
    this.active.elements.clear();
    this.active = null;
    if (this.voicePresentation?.end(owner) !== true && this.voicePresentation) {
      return false;
    }
    return true;
  }

  dispose() {
    if (this.active) this.end(this.active.owner);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  #playRecord(record) {
    try {
      record.audio.play()?.catch?.(record.release);
    } catch (error) {
      record.release();
      throw error;
    }
  }

  #applySoundVolume(audio, state) {
    applyMediaElementAudio(audio, {
      muted: state.masterMuted || state.effectsMuted,
      volume: effectiveEffectsVolume(state) * (state.overallVolume ?? 1),
    });
  }

  #applyPreferences() {
    if (!this.active) return;
    const state = this.preferences.getState();
    for (const { audio, kind } of this.active.elements) {
      if (kind === "sound") this.#applySoundVolume(audio, state);
    }
  }
}

export function createNativeAseqAudioPresentation(options) {
  return new NativeAseqAudioPresentation(options);
}
