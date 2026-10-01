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
    this.active = { owner, elements: new Set(), cues: new Set(), frame: 0,
      paused: false, seeking: false };
    return true;
  }

  play(owner, command) {
    if (this.active?.owner !== owner || !command?.audio) return false;
    const kind = command.audio.kind;
    if (kind !== "voice" && kind !== "sound") return false;
    const session = this.active;
    if (command.audio.stop === true) {
      for (const record of [...this.active.elements]) {
        if (record.kind !== kind) continue;
        record.release?.();
      }
      for (const cue of session.cues) {
        if (cue.command.audio.kind !== kind) continue;
        session.cues.delete(cue);
        if (kind === "voice") this.voicePresentation?.endVoice(owner, cue);
      }
      return true;
    }
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
    if (assetUrls.length === 0 && command.audio.silent !== true) return false;
    const cue = { command, startFrame: session.frame, records: new Set(),
      speakerId: String(command.audio.speakerId || command.speakerId || command.actorTag || "").toUpperCase(),
      get positionSeconds() {
        const record = this.records.values().next().value;
        return session.seeking && record
          ? record.pendingOffset + (session.frame - record.startFrame) / 30
          : !record ? (session.frame - this.startFrame) / 30
          : record.pendingOffset ?? record.audio.currentTime ?? 0;
      } };
    session.cues.add(cue);
    if (kind === "voice" && !session.seeking) this.voicePresentation?.play(owner, cue);
    for (const assetUrl of assetUrls) {
      const audio = this.audioFactory(assetUrl);
      const record = { audio, kind, command, cue, session, released: false, release: null,
        playRevision: 0, startFrame: session.frame, pendingOffset: session.seeking ? 0 : null };
      session.elements.add(record);
      cue.records.add(record);
      const release = () => {
        if (record.released) return;
        record.released = true;
        clearTimeout(record.metadataTimeout);
        audio.removeEventListener?.("loadedmetadata", record.metadataReady);
        audio.removeEventListener?.("ended", release);
        audio.removeEventListener?.("error", record.onError);
        audio.pause?.();
        session.elements.delete(record);
        cue.records.delete(record);
        if (kind === "voice") this.dialogueAudio.detach(audio);
        if (cue.records.size === 0) {
          session.cues.delete(cue);
          if (kind === "voice" && this.active === session) this.voicePresentation?.endVoice(owner, cue);
        }
      };
      record.release = release;
      record.onError = () => {
        if (record.released) return;
        console.warn("[Cutscene audio] resource failed", command.audio.sourcePath || assetUrl, audio.error?.code);
        release();
      };
      audio.addEventListener?.("ended", release, { once: true });
      audio.addEventListener?.("error", record.onError, { once: true });
      if (kind === "voice") this.dialogueAudio.attach(audio);
      else this.#applySoundVolume(audio, state);
      if (!session.paused && !session.seeking) this.#playRecord(record);
    }
    return true;
  }

  advanceFrame(owner) {
    const session = this.active;
    if (session?.owner !== owner) return false;
    session.frame += 1;
    for (const cue of session.cues) {
      if (cue.command.audio.silent && cue.positionSeconds >= (cue.command.durationSeconds || 0)) {
        session.cues.delete(cue);
        this.voicePresentation?.endVoice(owner, cue);
      }
    }
    return true;
  }

  voiceCues() {
    return new Map([...(this.active?.cues || [])]
      .filter(cue => cue.command.audio.kind === "voice")
      .map(cue => [cue.speakerId, cue]));
  }

  setSeeking(owner, seeking) {
    const session = this.active;
    if (session?.owner !== owner) return false;
    if (session.seeking === Boolean(seeking)) return true;
    session.seeking = Boolean(seeking);
    if (session.seeking) {
      for (const record of session.elements) {
        record.playRevision += 1;
        record.audio.pause?.();
        record.pendingOffset = record.pendingOffset ?? record.audio.currentTime ?? 0;
        record.startFrame = session.frame;
      }
    } else {
      // Advance existing clips and seek newly encountered clips without ever
      // playing the intervening cues in a burst. Metadata bounds the offset.
      for (const record of [...session.elements]) {
        record.pendingOffset += (session.frame - record.startFrame) / 30;
        this.#resumeAtOffset(record);
      }
      for (const cue of session.cues) {
        if (cue.command.audio.kind === "voice") this.voicePresentation?.play(owner, cue);
      }
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
      if (next) { record.playRevision += 1; record.audio.pause?.(); }
      else if (!active.seeking && record.pendingOffset === null) this.#playRecord(record);
    }
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    for (const record of [...this.active.elements]) record.release();
    this.active.cues.clear();
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
    if (record.released || this.active !== record.session
      || record.session.paused || record.session.seeking) return;
    try {
      const revision = ++record.playRevision;
      record.audio.play()?.then?.(() => {
        // A delayed play promise must not resurrect a cancelled/replaced session.
        if (record.released || this.active !== record.session
          || record.session.paused || record.session.seeking) record.audio.pause?.();
      }, error => {
        if (revision !== record.playRevision || record.released
          || record.session.paused || record.session.seeking) return;
        record.release();
        console.warn("[Cutscene audio] playback failed", record.command.audio.sourcePath, error);
      });
    } catch (error) {
      record.release();
      throw error;
    }
  }

  #resumeAtOffset(record) {
    const resume = () => {
      if (record.released || this.active !== record.session || record.session.seeking) return;
      const { audio } = record;
      if (!Number.isFinite(audio.duration)) return;
      clearTimeout(record.metadataTimeout);
      audio.removeEventListener?.("loadedmetadata", resume);
      if (record.pendingOffset >= audio.duration) { record.release(); return; }
      audio.currentTime = record.pendingOffset;
      record.pendingOffset = null;
      if (!record.session.paused) this.#playRecord(record);
    };
    clearTimeout(record.metadataTimeout);
    record.audio.removeEventListener?.("loadedmetadata", record.metadataReady);
    record.metadataReady = resume;
    if (Number.isFinite(record.audio.duration)) { resume(); return; }
    record.audio.addEventListener?.("loadedmetadata", resume);
    record.audio.preload = "auto";
    record.audio.load?.();
    record.metadataTimeout = setTimeout(() => {
      console.warn("[Cutscene audio] seek metadata timed out", record.command.audio.sourcePath);
      record.release();
    }, 10_000);
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
