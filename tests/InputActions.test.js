import assert from "node:assert/strict";
import test from "node:test";

import {
  INPUT_CONTEXTS,
  InputActionSystem,
  createGameplayActionMaps,
} from "../play/input/InputActions.js";

test("input actions combine independent devices without sharing ownership", () => {
  const input = new InputActionSystem();
  input.setButton("keyboard", "KeyE", true);
  input.setButton("gamepad", "liftRaise", false);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 1);

  input.clearDevice("gamepad");
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 1);

  input.setButton("keyboard", "KeyE", false);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 0);
  input.setButton("keyboard", "KeyF", true);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), -1);
});

test("opposed action bindings compose and clamp at the action boundary", () => {
  const input = new InputActionSystem();
  input.setButton("keyboard", "KeyW", true);
  input.setValue("gamepad", "moveY", -0.25);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("throttle"), 0.75);

  input.setValue("touch", "moveY", 0.8);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("throttle"), 1);
});

test("snapshots expose stable pressed held and released transitions", () => {
  const input = new InputActionSystem();
  input.setButton("keyboard", "KeyH", true);
  const pressed = input.snapshot(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(pressed.pressed("horn"), true);
  assert.equal(pressed.held("horn"), true);

  const held = input.snapshot(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(held.pressed("horn"), false);
  assert.equal(held.held("horn"), true);

  input.setButton("keyboard", "KeyH", false);
  const released = input.snapshot(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(released.released("horn"), true);
  assert.equal(Object.isFrozen(released), true);
  assert.equal(Object.isFrozen(released.actions), true);
});

test("left trigger supplies both the run command and toggle inversion modifier", () => {
  const input = new InputActionSystem();
  input.setButton("gamepad", "run", true);
  input.setButton("gamepad", "runModifier", true);
  const snapshot = input.snapshot(INPUT_CONTEXTS.EXPLORATION);
  assert.equal(snapshot.held("run"), true);
  assert.equal(snapshot.held("runModifier"), true);
});

test("action maps honor current keyboard rebindings", () => {
  const bindings = { forkliftRaise: "KeyU", moveForward: "KeyI" };
  const input = new InputActionSystem({
    actionMaps: createGameplayActionMaps(
      (name) => bindings[name] || null,
    ),
  });
  input.setButton("keyboard", "KeyE", true);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 0);
  input.setButton("keyboard", "KeyU", true);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 1);
  input.setButton("keyboard", "KeyI", true);
  assert.equal(input.snapshot(INPUT_CONTEXTS.EXPLORATION).value("moveY"), 1);
});

test("the forklift camera binding takes priority over a conflicting lift key", () => {
  const input = new InputActionSystem({
    actionMaps: createGameplayActionMaps((name) => (
      name === "cameraMode" || name === "forkliftRaise" ? "KeyR" : null
    )),
  });
  input.setButton("keyboard", "KeyR", true);
  assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("lift"), 0);
});

test("keyboard turning stays separate from analog movement and forklift steering", () => {
  for (const key of ["KeyA", "ArrowLeft", "KeyJ"]) {
    const input = new InputActionSystem({
      actionMaps: createGameplayActionMaps(name => name === "moveLeft" && key === "KeyJ" ? key : null),
    });
    input.setButton("keyboard", key, true);
    const exploration = input.snapshot(INPUT_CONTEXTS.EXPLORATION);
    assert.equal(exploration.value("turn"), -1);
    assert.equal(exploration.value("moveX"), 0);
    assert.equal(input.snapshot(INPUT_CONTEXTS.FORKLIFT).value("steering"), -1);
    input.setValue("gamepad", "moveX", 0.5);
    assert.equal(input.snapshot(INPUT_CONTEXTS.EXPLORATION).value("moveX"), 0.5);
  }
});

test("contexts can be stacked without leaking action definitions", () => {
  const input = new InputActionSystem();
  input.setButton("keyboard", "KeyE", true);
  assert.equal(input.context, INPUT_CONTEXTS.EXPLORATION);
  assert.equal(input.snapshot().value("lift"), 0);
  input.pushContext(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(input.snapshot().value("lift"), 1);
  input.popContext();
  assert.equal(input.context, INPUT_CONTEXTS.EXPLORATION);
});

test("activating a context starts transition tracking from its current state", () => {
  const input = new InputActionSystem();
  input.setButton("keyboard", "KeyE", true);
  input.setContext(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(input.snapshot().pressed("lift"), true);
  input.setContext(INPUT_CONTEXTS.EXPLORATION);
  input.setContext(INPUT_CONTEXTS.FORKLIFT);
  assert.equal(input.snapshot().pressed("lift"), true);
});
