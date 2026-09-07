import assert from "node:assert/strict";
import test from "node:test";

import {
  AudioPreferences,
  AMBIENT_MUTED_STORAGE_KEY,
  AMBIENT_VOLUME_STORAGE_KEY,
  FOOTSTEPS_MUTED_STORAGE_KEY,
  FORKLIFT_REVERSE_MUTED_STORAGE_KEY,
  MASTER_MUTED_STORAGE_KEY,
  OVERALL_VOLUME_STORAGE_KEY,
  SOUND_EFFECTS_MUTED_STORAGE_KEY,
  SOUND_EFFECTS_VOLUME_STORAGE_KEY,
  readAudioPreferences,
} from "../play/audio/AudioPreferences.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("overall volume, master mute, and sound effects persist together", () => {
  const storage = memoryStorage();
  const preferences = new AudioPreferences({ storage });
  const changes = [];
  preferences.subscribe((state) => changes.push(state));

  preferences.setOverallVolume(0.6);
  preferences.setEffectsVolume(0.35);
  preferences.setAmbientVolume(0.45);
  preferences.setAmbientMuted(true);
  preferences.setEffectsMuted(true);
  preferences.setFootstepsMuted(true);
  preferences.setForkliftReverseMuted(true);
  preferences.setMasterMuted(true);

  assert.equal(storage.values.get(OVERALL_VOLUME_STORAGE_KEY), "0.6");
  assert.equal(storage.values.get(SOUND_EFFECTS_VOLUME_STORAGE_KEY), "0.35");
  assert.equal(storage.values.get(AMBIENT_VOLUME_STORAGE_KEY), "0.45");
  assert.equal(storage.values.get(AMBIENT_MUTED_STORAGE_KEY), "1");
  assert.equal(storage.values.get(SOUND_EFFECTS_MUTED_STORAGE_KEY), "1");
  assert.equal(storage.values.get(FOOTSTEPS_MUTED_STORAGE_KEY), "1");
  assert.equal(
    storage.values.get(FORKLIFT_REVERSE_MUTED_STORAGE_KEY),
    "1",
  );
  assert.equal(storage.values.get(MASTER_MUTED_STORAGE_KEY), "1");
  assert.deepEqual(readAudioPreferences(storage), {
    overallVolume: 0.6,
    effectsVolume: 0.35,
    ambientVolume: 0.45,
    ambientMuted: true,
    effectsMuted: true,
    footstepsMuted: true,
    forkliftReverseMuted: true,
    masterMuted: true,
  });
  assert.deepEqual(changes.at(-1), {
    overallVolume: 0.6,
    effectsVolume: 0.35,
    ambientVolume: 0.45,
    ambientMuted: true,
    effectsMuted: true,
    footstepsMuted: true,
    forkliftReverseMuted: true,
    masterMuted: true,
  });
});

test("sound effects volume is clamped when restored", () => {
  assert.deepEqual(readAudioPreferences(memoryStorage({
    [SOUND_EFFECTS_VOLUME_STORAGE_KEY]: "4",
  })), {
    overallVolume: 1,
    effectsVolume: 1,
    ambientVolume: 0.5,
    ambientMuted: false,
    effectsMuted: false,
    footstepsMuted: false,
    forkliftReverseMuted: false,
    masterMuted: false,
  });
});

test("audio preferences reset every value to the quieter defaults", () => {
  const storage = memoryStorage();
  const preferences = new AudioPreferences({ storage });
  preferences.setOverallVolume(0.2);
  preferences.setEffectsVolume(1);
  preferences.setAmbientVolume(1);
  preferences.setAmbientMuted(true);
  preferences.setEffectsMuted(true);
  preferences.setFootstepsMuted(true);
  preferences.setForkliftReverseMuted(true);
  preferences.setMasterMuted(true);

  preferences.reset();

  assert.deepEqual(preferences.getState(), {
    overallVolume: 1,
    effectsVolume: 0.5,
    ambientVolume: 0.5,
    ambientMuted: false,
    effectsMuted: false,
    footstepsMuted: false,
    forkliftReverseMuted: false,
    masterMuted: false,
  });
});
