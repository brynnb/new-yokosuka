import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  DEFAULT_FORKLIFT_OPTIONS,
  FORKLIFT_CRATE_HEIGHT,
  FORKLIFT_MAST_EXTENSION,
  FORKLIFT_ORIGINAL_MAXIMUM_LIFT,
  FORKLIFT_TINE_COLLISION,
  ForkliftRig,
  advanceForkliftState,
  createForkliftState,
  groundLiftForBounds,
} from "../src/ForkliftRig.js";

test("forklift accelerates, steers, and rolls its wheels", () => {
  const next = advanceForkliftState(
    createForkliftState(),
    { throttle: 1, steering: 1, lift: 0 },
    0.05,
  );
  assert.ok(next.speed > 0);
  assert.ok(next.steeringAngle > 0);
  assert.ok(next.distance > 0);
  assert.ok(next.yawDelta > 0);
  assert.ok(next.wheelRoll < 0);
});

test("forklift rig articulates quaternion-backed MT5 wheel nodes", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("forklift", scene);
    root._mt5Nodes = [
      [0x03, "fork"],
      [0x08, "frontAxle"],
      [0x9a, "steeringWheel"],
      [0x12, "leftRearWheel"],
      [0x17, "rightRearWheel"],
    ].map(([flag, name]) => {
      const mesh = new BABYLON.TransformNode(name, scene);
      mesh.parent = root;
      mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
      return { flag, mesh };
    });
    const chassis = BABYLON.MeshBuilder.CreateBox(
      "chassis",
      { width: 1, height: 2, depth: 2 },
      scene,
    );
    chassis.parent = root;

    const rig = new ForkliftRig(root);
    rig.apply(createForkliftState({
      wheelRoll: 1,
      steeringAngle: 0.3,
    }));

    assert.ok(
      Math.abs(rig.frontAxle.mesh.rotationQuaternion.toEulerAngles().x - 1)
        < 1e-6,
    );
    const rearEuler = rig.leftRearWheel.mesh.rotationQuaternion
      .toEulerAngles();
    assert.ok(Math.abs(rearEuler.x - 1) < 1e-6);
    assert.ok(Math.abs(rearEuler.y + 0.3) < 1e-6);
    assert.ok(
      Math.abs(
        rig.steeringWheel.mesh.rotationQuaternion.toEulerAngles().z - 0.66,
      ) < 1e-6,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("forklift uses the calibrated driving envelope", () => {
  assert.equal(DEFAULT_FORKLIFT_OPTIONS.maximumForwardSpeed, 9);
  assert.equal(DEFAULT_FORKLIFT_OPTIONS.maximumReverseSpeed, 5.4);
  assert.equal(DEFAULT_FORKLIFT_OPTIONS.acceleration, 6.4);
  assert.equal(DEFAULT_FORKLIFT_OPTIONS.liftSpeed, 1.275);
});

test("forklift reverse motion turns through the opposite yaw", () => {
  const next = advanceForkliftState(
    createForkliftState({ speed: -1, steeringAngle: 0.3 }),
    { throttle: -1, steering: 1, lift: 0 },
    0.05,
  );
  assert.ok(next.distance < 0);
  assert.ok(next.yawDelta < 0);
  assert.ok(next.wheelRoll > 0);
});

test("forklift steering reaches lock more gradually at high speed", () => {
  const lowSpeed = advanceForkliftState(
    createForkliftState({ speed: 0 }),
    { steering: 1 },
    0.05,
  );
  const highSpeed = advanceForkliftState(
    createForkliftState({
      speed: DEFAULT_FORKLIFT_OPTIONS.maximumForwardSpeed,
    }),
    { steering: 1 },
    0.05,
  );
  assert.ok(highSpeed.steeringAngle > 0);
  assert.ok(highSpeed.steeringAngle < lowSpeed.steeringAngle);

  const fullResponse = advanceForkliftState(
    createForkliftState({
      speed: DEFAULT_FORKLIFT_OPTIONS.maximumForwardSpeed,
    }),
    { steering: 1 },
    0.05,
    { highSpeedSteeringResponseFraction: 1 },
  );
  assert.equal(fullResponse.steeringAngle, lowSpeed.steeringAngle);
});

test("forklift lift travel extends one crate above the original range", () => {
  assert.equal(
    DEFAULT_FORKLIFT_OPTIONS.maximumLift,
    FORKLIFT_ORIGINAL_MAXIMUM_LIFT + FORKLIFT_CRATE_HEIGHT,
  );
  const raised = advanceForkliftState(
    createForkliftState({
      lift: DEFAULT_FORKLIFT_OPTIONS.maximumLift - 0.01,
    }),
    { lift: 1 },
    0.05,
  );
  assert.equal(raised.lift, DEFAULT_FORKLIFT_OPTIONS.maximumLift);

  const lowered = advanceForkliftState(
    createForkliftState({ lift: 0.01 }),
    { lift: -1 },
    0.05,
  );
  assert.equal(lowered.lift, 0);
});

test("forklift lift has an exact zero detent below one percent", () => {
  const threshold = DEFAULT_FORKLIFT_OPTIONS.maximumLift * 0.01;
  const released = advanceForkliftState(
    createForkliftState({ lift: threshold * 0.9 }),
    { lift: 0 },
    0.05,
  );
  assert.equal(released.lift, 0);

  const raising = advanceForkliftState(
    createForkliftState({ lift: 0 }),
    { lift: 1 },
    0.01,
  );
  assert.ok(raising.lift > 0);
});

test("forklift wheel roll and vehicle motion stop on the same frame", () => {
  const previous = createForkliftState({
    speed: DEFAULT_FORKLIFT_OPTIONS.stopSpeed + 0.01,
    wheelRoll: 2,
  });
  const stopped = advanceForkliftState(previous, {}, 0.05);
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.distance, 0);
  assert.equal(stopped.wheelRoll, previous.wheelRoll);
});

test("counter-throttle braking decelerates twice as fast", () => {
  const initial = createForkliftState({ speed: 3 });
  const previousBrakingRate = 10;
  const deltaSeconds = 0.05;
  const braking = advanceForkliftState(
    initial,
    { throttle: -1 },
    deltaSeconds,
  );
  assert.equal(
    braking.speed,
    initial.speed - previousBrakingRate * 2 * deltaSeconds,
  );
});

test("mast extensions use the dimensions recovered from the raised model", () => {
  const authoredTop = (
    FORKLIFT_MAST_EXTENSION.movingTopBindY
    + FORKLIFT_ORIGINAL_MAXIMUM_LIFT
  );
  const maximumTop = (
    FORKLIFT_MAST_EXTENSION.movingTopBindY
    + DEFAULT_FORKLIFT_OPTIONS.maximumLift
  );
  assert.ok(maximumTop > FORKLIFT_MAST_EXTENSION.fixedBottomY);
  assert.ok(
    Math.abs(authoredTop - 2.2776) < 0.0001,
    "the original lift should meet the authored carriage",
  );
  assert.ok(
    Math.abs(maximumTop - authoredTop - FORKLIFT_CRATE_HEIGHT) < 0.0001,
    "the extended carriage should rise exactly one crate higher",
  );
  assert.ok(
    Math.abs(
      FORKLIFT_MAST_EXTENSION.rightX
      - FORKLIFT_MAST_EXTENSION.leftX,
    ) > FORKLIFT_MAST_EXTENSION.width,
    "the two extension rails must remain separate",
  );
});

test("forklift tine collision probes cover both authored fork tips", () => {
  assert.ok(FORKLIFT_TINE_COLLISION.leftX < 0);
  assert.ok(FORKLIFT_TINE_COLLISION.rightX > 0);
  assert.equal(
    Math.abs(FORKLIFT_TINE_COLLISION.leftX),
    FORKLIFT_TINE_COLLISION.rightX,
  );
  assert.ok(FORKLIFT_TINE_COLLISION.tipZ < -1.7);
});

test("rolled forklift bounds remain above their ground contact plane", () => {
  const lift = groundLiftForBounds({
    minimum: new BABYLON.Vector3(-0.6, 0, -1),
    maximum: new BABYLON.Vector3(0.6, 2, 1),
  }, 0, Math.PI / 2);
  assert.ok(Math.abs(lift - 0.6) < 1e-6);
});
