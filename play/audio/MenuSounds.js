import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import {
  applyMediaElementAudio,
  setMediaElementMuted,
} from "./MediaElementAudio.js";

const SOUND_URLS = Object.freeze({
  blocked: "/audio/menu/blocked.ogg",
  changeValue: "/audio/menu/changevalue.ogg",
  changeValueQuiet: "/audio/menu/changevaluequiet.ogg",
  confirm: "/audio/menu/select.ogg",
  move: "/audio/menu/selectchange.ogg",
  pageBack: "/audio/menu/pageturnback.ogg",
  pageForward: "/audio/menu/pageturnforward.ogg",
  success: "/audio/menu/success.ogg",
});
export class MenuSounds {
  constructor({
    audioFactory = (source) => createGameAudio(source),
    preferences = audioPreferences,
    volume = null,
  } = {}) {
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.volume = volume;
    this.activeAudio = new Set();
    this.unsubscribe = preferences.subscribe?.((state) => {
      const muted = state.masterMuted || state.effectsMuted;
      for (const audio of this.activeAudio) setMediaElementMuted(audio, muted);
    }) || null;
  }

  move() {
    this.#play(SOUND_URLS.move);
  }

  blocked() {
    this.#play(SOUND_URLS.blocked);
  }

  confirm() {
    this.#play(SOUND_URLS.confirm);
  }

  changeValue() {
    this.#play(SOUND_URLS.changeValue);
  }

  changeValueQuiet() {
    this.#play(SOUND_URLS.changeValueQuiet);
  }

  changeCharacter() {
    this.changeValueQuiet();
  }

  pageBack() {
    this.#play(SOUND_URLS.pageBack);
  }

  pageForward() {
    this.#play(SOUND_URLS.pageForward);
  }

  success() {
    this.#play(SOUND_URLS.success);
  }

  #play(source) {
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return;
    const audio = this.audioFactory(source);
    applyMediaElementAudio(audio, {
      muted: false,
      volume: (this.volume ?? effectiveEffectsVolume(state))
        * (state.overallVolume ?? 1),
    });
    this.activeAudio.add(audio);
    const release = () => this.activeAudio.delete(audio);
    audio.addEventListener?.("ended", release, { once: true });
    audio.addEventListener?.("error", release, { once: true });
    const playback = audio.play();
    playback?.catch?.(() => {
      release();
      // Interface sounds should never interrupt the menu flow.
    });
  }
}
