import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  activeForkliftLoad,
  applyCargoServerState,
  revokeCargoLocalOwnership,
} from "../src/ForkliftCargoOwnership.js";

test("disconnect revokes local cargo physics authority", () => {
  let motionType = null;
  let targetTransform = null;
  const entry = {
    ownerId: "self",
    localOwner: true,
    releaseSent: true,
    node: {
      position: new BABYLON.Vector3(1, 2, 3),
      rotationQuaternion: BABYLON.Quaternion.Identity(),
    },
    targetPosition: BABYLON.Vector3.Zero(),
    targetOrientation: BABYLON.Quaternion.Zero(),
    targetLinearVelocity: BABYLON.Vector3.One(),
    targetAngularVelocity: BABYLON.Vector3.One(),
    aggregate: {
      body: {
        setMotionType: (value) => { motionType = value; },
        setTargetTransform: (...value) => { targetTransform = value; },
      },
    },
  };
  revokeCargoLocalOwnership([entry]);
  assert.equal(entry.ownerId, "");
  assert.equal(entry.localOwner, false);
  assert.equal(entry.releaseSent, false);
  assert.equal(motionType, BABYLON.PhysicsMotionType.ANIMATED);
  assert.deepEqual(entry.targetPosition.asArray(), [1, 2, 3]);
  assert.deepEqual(entry.targetLinearVelocity.asArray(), [0, 0, 0]);
  assert.deepEqual(targetTransform, [
    entry.node.position,
    entry.node.rotationQuaternion,
  ]);
});

test("active forklift load summarizes supported cargo", () => {
  assert.deepEqual(activeForkliftLoad({
    forkliftActive: true,
    proxy: { lift: 0.5 },
    entries: [
      { forkSupportActive: true },
      { forkSupportActive: false },
    ],
  }), { count: 1, lift: 0.5, offGround: true });
});

test("repeated server updates retain granted local cargo authority", () => {
  const entry = {
    ownerId: "",
    localOwner: false,
    releaseSent: false,
    networkAccumulator: 0,
    node: {
      position: BABYLON.Vector3.Zero(),
      rotationQuaternion: BABYLON.Quaternion.Identity(),
    },
    targetPosition: BABYLON.Vector3.Zero(),
    targetOrientation: BABYLON.Quaternion.Identity(),
    targetLinearVelocity: BABYLON.Vector3.Zero(),
    targetAngularVelocity: BABYLON.Vector3.Zero(),
    aggregate: {
      body: {
        setMotionType() {},
        setLinearVelocity() {},
        setAngularVelocity() {},
      },
    },
  };
  const state = {
    ownerId: "self",
    x: 1,
    y: 2,
    z: 3,
    qw: 1,
  };

  applyCargoServerState({ entry, state, localPlayerId: "self" });
  applyCargoServerState({ entry, state, localPlayerId: "self" });

  assert.equal(entry.localOwner, true);
  assert.equal(entry.ownerId, "self");
});
