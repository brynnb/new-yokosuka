import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import {
  buildNativeClothBodyColliders,
} from "../play/characters/NativeClothCollision.js";
import {
  nativeClothBodyCollisionProfile,
} from "../play/characters/NativeClothProfiles.js";

test("native cloth body spheres follow controller pose, mask, and actor scale", () => {
  const profile = nativeClothBodyCollisionProfile("KOK_M");
  const controllerTypes = [...new Set(
    profile.records.map(record => record.controllerType),
  )];
  const controllerFamily = {
    nodes: controllerTypes.map((type, index) => ({ type, index })),
  };
  const controllerMatrices = controllerTypes.map(() => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 2, 3, 1,
  ]);
  const characterSpaceMatrix = BABYLON.Matrix.Scaling(2, 2, 2);
  const colliders = buildNativeClothBodyColliders({
    modelCode: "KOK_M",
    controllerFamily,
    controllerMatrices,
    characterSpaceMatrix,
  });
  assert.equal(colliders.length, profile.records.length);
  assert.deepEqual(colliders[0].center.map(value => Number(value.toFixed(6))), [
    2.34,
    3.95,
    6.09,
  ]);
  assert.equal(colliders[0].radius, profile.records[0].radius * 2);
  assert.equal(
    colliders[0].collisionMaskBit,
    profile.records[0].collisionMaskBit,
  );
});

test("native cloth waits for a coherent controller pose", () => {
  assert.deepEqual(buildNativeClothBodyColliders({
    modelCode: "INE_M",
    controllerFamily: null,
    controllerMatrices: null,
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  }), []);
});

test("native cloth never exposes a partial collision body", () => {
  assert.deepEqual(buildNativeClothBodyColliders({
    modelCode: "KOK_M",
    controllerFamily: { nodes: [{ type: 20, index: 0 }] },
    controllerMatrices: [BABYLON.Matrix.Identity().asArray()],
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  }), []);
});
