import { applyMediaElementAudio } from "./MediaElementAudio.js";

export const DIALOGUE_VOLUME_STORAGE_KEY =
  "new-yokosuka.dialogue-volume";
export const DIALOGUE_MUTED_STORAGE_KEY =
  "new-yokosuka.dialogue-muted";

const DEFAULT_VOLUME = 0.5;

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function savePreference(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Persistent storage is optional.
  }
}

export function readDialogueAudioPreferences(
  storage = globalThis.localStorage,
) {
  let volume = DEFAULT_VOLUME;
  let muted = false;
  try {
    const savedValue = storage?.getItem(DIALOGUE_VOLUME_STORAGE_KEY);
    const savedVolume = Number(savedValue);
    if (savedValue !== null && Number.isFinite(savedVolume)) {
      volume = clampVolume(savedVolume);
    }
    muted = storage?.getItem(DIALOGUE_MUTED_STORAGE_KEY) === "1";
  } catch {
    // Current-session audio remains available without persistent storage.
  }
  return { volume, muted };
}

export class DialogueAudio {
  constructor({
    storage = globalThis.localStorage,
    masterMuted = false,
    overallVolume = 1,
    enabled = true,
  } = {}) {
    const preferences = readDialogueAudioPreferences(storage);
    this.storage = storage;
    this.volume = preferences.volume;
    this.muted = preferences.muted;
    this.enabled = Boolean(enabled);
    this.masterMuted = Boolean(masterMuted);
    this.overallVolume = clampVolume(overallVolume);
    this.audioElements = new Set();
  }

  getState() {
    return {
      volume: this.volume,
      muted: this.muted,
      enabled: this.enabled,
    };
  }

  setVolume(value) {
    this.volume = clampVolume(value);
    savePreference(
      this.storage,
      DIALOGUE_VOLUME_STORAGE_KEY,
      String(this.volume),
    );
    this.apply();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    savePreference(
      this.storage,
      DIALOGUE_MUTED_STORAGE_KEY,
      this.muted ? "1" : "0",
    );
    this.apply();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.apply();
  }

  setMasterMuted(muted) {
    this.masterMuted = Boolean(muted);
    this.apply();
  }

  setOverallVolume(value) {
    this.overallVolume = clampVolume(value);
    this.apply();
  }

  reset() {
    this.setVolume(DEFAULT_VOLUME);
    this.setMuted(false);
  }

  attach(audio) {
    if (!audio) return;
    this.audioElements.add(audio);
    this.applyTo(audio);
  }

  detach(audio) {
    this.audioElements.delete(audio);
  }

  apply() {
    for (const audio of this.audioElements) this.applyTo(audio);
  }

  applyTo(audio) {
    const muted = !this.enabled || this.muted || this.masterMuted;
    applyMediaElementAudio(audio, {
      muted,
      volume: this.volume * this.overallVolume,
    });
  }

  dispose() {
    this.audioElements.clear();
  }
}
