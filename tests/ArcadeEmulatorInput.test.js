import assert from "node:assert/strict";
import test from "node:test";
import { dispatchArcadeEmulatorKey, migrateHangOnPedalSettings } from "../src/ArcadeEmulatorInput.js";

class FakeKeyboardEvent {
  constructor(type, options) {
    this.type = type;
    Object.assign(this, options);
  }
}

test("Hang-On upgrades only obsolete pedal bindings without clearing saved settings", () => {
  const key = "ejs-new-yokosuka-hangon-arcade-hangon-settings";
  let value = JSON.stringify({ settings: { volume: 0.4 }, controlSettings: { 0: {
    0: { value: 87, value2: "BUTTON_2" },
    8: { value: "s", value2: "BUTTON_1" },
    16: { value: "d", value2: "LEFT_STICK_X:+1" },
  } } });
  const storage = { getItem(k) { assert.equal(k, key); return value; }, setItem(k, v) { assert.equal(k, key); value = v; } };
  assert.equal(migrateHangOnPedalSettings(storage), true);
  const result = JSON.parse(value);
  assert.deepEqual(result.settings, { volume: 0.4 });
  assert.equal(result.controlSettings[0][13].value, 87);
  assert.equal(result.controlSettings[0][12].value, "s");
  assert.equal(result.controlSettings[0][0], undefined);
  assert.equal(result.controlSettings[0][8], undefined);
  assert.equal(result.controlSettings[0][16].value, "d");
  assert.equal(migrateHangOnPedalSettings(storage), false);
  value = JSON.stringify({ controlSettings: { 0: {
    0: { value: "q", value2: "BUTTON_2" },
    8: { value: "s", value2: "BUTTON_1" },
    12: { value: "b", value2: "LEFT_BOTTOM_SHOULDER" },
  } } });
  assert.equal(migrateHangOnPedalSettings(storage), false);
});

test("arcade input reaches EmulatorJS's actual keyboard listener element", () => {
  const innerEvents = [];
  const fallbackEvents = [];
  const inner = {
    dispatchEvent: (event) => innerEvents.push(event),
  };
  const fallback = {
    dispatchEvent: (event) => fallbackEvents.push(event),
  };

  assert.equal(dispatchArcadeEmulatorKey({
    emulator: { elements: { parent: inner } },
    fallbackTarget: fallback,
    code: "KeyW",
    pressed: true,
    KeyboardEventConstructor: FakeKeyboardEvent,
  }), true);

  assert.equal(innerEvents.length, 1);
  assert.equal(fallbackEvents.length, 0);
  assert.equal(innerEvents[0].type, "keydown");
  assert.equal(innerEvents[0].key, "w");
  assert.equal(innerEvents[0].keyCode, 87);
  assert.equal(innerEvents[0].which, 87);
});

test("arcade input falls back while EmulatorJS is still initializing", () => {
  const events = [];
  assert.equal(dispatchArcadeEmulatorKey({
    emulator: null,
    fallbackTarget: {
      dispatchEvent: (event) => events.push(event),
    },
    code: "KeyW",
    pressed: false,
    KeyboardEventConstructor: FakeKeyboardEvent,
  }), true);
  assert.equal(events[0].type, "keyup");
});
