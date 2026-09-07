import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import {
  applyMediaElementAudio,
  setMediaElementMuted,
} from "./MediaElementAudio.js";

const IMPACT_SOURCE = "/audio/pool/ball-impact.webm";
const POCKET_SOURCE = "/audio/pool/ball-pocket.webm";
const IMPACT_INTERVAL_MS = 35;

export class PoolSounds {
  constructor({
    audioFactory = (source) => createGameAudio(source),
    preferences = audioPreferences,
    now = () => performance.now(),
  } = {}) {
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.now = now;
    this.activeAudio = new Set();
    this.lastImpactAt = Number.NEGATIVE_INFINITY;
    this.unsubscribe = preferences.subscribe?.((state) => {
      const muted = state.masterMuted || state.effectsMuted;
      for (const audio of this.activeAudio) setMediaElementMuted(audio, muted);
    }) || null;
  }

  impact(speed = 1) {
    const timestamp = this.now();
    if (timestamp - this.lastImpactAt < IMPACT_INTERVAL_MS) return false;
    this.lastImpactAt = timestamp;
    return this.#play(IMPACT_SOURCE, Math.min(1, Math.max(0.18, speed / 3)));
  }

  pocket() {
    return this.#play(POCKET_SOURCE, 1);
  }

  dispose() {
    for (const audio of this.activeAudio) audio.pause?.();
    this.activeAudio.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  #play(source, gain) {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return false;
    const audio = this.audioFactory(source);
    applyMediaElementAudio(audio, {
      muted: false,
      volume: effectiveEffectsVolume(state)
        * (state.overallVolume ?? 1)
        * gain,
    });
    this.activeAudio.add(audio);
    const release = () => this.activeAudio.delete(audio);
    audio.addEventListener?.("ended", release, { once: true });
    audio.addEventListener?.("error", release, { once: true });
    const playback = audio.play();
    playback?.catch?.(release);
    return true;
  }
}
