import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import {
  buildNativeClothPointAdvections,
  buildNativeClothRowForces,
} from "../play/characters/NativeClothForces.js";
import { nativeClothVelocityDamping } from "../play/characters/NativeClothProfiles.js";

function poseByType(entries) {
  return new Map(entries.map(([type, position]) => [
    type,
    BABYLON.Matrix.Translation(...position).asArray(),
  ]));
}

test("Ine-san's executable profile uses its controller-relative field", () => {
  const forces = buildNativeClothRowForces({
    modelCode: "INE_M",
    controlType: -0x46,
    rowCount: 3,
    matricesByType: poseByType([
      [0, [0, 1, 0]],
      [27, [-0.5, 0, 0]],
      [34, [0.5, 0, 0]],
    ]),
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  });
  assert.deepEqual(forces, Array.from({ length: 3 }, () => [
    0,
    -0.05444444715976715,
    0,
  ]));
});

test("Lan Di's profile changes to the authored secondary field at row three", () => {
  const forces = buildNativeClothRowForces({
    modelCode: "KOK_M",
    controlType: -0x47,
    rowCount: 5,
    matricesByType: poseByType([
      [0, [0, 0, 0]],
      [25, [-1, 1, 0]],
      [32, [1, 1, 0]],
      [27, [-1, 0, 1]],
      [34, [1, 0, 1]],
    ]),
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  });
  assert.deepEqual(forces.slice(0, 3), Array.from({ length: 3 }, () => [
    0,
    0.05444444715976715,
    0,
  ]));
  assert.deepEqual(forces.slice(3), Array.from({ length: 2 }, () => [
    0,
    0,
    0.05444444715976715,
  ]));
});

test("native runtime modes select the exact fixed downward field", () => {
  const forces = buildNativeClothRowForces({
    modelCode: "KOK_M",
    controlType: -0x47,
    rowCount: 2,
    matricesByType: new Map(),
    characterSpaceMatrix: BABYLON.Matrix.Scaling(2, 2, 2),
    runtimeMode: 1,
  });
  assert.deepEqual(forces, [
    [0, -0.1088888943195343, 0],
    [0, -0.1088888943195343, 0],
  ]);
});

test("runtime mode four preserves parent motion and weights wind across the lattice", () => {
  assert.deepEqual(nativeClothVelocityDamping("MGR_M", 4), [1, 1, 1]);
  const field = buildNativeClothPointAdvections({
    runtimeMode: 4,
    rowCount: 8,
    columnCount: 20,
    elapsedSeconds: 0,
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  });
  assert.equal(field.length, 160);
  assert.deepEqual(field.slice(0, 20), Array.from({ length: 20 }, () => [0, 0, 0]));
  assert.deepEqual(field[7 * 20], field[7 * 20 + 1]);
  assert.ok(Math.abs(
    field[7 * 20 + 15][0] - field[7 * 20][0] * 0.2,
  ) < 1e-9);
  assert.ok(Math.abs(
    field[7 * 20 + 15][2] - field[7 * 20][2] * 0.2,
  ) < 1e-9);
  assert.ok(field[7 * 20][0] > 0);
  assert.ok(field[7 * 20][2] > field[7 * 20][0]);
});

test("controller-relative profiles wait for every authored controller", () => {
  assert.equal(buildNativeClothRowForces({
    modelCode: "KOK_M",
    controlType: -0x47,
    rowCount: 7,
    matricesByType: poseByType([[0, [0, 0, 0]]]),
    characterSpaceMatrix: BABYLON.Matrix.Identity(),
  }), null);
});

test("every bundled cloth group resolves through the shared force contract", () => {
  const inventory = JSON.parse(fs.readFileSync(
    "tools/evidence/shenmue1-native-cloth-models.json",
    "utf8",
  ));
  const matricesByType = new Map(Array.from({ length: 256 }, (_, type) => [
    type,
    BABYLON.Matrix.Translation(
      0.01 + type * 0.013,
      0.02 + (type % 11) * 0.017,
      0.03 + (type % 7) * 0.019,
    ).asArray(),
  ]));
  for (const model of inventory.models) {
    for (const group of model.groups) {
      const forces = buildNativeClothRowForces({
        modelCode: model.modelCode,
        controlType: group.controlType,
        rowCount: group.topology.rowCount,
        matricesByType,
        characterSpaceMatrix: BABYLON.Matrix.Identity(),
      });
      assert.equal(forces.length, group.topology.rowCount, model.modelFile);
      assert.ok(forces.flat().every(Number.isFinite), model.modelFile);
    }
  }
});
