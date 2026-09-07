import assert from "node:assert/strict";
import test from "node:test";

import {
    analyzeRyoMotnRootMotion,
    createRyoMotnControls,
    ryoMotnFrameForGameTick,
    ryoMotnGameplayTiming,
    splitHumanoidActorTranslation,
    splitRyoActorTranslation,
    removeHumanoidPoseHeading,
} from "../src/RyoMotnRuntime.js";

test("native Ryo mirroring swaps paired curves and transforms target profiles", () => {
    const sequence = { valueData: { curves: [
        { boneId: 0, channel: "ry", samples: [{ frame: 0, value: 0.125 }] },
        { boneId: 8, channel: "tx", samples: [{ frame: 0, value: 0.2 }] },
        { boneId: 15, channel: "tx", samples: [{ frame: 0, value: -0.3 }] },
        { boneId: 5, channel: "rx", samples: [{ frame: 0, value: 0.125 }] },
    ] } };
    const ordinary = createRyoMotnControls(sequence, 0);
    const mirrored = createRyoMotnControls(sequence, 0, { mirror: true });
    assert.equal(mirrored[0].rotationRaw[1], -ordinary[0].rotationRaw[1]);
    assert.equal(mirrored[8].position[0], 0.3);
    assert.equal(mirrored[15].position[0], -0.2);
    assert.equal(mirrored[12].rotationRaw[0], -8192);
    assert.equal(ordinary[8].position[0], 0.2);
});

test("turn pose heading is removed without losing height or relative footwork", () => {
    const root = [0,0,-1,0, 0,1,0,0, 1,0,0,0, 0.1,1.2,0.2,1];
    const foot = [...root]; foot[12] = 0.4; foot[13] = 0;
    const [poseRoot, poseFoot] = removeHumanoidPoseHeading([root, foot]);
    assert.ok(Math.abs(Math.atan2(poseRoot[8], poseRoot[10])) < 1e-10);
    assert.equal(poseRoot[13], 1.2);
    assert.equal(poseFoot[13], 0);
    assert.ok(Math.abs(Math.hypot(poseFoot[12]-poseRoot[12], poseFoot[14]-poseRoot[14])-0.3) < 1e-10);
    assert.equal(root[8], 1);
});

test("maps extracted MOTN channels into Ryo's runtime control records", () => {
    const sequence = {
        valueData: {
            curves: [
                {
                    boneId: 1,
                    channel: "ry",
                    samples: [{ frame: 0, value: 0.75 }],
                },
                {
                    boneId: 8,
                    channel: "tx",
                    samples: [{ frame: 0, value: 0.125 }],
                },
            ],
        },
    };
    const controls = createRyoMotnControls(sequence, 0);

    assert.equal(controls.length, 37);
    assert.deepEqual(controls[2].rotationRaw, [0, 0, -16384]);
    assert.equal(controls[1].rotationRaw[1], -16384);
    assert.equal(controls[1].rotationCurveAddress, 1);
    assert.equal(controls[8].position[0], 0.125);
    assert.equal(controls[8].translationCurveAddress, 1);
    assert.equal(controls[3].translationCurveAddress, 0);
});

test("uses the captured 37-sample / 36-frame-span / 28-game-tick walk rate", () => {
    const sequence = { name: "A_WALK_L_02", durationFrames: 37 };

    assert.deepEqual(ryoMotnGameplayTiming(sequence), {
        sourceFrames: 37,
        sourceFrameSpan: 36,
        gameTicksPerCycle: 28,
        sourceFramesPerGameTick: 36 / 28,
    });
    assert.ok(
        Math.abs(
            ryoMotnFrameForGameTick(sequence, 1) - 36 / 28,
        ) < 1e-12,
    );
    assert.equal(ryoMotnFrameForGameTick(sequence, 28), 0);
    assert.ok(
        Math.abs(
            ryoMotnFrameForGameTick(sequence, -1) - (36 - 36 / 28),
        ) < 1e-12,
    );
});

