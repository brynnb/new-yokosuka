import assert from "node:assert/strict";
import test from "node:test";

import {
    advanceRyoShoulderRoll,
    evaluateHumanoidRuntimeControls,
    evaluateRyoRuntimeControls,
    rowEulerRaw,
    rowIdentity,
    rowMultiply,
    RYO_RUNTIME_RIG,
} from "../src/ShenmueRuntimeRig.js";
import controllerFamilies from "../src/data/shenmue-controller-families.web.js";

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

test("native ankle reset flags preserve the actor frame across all descriptor families", () => {
    for (const family of controllerFamilies.families) {
        const rig = family.nodes;
        const controls = rig.map(node => ({ position: [...node.defaultPosition],
            rotationRaw: [...node.defaultRotationRaw] }));
        for (const node of rig.filter(node => node.solverClass === 4)) {
            controls[node.index].position = [node.defaultPosition[0], 0, 0];
        }
        const actorBasis = rowEulerRaw([0, 12000, 0]);
        const ankles = rig.filter(node => node.descriptorHeader[3]);
        assert.ok(ankles.every(node => node.solverClass === 4 && [26, 33].includes(node.type)));
        for (const ankle of ankles) {
            controls[ankle.children[0]].rotationRaw = [2500, -3100, 700];
        }
        const matrices = evaluateHumanoidRuntimeControls(controls, { runtimeRig: rig, rootBasis: actorBasis });
        for (const ankle of ankles) {
            const foot = ankle.children[0];
            const expected = rowMultiply(rowEulerRaw(controls[foot].rotationRaw), actorBasis);
            for (const element of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
                assert.ok(Math.abs(matrices[foot][element] - expected[element]) < 1e-10,
                    `family ${family.index} foot ${foot} orientation ${element}`);
            }
            const translation = controls[foot].position;
            for (let axis = 0; axis < 3; axis++) {
                const expectedPosition = matrices[ankle.index][12 + axis]
                    + translation.reduce((sum, value, row) => sum + value * actorBasis[row * 4 + axis], 0);
                assert.ok(Math.abs(matrices[foot][12 + axis] - expectedPosition) < 1e-10);
            }
        }
    }
});
