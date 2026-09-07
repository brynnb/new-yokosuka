import assert from "node:assert/strict";
import test from "node:test";
import {
  DIALOGUE_MUTED_STORAGE_KEY,
  DIALOGUE_VOLUME_STORAGE_KEY,
  DialogueAudio,
  readDialogueAudioPreferences,
} from "../play/audio/DialogueAudio.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    values,
  };
}

test("dialogue audio persists volume and mute preferences", () => {
  const saved = storage();
  const audio = new DialogueAudio({ storage: saved });
  const element = { muted: true, volume: -1 };
  audio.attach(element);
  assert.equal(element.volume, 0.5);
  assert.equal(element.muted, false);

  audio.setVolume(0.42);
  assert.equal(element.volume, 0.42);
  assert.equal(saved.values.get(DIALOGUE_VOLUME_STORAGE_KEY), "0.42");

  audio.setMuted(true);
  assert.equal(element.volume, 0);
  assert.equal(element.muted, true);
  assert.equal(saved.values.get(DIALOGUE_MUTED_STORAGE_KEY), "1");

  audio.setMuted(false);
  assert.equal(element.volume, 0.42);
  assert.equal(element.muted, false);
  audio.setMasterMuted(true);
  assert.equal(element.volume, 0);
  assert.equal(element.muted, true);
  audio.setMasterMuted(false);
  assert.equal(element.volume, 0.42);
  assert.equal(element.muted, false);
  audio.setOverallVolume(0.5);
  assert.equal(element.volume, 0.21);
  audio.setEnabled(false);
  assert.equal(element.volume, 0);
  assert.equal(element.muted, true);
  audio.setEnabled(true);
  assert.equal(element.volume, 0.21);
  assert.equal(element.muted, false);
  audio.detach(element);
  audio.setVolume(0.8);
  assert.equal(element.volume, 0.21);
});

test("dialogue audio defaults to half volume", () => {
  assert.deepEqual(readDialogueAudioPreferences(storage()), {
    volume: 0.5,
    muted: false,
  });
});

test("dialogue audio restores and clamps saved preferences", () => {
  assert.deepEqual(readDialogueAudioPreferences(storage({
    [DIALOGUE_VOLUME_STORAGE_KEY]: "2",
    [DIALOGUE_MUTED_STORAGE_KEY]: "1",
  })), {
    volume: 1,
    muted: true,
  });
});
