import assert from "node:assert/strict";
import test from "node:test";
import { INPUT_CONTEXTS } from "../play/input/InputActions.js";
import { PlayInputRuntime } from "../play/input/PlayInputRuntime.js";

test("input runtime combines touch state in the active gameplay context", () => {
  const runtime = new PlayInputRuntime({ getBinding: () => null });
  const controller = {
    touchInput: { x: 0.25, y: -0.75 },
    touchRunning: true,
    autoRun: false,
  };
  const mobileControls = { forkLiftInput: 0.5 };

  const walking = runtime.snapshot({
    controller,
    mobileControls,
    vehicleActive: false,
  });
  assert.equal(walking.context, INPUT_CONTEXTS.EXPLORATION);
  assert.equal(walking.value("moveX"), 0.25);
  assert.equal(walking.value("moveY"), -0.75);
  assert.equal(walking.held("run"), true);

  const driving = runtime.snapshot({
    controller,
    mobileControls,
    vehicleActive: true,
  });
  assert.equal(driving.context, INPUT_CONTEXTS.FORKLIFT);
  assert.equal(driving.value("lift"), 0.5);
  assert.equal(runtime.forkliftSnapshot(), driving);
});

test("input runtime disposes every attached input device", () => {
  const runtime = new PlayInputRuntime({ getBinding: () => null });
  let disposals = 0;
  runtime.attachDevice({ dispose: () => { disposals += 1; } });
  runtime.attachDevice({ dispose: () => { disposals += 1; } });
  runtime.dispose();
  assert.equal(disposals, 2);
  assert.equal(runtime.currentSnapshot, null);
});
