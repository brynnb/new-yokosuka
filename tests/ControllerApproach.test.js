import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import {ThirdPersonController, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS, shortestAngleDelta} from "../src/ThirdPersonController.js";
import {VENDING_MANIFEST} from "../src/VendingCatalog.js";
import {vendingInteractionPose} from "../play/interactions/VendingInteractions.js";

function controller() {
  return Object.assign(Object.create(ThirdPersonController.prototype), {
    collider: {position: new B.Vector3(-16.02, 0, 27.61)},
    actorRoot: {position: new B.Vector3(-16.02, 0, 27.61), rotation: {y: 4.032657}},
    options: {...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS},
    movementLocked: true, firstPerson: false, cameraYaw: .891064,
    recordSafePosition() {}, snapToTerrain() {}, advanceVertical() {}, updateCamera() {},
    moveHorizontal(delta) {this.collider.position.addInPlace(delta);},
  });
}

test("all vending placements transform one front-facing staging pose", () => {
  const engine = new B.NullEngine(); const scene = new B.Scene(engine);
  try {
    for (const machine of VENDING_MANIFEST.machines) {
      const root = new B.TransformNode(machine.id, scene);
      root.position.set(...machine.position);
      root.rotation.y = machine.rotationDegrees[1] * Math.PI / 180;
      const pose = vendingInteractionPose(root);
      const local = B.Vector3.TransformCoordinates(pose.position, root.getWorldMatrix().clone().invert());
      assert.ok(B.Vector3.Distance(local, new B.Vector3(0, 0, .8)) < 1e-5, machine.id);
      const facing = root.position.subtract(pose.position).normalize();
      assert.ok(Math.abs(shortestAngleDelta(pose.yaw, Math.atan2(facing.x, facing.z))) < 1e-5);
    }
  } finally {engine.dispose();}
});

test("approach walks through normal collision API, turns smoothly, then arrives without resetting camera", async () => {
  const c = controller(); const position = new B.Vector3(-17.593, .0724, 26.685);
  const yaw = -2.679;
  const done = c.approachTo(position, yaw);
  let walking = false, turning = false;
  for (let i = 0; i < 400 && c.approach; i++) {
    const previous = c.actorRoot.position.clone(), previousYaw = c.actorRoot.rotation.y;
    const move = c.update(1/60, {updateCamera: false});
    walking ||= move.moving; turning ||= move.turning;
    assert.ok(B.Vector3.Distance(previous, c.actorRoot.position) <= c.options.walkSpeed/60 + 1e-6);
    assert.ok(Math.abs(shortestAngleDelta(previousYaw, c.actorRoot.rotation.y)) <= Math.PI/60 + 1e-6);
  }
  await done;
  assert.ok(walking && turning);
  assert.ok(Math.hypot(c.collider.position.x-position.x,c.collider.position.z-position.z) < .01);
  assert.equal(c.actorRoot.rotation.y, yaw);
  assert.equal(c.cameraYaw, .891064);
  assert.equal(c.movementLocked, true, "interaction owns unlocking after animation");
});

test("obstacles and unreachable heights fail without a final teleport", async () => {
  for (const blocked of [true, false]) {
    const c = controller(); if (blocked) c.moveHorizontal = () => {};
    const target = new B.Vector3(-16.02, blocked ? 0 : 5, 28.61);
    const rejected = assert.rejects(c.approachTo(target, 0), /Couldn't reach/);
    for (let i = 0; i < 800 && c.approach; i++) c.update(1/60);
    await rejected;
    if (blocked) assert.equal(c.collider.position.z, 27.61);
    assert.equal(c.collider.position.y, 0);
  }
});

test("approach cancellation, replacement and invalid numbers settle once", async () => {
  const c = controller(); const abort = new AbortController(); const point = B.Vector3.Zero();
  const cancelled = assert.rejects(c.approachTo(point, 0, {signal: abort.signal}), {name: "AbortError"});
  abort.abort(); await cancelled; assert.equal(c.approach, null);
  await assert.rejects(c.approachTo(point, NaN), /Invalid/);
  await assert.rejects(c.approachTo(point, 0, {signal: abort.signal}), {name: "AbortError"});
  const old = assert.rejects(c.approachTo(point, 0), {name: "AbortError"});
  const next = assert.rejects(c.approachTo(point, 1), {name: "AbortError"});
  c.cancelApproach(); await Promise.all([old, next]);
});