test("applies the gameplay walk routes recovered from the SH-4 sampler", () => {
    const rotation = (boneId, values) => (
        ["rx", "ry", "rz"].map((channel, axis) => ({
            boneId,
            channel,
            samples: [{ frame: 0, value: values[axis] }],
        }))
    );
    const translation = (boneId, values) => (
        ["tx", "ty", "tz"].map((channel, axis) => ({
            boneId,
            channel,
            samples: [{ frame: 0, value: values[axis] }],
        }))
    );
    const sequence = {
        name: "A_WALK_L_02",
        durationFrames: 37,
        valueData: {
            curves: [
                {
                    boneId: 1,
                    channel: "rx",
                    samples: [
                        { frame: 0, value: 0 },
                        { frame: 18, value: 0.125 },
                        { frame: 36, value: 0 },
                    ],
                },
                ...rotation(5, [1359 / 65536, -127 / 65536, -364 / 65536]),
                ...rotation(12, [-1373 / 65536, 127 / 65536, 364 / 65536]),
                ...rotation(21, [-16376 / 65536, 2912 / 65536, -0.25]),
                ...rotation(25, [100 / 65536, 200 / 65536, 300 / 65536]),
                ...rotation(31, [-400 / 65536, 500 / 65536, 600 / 65536]),
                ...translation(8, [1, 0.1, 3]),
                ...translation(15, [4, 0.11, 6]),
                ...translation(29, [7, 8, 9]),
                ...translation(35, [10, 11, 12]),
            ],
        },
    };

    const controls = createRyoMotnControls(sequence, 0);

    assert.equal(controls[1].rotationRaw[0], -8192);
    assert.deepEqual(controls[5].rotationRaw, [1373, -127, 364]);
    assert.deepEqual(controls[12].rotationRaw, [-1359, 127, -364]);
    assert.deepEqual(controls[21].rotationRaw, [-16376, 29856, -16384]);
    assert.deepEqual(controls[25].rotationRaw, [400, -500, 600]);
    assert.deepEqual(controls[31].rotationRaw, [-100, -200, 300]);
    assert.deepEqual(controls[8].position, [-4, 0.117, 6]);
    assert.deepEqual(controls[15].position, [-1, 0.117, 3]);
    assert.deepEqual(controls[29].position, [-10, 11, 12]);
    assert.deepEqual(controls[35].position, [-7, 8, 9]);
});

test("extracts horizontal actor travel without cancelling root pose rotation", () => {
    const matrices = Array.from({ length: 37 }, (_, index) => [
        1, 0, 0, 0,
        0, 0, 1, 0,
        0, -1, 0, 0,
        4 + index, 0.52 + index, -8 + index, 1,
    ]);
    const { actorTranslation, poseMatrices } = splitRyoActorTranslation(matrices);

    assert.deepEqual(actorTranslation, [4, 0, -8]);
    assert.deepEqual(poseMatrices[0], [
        1, 0, 0, 0,
        0, 0, 1, 0,
        0, -1, 0, 0,
        0, 0.52, 0, 1,
    ]);
    assert.deepEqual(poseMatrices[1].slice(12, 15), [1, 1.52, 1]);
    assert.deepEqual(poseMatrices[0].slice(0, 12), matrices[0].slice(0, 12));
});

test("can remove average travel while retaining authored root deviation", () => {
    const matrices = Array.from({ length: 2 }, (_, index) => [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0.4 + index, 0, -0.3 - index, 1,
    ]);
    const { actorTranslation, poseMatrices } = splitHumanoidActorTranslation(
        matrices,
        {
            actorTranslation: [0.25, 0, -0.5],
        },
    );

    assert.deepEqual(actorTranslation, [0.25, 0, -0.5]);
    assert.ok(Math.abs(poseMatrices[0][12] - 0.15) < 1e-12);
    assert.equal(poseMatrices[0][13], 0);
    assert.ok(Math.abs(poseMatrices[0][14] - 0.2) < 1e-12);
    assert.ok(Math.abs(poseMatrices[1][12] - 1.15) < 1e-12);
    assert.equal(poseMatrices[1][13], 0);
    assert.ok(Math.abs(poseMatrices[1][14] + 0.8) < 1e-12);
});

test("classifies closed root sway as pose motion and directional travel as actor motion", () => {
    const curve = (samples) => ({
        boneId: 0,
        channel: "tz",
        samples: samples.map(([frame, value]) => ({
            frame,
            value,
            incomingTangent: 0,
            outgoingTangent: 0,
        })),
    });
    const stationary = {
        durationFrames: 40,
        valueData: {
            curves: [curve([[0, 0], [19, -0.006], [39, 0]])],
        },
    };
    const traveling = {
        durationFrames: 40,
        valueData: {
            curves: [curve([[0, 0], [39, -1.4]])],
        },
    };

    const poseMotion = analyzeRyoMotnRootMotion(stationary);
    const actorMotion = analyzeRyoMotnRootMotion(traveling);

    assert.equal(poseMotion.kind, "pose");
    assert.equal(poseMotion.cycleDisplacement, 0);
    assert.ok(poseMotion.sampledPathLength > 0.011);
    assert.equal(actorMotion.kind, "travel");
    assert.equal(actorMotion.cycleDisplacement, 1.4);
    assert.ok(actorMotion.directionality > 0.999);
});

test("retains stationary horizontal root sway and planted absolute targets", () => {
    const matrices = Array.from({ length: 37 }, (_, index) => [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        index * 0.1, index * 0.2, -0.006 + index * 0.3, 1,
    ]);
    const result = splitRyoActorTranslation(matrices, {
        extractHorizontal: false,
    });

    assert.deepEqual(result.actorTranslation, [0, 0, 0]);
    assert.deepEqual(result.poseMatrices, matrices);
    assert.notEqual(result.poseMatrices[0], matrices[0]);
});
