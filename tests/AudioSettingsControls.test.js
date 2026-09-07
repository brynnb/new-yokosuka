import assert from "node:assert/strict";
import test from "node:test";

import { AudioPreferences } from "../play/audio/AudioPreferences.js";
import { AudioSettingsControls } from "../play/ui/AudioSettingsControls.js";

function control() {
  const listeners = new Map();
  return {
    value: "",
    textContent: "",
    attributes: new Map(),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    setAttribute(key, value) {
      this.attributes.set(key, value);
    },
    dispatch: (type) => listeners.get(type)?.(),
    listeners,
  };
}

test("audio settings apply effects volume and reversible master mute", () => {
  const soundEffectsVolume = control();
  const ambientVolume = control();
  const ambientMuted = control();
  const soundEffectsMuted = control();
  const footstepsMuted = control();
  const forkliftReverseMuted = control();
  const overallVolume = control();
  const muteAll = control();
  const calls = [];
  const runtime = (name) => ({
    setOverallVolume: (volume) => calls.push([name, "overall", volume]),
    setMasterMuted: (muted) => calls.push([name, muted]),
  });
  const preferences = new AudioPreferences({
    storage: {
      getItem: () => null,
      setItem: () => {},
    },
  });
  const controls = new AudioSettingsControls({
    dom: {
      overallVolume,
      soundEffectsVolume,
      ambientVolume,
      ambientMuted,
      soundEffectsMuted,
      footstepsMuted,
      forkliftReverseMuted,
      muteAll,
    },
    preferences,
    music: runtime("music"),
    ambient: {
      ...runtime("ambient"),
      setVolume: (volume) => calls.push(["ambient", "volume", volume]),
      setMuted: (muted) => calls.push(["ambient", "muted", muted]),
    },
    dialogue: runtime("dialogue"),
    arcade: runtime("arcade"),
    setEmulatorAudio: (state) => calls.push(["emulator", state]),
  });

  assert.equal(overallVolume.value, "1");
  assert.equal(soundEffectsVolume.value, "0.5");
  assert.equal(ambientVolume.value, "0.5");
  assert.equal(ambientMuted.checked, false);
  assert.equal(soundEffectsMuted.checked, false);
  assert.equal(footstepsMuted.checked, false);
  assert.equal(forkliftReverseMuted.checked, false);
  assert.equal(muteAll.checked, false);
  overallVolume.value = "0.5";
  overallVolume.dispatch("input");
  soundEffectsVolume.value = "0.4";
  soundEffectsVolume.dispatch("input");
  ambientVolume.value = "0.3";
  ambientVolume.dispatch("input");
  ambientMuted.checked = true;
  ambientMuted.dispatch("change");
  soundEffectsMuted.checked = true;
  soundEffectsMuted.dispatch("change");
  footstepsMuted.checked = true;
  footstepsMuted.dispatch("change");
  forkliftReverseMuted.checked = true;
  forkliftReverseMuted.dispatch("change");
  muteAll.checked = true;
  muteAll.dispatch("change");
  assert.deepEqual(preferences.getState(), {
    overallVolume: 0.5,
    effectsVolume: 0.4,
    ambientVolume: 0.3,
    ambientMuted: true,
    effectsMuted: true,
    footstepsMuted: true,
    forkliftReverseMuted: true,
    masterMuted: true,
  });
  assert.equal(muteAll.checked, true);

  controls.dispose();
  assert.equal(overallVolume.listeners.has("input"), false);
  assert.equal(soundEffectsVolume.listeners.has("input"), false);
  assert.equal(ambientVolume.listeners.has("input"), false);
  assert.equal(ambientMuted.listeners.has("change"), false);
  assert.equal(soundEffectsMuted.listeners.has("change"), false);
  assert.equal(footstepsMuted.listeners.has("change"), false);
  assert.equal(forkliftReverseMuted.listeners.has("change"), false);
  assert.equal(muteAll.listeners.has("change"), false);
});
