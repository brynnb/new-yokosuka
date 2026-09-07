export const MASTER_MUTED_STORAGE_KEY = "new-yokosuka.audio-muted";
export const SOUND_EFFECTS_MUTED_STORAGE_KEY =
  "new-yokosuka.sound-effects-muted";
export const FOOTSTEPS_MUTED_STORAGE_KEY =
  "new-yokosuka.footsteps-muted";
export const FORKLIFT_REVERSE_MUTED_STORAGE_KEY =
  "new-yokosuka.forklift-reverse-muted";
export const OVERALL_VOLUME_STORAGE_KEY = "new-yokosuka.overall-volume";
export const SOUND_EFFECTS_VOLUME_STORAGE_KEY =
  "new-yokosuka.sound-effects-volume";
export const AMBIENT_VOLUME_STORAGE_KEY = "new-yokosuka.ambient-volume";
export const AMBIENT_MUTED_STORAGE_KEY = "new-yokosuka.ambient-muted";

export const DEFAULT_OVERALL_VOLUME = 1;
export const DEFAULT_SOUND_EFFECTS_VOLUME = 0.5;
export const DEFAULT_AMBIENT_VOLUME = 0.5;
export const SOUND_EFFECTS_GAIN_SCALE = 0.35;

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function save(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Audio still works when persistent browser storage is unavailable.
  }
}

export function readAudioPreferences(storage = globalThis.localStorage) {
  let overallVolume = DEFAULT_OVERALL_VOLUME;
  let effectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
  let ambientVolume = DEFAULT_AMBIENT_VOLUME;
  let ambientMuted = false;
  let effectsMuted = false;
  let footstepsMuted = false;
  let forkliftReverseMuted = false;
  let masterMuted = false;
  try {
    const savedOverallVolume = storage?.getItem(OVERALL_VOLUME_STORAGE_KEY);
    if (savedOverallVolume != null) {
      overallVolume = clampVolume(savedOverallVolume);
    }
    const savedVolume = storage?.getItem(SOUND_EFFECTS_VOLUME_STORAGE_KEY);
    if (savedVolume != null) effectsVolume = clampVolume(savedVolume);
    const savedAmbientVolume = storage?.getItem(AMBIENT_VOLUME_STORAGE_KEY);
    if (savedAmbientVolume != null) {
      ambientVolume = clampVolume(savedAmbientVolume);
    }
    ambientMuted = storage?.getItem(AMBIENT_MUTED_STORAGE_KEY) === "1";
    effectsMuted =
      storage?.getItem(SOUND_EFFECTS_MUTED_STORAGE_KEY) === "1";
    footstepsMuted = storage?.getItem(FOOTSTEPS_MUTED_STORAGE_KEY) === "1";
    forkliftReverseMuted =
      storage?.getItem(FORKLIFT_REVERSE_MUTED_STORAGE_KEY) === "1";
    masterMuted = storage?.getItem(MASTER_MUTED_STORAGE_KEY) === "1";
  } catch {
    // Use defaults when persistent browser storage is unavailable.
  }
  return {
    overallVolume,
    effectsVolume,
    ambientVolume,
    ambientMuted,
    effectsMuted,
    footstepsMuted,
    forkliftReverseMuted,
    masterMuted,
  };
}

export function effectiveEffectsVolume(state) {
  return clampVolume(state?.effectsVolume) * SOUND_EFFECTS_GAIN_SCALE;
}

export class AudioPreferences {
  constructor({ storage = globalThis.localStorage } = {}) {
    const state = readAudioPreferences(storage);
    this.storage = storage;
    this.overallVolume = state.overallVolume;
    this.effectsVolume = state.effectsVolume;
    this.ambientVolume = state.ambientVolume;
    this.ambientMuted = state.ambientMuted;
    this.effectsMuted = state.effectsMuted;
    this.footstepsMuted = state.footstepsMuted;
    this.forkliftReverseMuted = state.forkliftReverseMuted;
    this.masterMuted = state.masterMuted;
    this.listeners = new Set();
  }

