import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import {
  applyMediaElementAudio,
  setMediaElementMuted,
} from "./MediaElementAudio.js";
import {
  NATIVE_COMBAT_SOUND_CUES,
} from "../data/native-combat-sound-cues.js";

export const COMBAT_SOUND_FRAMES_PER_SECOND = 30;

export class CombatSounds {
  constructor({
    audioFactory = (source) => createGameAudio(source),
    preferences = audioPreferences,
    cueData = NATIVE_COMBAT_SOUND_CUES,
  } = {}) {
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.cueData = cueData;
    this.timelines = new Map();
    this.activeAudio = new Set();
    this.unsubscribe = preferences.subscribe?.((state) => {
      const muted = state.masterMuted || state.effectsMuted;
      for (const audio of this.activeAudio) setMediaElementMuted(audio, muted);
    }) || null;
  }

  start(channel, {
    bank,
    sequence,
  }) {
    const cues = this.cueData.banks?.[bank]?.sequences?.[sequence] || [];
    const timeline = {
      bank,
      sequence,
      frame: 0,
      nextCue: 0,
      cues,
    };
    this.timelines.set(channel, timeline);
    this.#playThrough(timeline, 0);
    return cues.length > 0;
  }

  stop(channel) {
    return this.timelines.delete(channel);
  }

  update(deltaSeconds) {
    const frameDelta = Math.max(0, Number(deltaSeconds) || 0)
      * COMBAT_SOUND_FRAMES_PER_SECOND;
    if (frameDelta <= 0) return;
    for (const timeline of this.timelines.values()) {
      timeline.frame += frameDelta;
      this.#playThrough(timeline, timeline.frame);
    }
  }

  reset() {
    this.timelines.clear();
    for (const audio of this.activeAudio) {
      audio.pause?.();
    }
    this.activeAudio.clear();
  }

  #playThrough(timeline, targetFrame) {
    while (
      timeline.nextCue < timeline.cues.length
      && timeline.cues[timeline.nextCue].frame <= targetFrame
    ) {
      const cue = timeline.cues[timeline.nextCue];
      timeline.nextCue += 1;
      this.#play(cue.commandHex);
    }
  }

  #play(commandHex) {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return;
    const audio = this.audioFactory(
      `/audio/combat/${commandHex.toLowerCase()}.webm`,
    );
    applyMediaElementAudio(audio, {
      muted: false,
      volume: effectiveEffectsVolume(state) * (state.overallVolume ?? 1),
    });
    this.activeAudio.add(audio);
    const release = () => this.activeAudio.delete(audio);
    audio.addEventListener?.("ended", release, { once: true });
    audio.addEventListener?.("error", release, { once: true });
    const playback = audio.play();
    playback?.catch?.(release);
  }
}
