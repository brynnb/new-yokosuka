import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  resolveCameraPosition,
  updateControllerCamera,
} from "../src/ThirdPersonCamera.js";
import { defaultCameraBlockerPredicate } from "../src/ThirdPersonController.js";

test("camera resolution preserves the desired point without blockers", () => {
  const target = BABYLON.Vector3.Zero();
  const desired = new BABYLON.Vector3(0, 1, 4);
  const result = resolveCameraPosition({
    scene: { pickWithRay: () => ({ hit: false }) },
    blockerPredicate: () => true,
    options: {
      cameraMinimumResolvedDistance: 0.2,
      cameraCollisionPadding: 0.1,
    },
    target,
    desired,
  });
  assert.ok(result.position.equalsWithEpsilon(desired));
  assert.equal(result.distance, desired.length());
});

test("first-person camera can sit behind the actor without hiding geometry", () => {
  const position = BABYLON.Vector3.Zero();
  const camera = {
    position: BABYLON.Vector3.Zero(),
    setTarget(target) {
      this.target = target;
    },
  };
  const controller = {
    actorRoot: { position },
    camera,
    cameraPitch: 0,
    cameraYaw: Math.PI,
    cameraTarget: BABYLON.Vector3.Zero(),
    firstPerson: true,
    options: {
      firstPersonHeadHeight: 1.62,
      firstPersonCameraBackOffset: 0.55,
    },
    scene: {},
  };

  updateControllerCamera(controller, 1 / 60);

  assert.ok(camera.position.equalsWithEpsilon(
    new BABYLON.Vector3(0, 1.62, -0.55),
  ));
  assert.ok(camera.target.equalsWithEpsilon(
    new BABYLON.Vector3(0, 1.62, 0.45),
  ));
});

test("camera resolution stops before a blocking surface", () => {
  const result = resolveCameraPosition({
    scene: { pickWithRay: () => ({ hit: true, distance: 2 }) },
    blockerPredicate: () => true,
    options: {
      cameraMinimumResolvedDistance: 0.2,
      cameraCollisionPadding: 0.25,
    },
    target: BABYLON.Vector3.Zero(),
    desired: new BABYLON.Vector3(0, 0, 5),
  });
  assert.equal(result.distance, 1.75);
  assert.equal(result.position.z, 1.75);
});

test("camera ray passes through an NPC proxy and still stops at the wall", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const npc = new BABYLON.TransformNode("npc", scene);
  npc.metadata = { scheduledActorInstanceId: "NOZOMI:1" };
  const clickBox = BABYLON.MeshBuilder.CreateBox("npc_click_box", {
    width: 1,
    height: 2,
    depth: 0.5,
  }, scene);
  clickBox.parent = npc;
  clickBox.position.z = 1;
  clickBox.isPickable = true;
  clickBox.checkCollisions = true;
  clickBox.metadata = { cameraBlocker: true };
  const wall = BABYLON.MeshBuilder.CreateBox("wall", {
    width: 4,
    height: 4,
    depth: 0.1,
  }, scene);
  wall.position.z = 3;
  wall.isPickable = true;
  wall.metadata = { cameraBlocker: true };
  clickBox.computeWorldMatrix(true);
  wall.computeWorldMatrix(true);

  const result = resolveCameraPosition({
    scene,
    blockerPredicate: defaultCameraBlockerPredicate,
    options: {
      cameraMinimumResolvedDistance: 0.2,
      cameraCollisionPadding: 0.1,
    },
    target: BABYLON.Vector3.Zero(),
    desired: new BABYLON.Vector3(0, 0, 5),
  });

  assert.ok(result.distance > 2.8 && result.distance < 3);
  scene.dispose();
  engine.dispose();
});