  getState() {
    return {
      overallVolume: this.overallVolume,
      effectsVolume: this.effectsVolume,
      ambientVolume: this.ambientVolume,
      ambientMuted: this.ambientMuted,
      effectsMuted: this.effectsMuted,
      footstepsMuted: this.footstepsMuted,
      forkliftReverseMuted: this.forkliftReverseMuted,
      masterMuted: this.masterMuted,
    };
  }

  setOverallVolume(value) {
    this.overallVolume = clampVolume(value);
    save(
      this.storage,
      OVERALL_VOLUME_STORAGE_KEY,
      String(this.overallVolume),
    );
    this.#emit();
  }

  setEffectsVolume(value) {
    this.effectsVolume = clampVolume(value);
    save(
      this.storage,
      SOUND_EFFECTS_VOLUME_STORAGE_KEY,
      String(this.effectsVolume),
    );
    this.#emit();
  }

  setAmbientVolume(value) {
    this.ambientVolume = clampVolume(value);
    save(
      this.storage,
      AMBIENT_VOLUME_STORAGE_KEY,
      String(this.ambientVolume),
    );
    this.#emit();
  }

  setAmbientMuted(muted) {
    this.ambientMuted = Boolean(muted);
    save(
      this.storage,
      AMBIENT_MUTED_STORAGE_KEY,
      this.ambientMuted ? "1" : "0",
    );
    this.#emit();
  }

  setEffectsMuted(muted) {
    this.effectsMuted = Boolean(muted);
    save(
      this.storage,
      SOUND_EFFECTS_MUTED_STORAGE_KEY,
      this.effectsMuted ? "1" : "0",
    );
    this.#emit();
  }

  setFootstepsMuted(muted) {
    this.footstepsMuted = Boolean(muted);
    save(
      this.storage,
      FOOTSTEPS_MUTED_STORAGE_KEY,
      this.footstepsMuted ? "1" : "0",
    );
    this.#emit();
  }

  setForkliftReverseMuted(muted) {
    this.forkliftReverseMuted = Boolean(muted);
    save(
      this.storage,
      FORKLIFT_REVERSE_MUTED_STORAGE_KEY,
      this.forkliftReverseMuted ? "1" : "0",
    );
    this.#emit();
  }

  setMasterMuted(muted) {
    this.masterMuted = Boolean(muted);
    save(
      this.storage,
      MASTER_MUTED_STORAGE_KEY,
      this.masterMuted ? "1" : "0",
    );
    this.#emit();
  }

  reset() {
    this.overallVolume = DEFAULT_OVERALL_VOLUME;
    this.effectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
    this.ambientVolume = DEFAULT_AMBIENT_VOLUME;
    this.ambientMuted = false;
    this.effectsMuted = false;
    this.footstepsMuted = false;
    this.forkliftReverseMuted = false;
    this.masterMuted = false;
    save(
      this.storage,
      OVERALL_VOLUME_STORAGE_KEY,
      String(this.overallVolume),
    );
    save(
      this.storage,
      SOUND_EFFECTS_VOLUME_STORAGE_KEY,
      String(this.effectsVolume),
    );
    save(
      this.storage,
      AMBIENT_VOLUME_STORAGE_KEY,
      String(this.ambientVolume),
    );
    save(this.storage, AMBIENT_MUTED_STORAGE_KEY, "0");
    save(this.storage, SOUND_EFFECTS_MUTED_STORAGE_KEY, "0");
    save(this.storage, FOOTSTEPS_MUTED_STORAGE_KEY, "0");
    save(this.storage, FORKLIFT_REVERSE_MUTED_STORAGE_KEY, "0");
    save(this.storage, MASTER_MUTED_STORAGE_KEY, "0");
    this.#emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

export const audioPreferences = new AudioPreferences();
