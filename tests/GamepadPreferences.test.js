import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GAMEPAD_PREFERENCES,
  GAMEPAD_PREFERENCES_STORAGE_KEY,
  GamepadPreferences,
} from "../play/input/GamepadPreferences.js";

function storage(initial = null) {
  const values = new Map();
  if (initial) {
    values.set(GAMEPAD_PREFERENCES_STORAGE_KEY, JSON.stringify(initial));
  }
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("gamepad preferences persist and clamp analog settings", () => {
  const saved = storage();
  const preferences = new GamepadPreferences({ storage: saved });
  assert.equal(preferences.getState().enabled, false);
  assert.equal(preferences.getState().invertLookY, true);
  preferences.setEnabled(true);
  preferences.setMovementDeadzone(2);
  preferences.setLookDeadzone(0);
  preferences.setLookSensitivity(1.4);
  preferences.setInvertLookY(true);
  assert.deepEqual(preferences.getState(), {
    enabled: true,
    selectedGamepadId: null,
    movementDeadzone: 0.5,
    lookDeadzone: 0.05,
    lookSensitivity: 1.4,
    invertLookY: true,
    lookXAxis: 2,
    lookYAxis: 3,
    lookXAxisSign: 1,
    lookYAxisSign: 1,
  });
  assert.deepEqual(
    JSON.parse(saved.values.get(GAMEPAD_PREFERENCES_STORAGE_KEY)),
    preferences.getState(),
  );
  preferences.reset();
  assert.deepEqual(preferences.getState(), DEFAULT_GAMEPAD_PREFERENCES);
});

test("gamepad preferences restore valid saved values", () => {
  const preferences = new GamepadPreferences({
    storage: storage({
      enabled: true,
      selectedGamepadId: "Xbox Wireless Controller",
      movementDeadzone: 0.3,
      lookDeadzone: 0.2,
      lookSensitivity: 0.75,
      invertLookY: true,
      lookXAxis: 5,
      lookYAxis: 4,
      lookXAxisSign: -1,
      lookYAxisSign: 1,
    }),
  });
  assert.deepEqual(preferences.getState(), {
    enabled: true,
    selectedGamepadId: "Xbox Wireless Controller",
    movementDeadzone: 0.3,
    lookDeadzone: 0.2,
    lookSensitivity: 0.75,
    invertLookY: true,
    lookXAxis: 5,
    lookYAxis: 4,
    lookXAxisSign: -1,
    lookYAxisSign: 1,
  });
});

test("gamepad preferences preserve an explicitly disabled inverted look", () => {
  const preferences = new GamepadPreferences({
    storage: storage({ invertLookY: false }),
  });
  assert.equal(preferences.getState().invertLookY, false);
});

test("gamepad look-axis binding persists remapped and reversed axes", () => {
  const saved = storage();
  const preferences = new GamepadPreferences({ storage: saved });
  assert.equal(preferences.setLookAxisBinding({
    xAxis: 5,
    yAxis: 2,
    xSign: -1,
    ySign: -1,
  }), true);
  assert.deepEqual(
    {
      x: preferences.getState().lookXAxis,
      y: preferences.getState().lookYAxis,
      xSign: preferences.getState().lookXAxisSign,
      ySign: preferences.getState().lookYAxisSign,
    },
    { x: 5, y: 2, xSign: -1, ySign: -1 },
  );
  assert.equal(preferences.setLookAxisBinding({
    xAxis: 4,
    yAxis: 4,
  }), false);
});
