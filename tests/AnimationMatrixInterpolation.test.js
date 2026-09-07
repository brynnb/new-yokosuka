import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";

import {
  interpolateAffineMatrix,
  interpolateMatrixRouteMaps,
  interpolateMatrixRoutes,
} from "../src/AnimationMatrixInterpolation.js";

function closeTo(actual, expected, tolerance = 1e-6) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} was not within ${tolerance} of ${expected}`,
    );
}

test("preserves exact affine interpolation endpoints", () => {
    const start = BABYLON.Matrix.Identity().asArray();
    const end = BABYLON.Matrix.Compose(
        BABYLON.Vector3.One(),
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI / 2),
        new BABYLON.Vector3(10, 2, -4),
    ).asArray();

    assert.deepEqual(interpolateAffineMatrix(start, end, 0), [...start]);
    assert.deepEqual(interpolateAffineMatrix(start, end, 1), [...end]);
});

test("lerps translation and slerps rotation between game ticks", () => {
    const start = BABYLON.Matrix.Identity().asArray();
    const end = BABYLON.Matrix.Compose(
        BABYLON.Vector3.One(),
        BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, Math.PI / 2),
        new BABYLON.Vector3(10, 2, -4),
    ).asArray();
    const midpoint = BABYLON.Matrix.FromArray(
        interpolateAffineMatrix(start, end, 0.5),
    );
    const scale = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const translation = new BABYLON.Vector3();
    assert.equal(midpoint.decompose(scale, rotation, translation), true);

    closeTo(translation.x, 5);
    closeTo(translation.y, 1);
    closeTo(translation.z, -2);
    closeTo(2 * Math.acos(Math.abs(rotation.w)), Math.PI / 4);
});

test("interpolates only the requested render routes", () => {
    const identity = [...BABYLON.Matrix.Identity().asArray()];
    const translated = [...BABYLON.Matrix.Translation(4, 0, 0).asArray()];
    const routes = new Map([
        [0x1000, 1],
        [0x2000, 0],
    ]);
    const result = interpolateMatrixRoutes(
        [identity, identity],
        [identity, translated],
        routes,
        0.25,
    );

    assert.deepEqual([...result.keys()], [0x1000, 0x2000]);
    closeTo(result.get(0x1000)[12], 1);
    closeTo(result.get(0x2000)[12], 0);
});

test("crossfades already-routed skeletal matrices", () => {
  const identity = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
  const translated = [...identity];
  translated[12] = 2;

  const halfway = interpolateMatrixRouteMaps(
    new Map([[4, identity]]),
    new Map([[4, translated]]),
    0.5,
  );

  assert.equal(halfway.get(4)[12], 1);
});
