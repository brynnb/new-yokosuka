import assert from "node:assert/strict";
import test from "node:test";

import {
    advanceRyoShoulderRoll,
    evaluateRyoRuntimeControls,
    rowIdentity,
    RYO_RUNTIME_RIG,
} from "../src/ShenmueRuntimeRig.js";

test("defines Ryo's 37-record runtime hierarchy", () => {
    assert.equal(RYO_RUNTIME_RIG.length, 37);
    assert.deepEqual(RYO_RUNTIME_RIG[0].children, [1, 18]);
    assert.deepEqual(RYO_RUNTIME_RIG[20].children, [21, 25, 31]);
    assert.deepEqual(
        RYO_RUNTIME_RIG.filter((control) => control.solverClass === 4)
            .map((control) => control.index),
        [3, 8, 15, 20, 23, 29, 35],
    );
    assert.deepEqual(
        [6, 13, 14, 19, 22, 27, 33, 34].map(
            (index) => RYO_RUNTIME_RIG[index].defaultRotationRaw[2],
        ),
        [-16383, -16329, -102, 16384, 16384, -16384, -16451, 133],
    );
});

test("evaluates finite matrices from the default Ryo runtime rig", () => {
    const controls = RYO_RUNTIME_RIG.map((control) => ({
        position: [...control.defaultPosition],
        rotationRaw: [...control.defaultRotationRaw],
    }));
    // Class-4 values are absolute targets at runtime. For this structural
    // smoke test, place them at their default X lengths in world space.
    for (const index of [3, 8, 15, 20, 23, 29, 35]) {
        controls[index].position = [RYO_RUNTIME_RIG[index].defaultPosition[0], 0, 0];
    }
    const matrices = evaluateRyoRuntimeControls(controls, { rootMatrix: rowIdentity() });

    assert.equal(matrices.length, 37);
    assert.ok(matrices.every((matrix) => (
        matrix.length === 16 && matrix.every(Number.isFinite)
    )));
});

test("advances Shenmue's smoothed shoulder-roll state with integer truncation", () => {
    assert.deepEqual(
        advanceRyoShoulderRoll([1733, -705], [3667, -1560]),
        [1735, -706],
    );
});
