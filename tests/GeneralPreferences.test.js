import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_BINDINGS_VERSION,
  DEFAULT_CONTROL_BINDINGS,
  GENERAL_PREFERENCES_STORAGE_KEY,
  GeneralPreferences,
  formatControlBinding,
} from "../play/settings/GeneralPreferences.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("general preferences persist dialogue, mouse, and key settings", () => {
  const storage = memoryStorage();
  const preferences = new GeneralPreferences({ storage });
  preferences.setDialogueCaptions(false);
  preferences.setDialogueAudio(false);
  preferences.setMouseSensitivity(1.4);
  preferences.setBinding("moveForward", "KeyI");

  const restored = new GeneralPreferences({ storage }).getState();
  assert.equal(restored.dialogueCaptions, false);
  assert.equal(restored.dialogueAudio, false);
  assert.equal(restored.mouseSensitivity, 1.4);
  assert.equal(restored.bindings.moveForward, "KeyI");
  assert.equal(restored.controlBindingsVersion, CONTROL_BINDINGS_VERSION);
  assert.ok(storage.values.has(GENERAL_PREFERENCES_STORAGE_KEY));
});

test("legacy forklift controls migrate to E raise and F lower", () => {
  const storage = memoryStorage();
  storage.setItem(GENERAL_PREFERENCES_STORAGE_KEY, JSON.stringify({
    bindings: {
      moveForward: "KeyI",
      forkliftRaise: "KeyR",
    },
  }));

  const restored = new GeneralPreferences({ storage }).getState();
  assert.equal(restored.bindings.moveForward, "KeyI");
  assert.equal(restored.bindings.forkliftRaise, "KeyE");
  assert.equal(restored.bindings.forkliftLower, "KeyF");
  assert.equal(restored.bindings.cameraMode, "KeyR");
});

test("the exact old forklift default pair migrates without changing custom pairs", () => {
  const oldDefaults = memoryStorage();
  oldDefaults.setItem(GENERAL_PREFERENCES_STORAGE_KEY, JSON.stringify({
    controlBindingsVersion: 2,
    bindings: {
      forkliftLower: "KeyE",
      forkliftRaise: "KeyF",
    },
  }));
  const migrated = new GeneralPreferences({ storage: oldDefaults }).getState();
  assert.equal(migrated.bindings.forkliftRaise, "KeyE");
  assert.equal(migrated.bindings.forkliftLower, "KeyF");

  const customized = memoryStorage();
  customized.setItem(GENERAL_PREFERENCES_STORAGE_KEY, JSON.stringify({
    controlBindingsVersion: 2,
    bindings: {
      forkliftLower: "KeyV",
      forkliftRaise: "KeyB",
    },
  }));
  const preserved = new GeneralPreferences({ storage: customized }).getState();
  assert.equal(preserved.bindings.forkliftLower, "KeyV");
  assert.equal(preserved.bindings.forkliftRaise, "KeyB");
});

test("general preference reset restores every default binding", () => {
  const preferences = new GeneralPreferences({ storage: memoryStorage() });
  const bindingsReference = preferences.bindings;
  preferences.setBinding("cancel", "Backspace");
  preferences.setMouseSensitivity(99);
  assert.equal(preferences.getState().mouseSensitivity, 2);

  preferences.reset();
  assert.equal(preferences.bindings, bindingsReference);
  assert.deepEqual(preferences.getState().bindings, DEFAULT_CONTROL_BINDINGS);
  assert.equal(preferences.getState().mouseSensitivity, 1);
});

test("section resets preserve preferences owned by the other settings tab", () => {
  const preferences = new GeneralPreferences({ storage: memoryStorage() });
  preferences.setDialogueCaptions(false);
  preferences.setDialogueAudio(false);
  preferences.setMouseSensitivity(1.7);
  preferences.setBinding("moveForward", "KeyI");

  preferences.resetGeneral();
  let state = preferences.getState();
  assert.equal(state.dialogueCaptions, true);
  assert.equal(state.dialogueAudio, true);
  assert.equal(state.mouseSensitivity, 1.7);
  assert.equal(state.bindings.moveForward, "KeyI");

  preferences.setDialogueCaptions(false);
  preferences.resetControls();
  state = preferences.getState();
  assert.equal(state.dialogueCaptions, false);
  assert.equal(state.mouseSensitivity, 1);
  assert.deepEqual(state.bindings, DEFAULT_CONTROL_BINDINGS);
});

test("control binding labels are compact HUD-friendly names", () => {
  assert.equal(formatControlBinding("KeyW"), "W");
  assert.equal(formatControlBinding("ShiftLeft"), "Shift");
  assert.equal(formatControlBinding("Digit4"), "4");
});
