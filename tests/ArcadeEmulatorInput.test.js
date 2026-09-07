import assert from "node:assert/strict";
import test from "node:test";
import { dispatchArcadeEmulatorKey } from "../src/ArcadeEmulatorInput.js";

class FakeKeyboardEvent {
  constructor(type, options) {
    this.type = type;
    Object.assign(this, options);
  }
}

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
