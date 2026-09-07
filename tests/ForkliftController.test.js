import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { ForkliftController } from "../play/forklift/ForkliftController.js";

test("forklift controller clamps combined keyboard and touch input", () => {
  const controller = {
    movementLocked: false,
    keys: new Set(["KeyW", "KeyD", "KeyE", "KeyH"]),
    touchInput: { x: 0.7, y: 0.6 },
    autoRun: true,
  };
  const runtime = new ForkliftController({
    getController: () => controller,
    getMobileLiftInput: () => 0.5,
  });
  assert.deepEqual(runtime.readInput(), {
    throttle: 1,
    steering: 1,
    lift: 1,
    horn: true,
  });
});

test("forklift controller consumes a semantic fixed-step snapshot", () => {
  const values = { throttle: 0.7, steering: -0.4, lift: 1 };
  const runtime = new ForkliftController({
    getController: () => ({ movementLocked: false }),
    getMobileLiftInput: () => 0,
    getInputSnapshot: () => ({
      value: (name) => values[name] || 0,
      held: (name) => name === "horn",
    }),
  });
  assert.deepEqual(runtime.readInput(), {
    throttle: 0.7,
    steering: -0.4,
    lift: 1,
    horn: true,
  });
});

test("forklift controller accepts valid network quaternion or yaw fallback", () => {
  const runtime = new ForkliftController({
    getController: () => null,
    getMobileLiftInput: () => 0,
  });
  const network = runtime.quaternionFromNetworkState({
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
  });
  assert.ok(BABYLON.Quaternion.Identity().equalsWithEpsilon(network));
  const fallback = runtime.quaternionFromNetworkState({}, Math.PI / 2);
  assert.ok(
    BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI / 2)
      .equalsWithEpsilon(fallback),
  );
});

test("forklift camera follow yields while the right stick is looking", () => {
  const controller = {
    rightMouseDown: false,
    gamepadLookActive: true,
    firstPerson: false,
    touchLookPointerId: null,
    pointerLocked: false,
    cameraYaw: 0,
    cameraDistance: 3,
    cameraResolvedDistance: 3,
    noClip: false,
    autoRun: false,
    movementLocked: false,
    options: { cameraTrailSpeed: 3 },
  };
  const runtime = new ForkliftController({
    getController: () => controller,
  });
  const result = runtime.finishFrame({
    deltaSeconds: 1 / 60,
    actorRoot: { rotation: { y: 1 } },
    forkliftState: { speed: 1, steeringAngle: 0 },
    actualDistance: 1 / 60,
    updateCamera: false,
  });
  assert.equal(result.cameraFollowing, false);
  assert.equal(controller.cameraYaw, 0);
  assert.equal(runtime.cameraManuallyPositioned, true);
});
