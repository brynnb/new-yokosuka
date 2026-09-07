#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
    parseRuntimeControlRecording,
    parseRuntimeMatrixRecording,
    RYO_YK_RENDER_MATRIX_ROUTES,
} from "../../src/RuntimeMatrixRecording.js";
import {
    advanceRyoShoulderRoll,
    evaluateRyoRuntimeControls,
    rowEulerRaw,
    rowMultiply,
    RYO_RUNTIME_RIG,
    ryoShoulderRollTargets,
} from "../../src/ShenmueRuntimeRig.js";

function usage() {
    console.error(
        "Usage: node tools/animation/compare_ryo_runtime_evaluator.js " +
        "<controls.csv> <matrices.csv> [--json]",
    );
}

function parseArgs(argv) {
    const args = { controls: "", matrices: "", json: false };
    for (const arg of argv) {
        if (arg === "--json") args.json = true;
        else if (!args.controls) args.controls = arg;
        else if (!args.matrices) args.matrices = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.controls || !args.matrices) {
        usage();
        process.exit(2);
    }
    return args;
}

function distance(left, right) {
    return Math.hypot(
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2],
    );
}

function rotationErrorDegrees(left, right) {
    let matrixDot = 0;
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            matrixDot += left[row * 4 + column] * right[row * 4 + column];
        }
    }
    const cosine = Math.max(-1, Math.min(1, (matrixDot - 1) / 2));
    return Math.acos(cosine) * 180 / Math.PI;
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function inverseRigidRow(matrix) {
    const position = matrix.slice(12, 15);
    return [
        matrix[0], matrix[4], matrix[8], 0,
        matrix[1], matrix[5], matrix[9], 0,
        matrix[2], matrix[6], matrix[10], 0,
        -dot(position, matrix.slice(0, 3)),
        -dot(position, matrix.slice(4, 7)),
        -dot(position, matrix.slice(8, 11)),
        1,
    ];
}

const DIRECT_CONTROL_INDICES = Object.freeze([
    1, 2, 3, 4, 5, 10, 11, 12, 17, 18, 21, 24, 25, 26, 30, 31, 32, 36,
]);

function synchronizedFrame(controlFrame, matrixFrame) {
    if (
        distance(
            controlFrame.controls[0].position,
            matrixFrame.matrices[0].slice(12, 15),
        ) > 1e-4
    ) {
        return false;
    }

    for (const index of DIRECT_CONTROL_INDICES) {
        const parent = RYO_RUNTIME_RIG[index].parent;
        const local = rowMultiply(
            matrixFrame.matrices[index],
            inverseRigidRow(matrixFrame.matrices[parent]),
        );
        const expectedPosition = index === 3
            ? RYO_RUNTIME_RIG[index].defaultPosition
            : controlFrame.controls[index].position;
        if (
            distance(expectedPosition, local.slice(12, 15)) > 1e-4
            || rotationErrorDegrees(
                rowEulerRaw(controlFrame.controls[index].rotationRaw),
                local,
            ) > 0.1
        ) {
            return false;
        }
    }

    if (![8, 15, 29, 35].every((index) => (
        distance(
            controlFrame.controls[index].position,
            matrixFrame.matrices[index].slice(12, 15),
        ) <= 1e-4
    ))) {
        return false;
    }

    for (const [parent, upper, target] of [[18, 19, 20], [21, 22, 23]]) {
        const rootPosition = matrixFrame.matrices[parent].slice(12, 15);
        const expectedDirection = normalizedDirection(
            rootPosition,
            controlFrame.controls[target].position,
        );
        if (
            distance(expectedDirection, matrixFrame.matrices[upper].slice(0, 3)) > 2e-4
        ) {
            return false;
        }
    }
    return true;
}

function poseChanged(previousControlFrame, previousMatrixFrame, controlFrame, matrixFrame) {
    if (!previousControlFrame || !previousMatrixFrame) return true;
    for (let index = 0; index < controlFrame.controls.length; index++) {
        const previous = previousControlFrame.controls[index];
        const current = controlFrame.controls[index];
        if (
            previous.rotationRaw.some((value, axis) => value !== current.rotationRaw[axis])
            || previous.position.some((value, axis) => value !== current.position[axis])
        ) {
            return true;
        }
    }
    return matrixFrame.matrices[0].some(
        (value, index) => value !== previousMatrixFrame.matrices[0][index],
    );
}

function capturedShoulderRollRaw(genericMatrices, capturedMatrices) {
    return [27, 33].map((index) => {
        const generic = genericMatrices[index];
        const captured = capturedMatrices[index];
        const appliedAngle = Math.atan2(
            dot(captured.slice(4, 7), generic.slice(8, 11)),
            dot(captured.slice(4, 7), generic.slice(4, 7)),
        );
        return Math.round(-appliedAngle * 65536 / (Math.PI * 2));
    });
}

function maximumMatrixError(left, right) {
    let error = 0;
    for (let index = 0; index < 12; index++) {
        error = Math.max(error, Math.abs(left[index] - right[index]));
    }
    return error;
}

function normalizedDirection(from, to) {
    const delta = to.map((value, index) => value - from[index]);
    const length = Math.hypot(...delta);
    return delta.map((value) => value / length);
}

function statistics(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return {
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        max: sorted.at(-1),
    };
}

function roundedStatistics(stats) {
    return stats && Object.fromEntries(
        Object.entries(stats).map(([key, value]) => [key, Number(value.toFixed(9))]),
    );
}

const args = parseArgs(process.argv.slice(2));
const controlPath = path.resolve(args.controls);
const matrixPath = path.resolve(args.matrices);
const controls = parseRuntimeControlRecording(fs.readFileSync(controlPath, "utf8"));
const matrices = parseRuntimeMatrixRecording(fs.readFileSync(matrixPath, "utf8"));
if (controls.frames.length !== matrices.frames.length) {
    throw new Error("Control and matrix recordings have different frame counts.");
}

const routeIndices = new Set(RYO_YK_RENDER_MATRIX_ROUTES.map(([, index]) => index));
const samples = Array.from({ length: 37 }, () => ({
    position: [],
    rotation: [],
    matrix: [],
}));
let rootCoherentFrameCount = 0;
let synchronizedFrameCount = 0;
let shoulderRollRaw = null;
let previousSynchronizedControlFrame = null;
let previousSynchronizedMatrixFrame = null;
for (let frameIndex = 0; frameIndex < controls.frames.length; frameIndex++) {
    const controlFrame = controls.frames[frameIndex];
    const matrixFrame = matrices.frames[frameIndex];
    if (
        controlFrame.frame !== matrixFrame.frame
        || controlFrame.phase !== matrixFrame.phase
    ) {
        throw new Error(`Recordings diverge at row ${frameIndex + 1}.`);
    }
    if (
        distance(
            controlFrame.controls[0].position,
            matrixFrame.matrices[0].slice(12, 15),
        ) > 1e-4
    ) {
        shoulderRollRaw = null;
        previousSynchronizedControlFrame = null;
        previousSynchronizedMatrixFrame = null;
        continue;
    }

    rootCoherentFrameCount++;
    if (!synchronizedFrame(controlFrame, matrixFrame)) {
        shoulderRollRaw = null;
        previousSynchronizedControlFrame = null;
        previousSynchronizedMatrixFrame = null;
        continue;
    }

    synchronizedFrameCount++;
    const generic = evaluateRyoRuntimeControls(controlFrame.controls, {
        rootMatrix: matrixFrame.matrices[0],
    });
    const changed = poseChanged(
        previousSynchronizedControlFrame,
        previousSynchronizedMatrixFrame,
        controlFrame,
        matrixFrame,
    );
    if (!shoulderRollRaw) {
        shoulderRollRaw = capturedShoulderRollRaw(generic, matrixFrame.matrices);
    } else if (changed) {
        shoulderRollRaw = advanceRyoShoulderRoll(
            shoulderRollRaw,
            ryoShoulderRollTargets(generic),
        );
    }
    const evaluated = evaluateRyoRuntimeControls(controlFrame.controls, {
        rootMatrix: matrixFrame.matrices[0],
        shoulderRollRaw,
    });
    previousSynchronizedControlFrame = controlFrame;
    previousSynchronizedMatrixFrame = matrixFrame;

    for (let index = 0; index < evaluated.length; index++) {
        samples[index].position.push(distance(
            evaluated[index].slice(12, 15),
            matrixFrame.matrices[index].slice(12, 15),
        ));
        samples[index].rotation.push(rotationErrorDegrees(
            evaluated[index],
            matrixFrame.matrices[index],
        ));
        samples[index].matrix.push(maximumMatrixError(
            evaluated[index],
            matrixFrame.matrices[index],
        ));
    }
}

const perControl = samples.map((sample, index) => ({
    index,
    renderRouted: routeIndices.has(index),
    positionError: roundedStatistics(statistics(sample.position)),
    rotationErrorDegrees: roundedStatistics(statistics(sample.rotation)),
    matrixElementError: roundedStatistics(statistics(sample.matrix)),
}));
const routed = perControl.filter((control) => control.renderRouted);
const report = {
    schema: "shenmue-runtime-rig-evaluator-comparison-v1",
    controls: controlPath,
    matrices: matrixPath,
    frameCount: controls.frames.length,
    rootCoherentFrameCount,
    synchronizedFrameCount,
    routedMatrixCount: routed.length,
    routedPositionError: roundedStatistics(statistics(
        routed.flatMap((control) => control.positionError
            ? [control.positionError.max]
            : []),
    )),
    routedRotationErrorDegrees: roundedStatistics(statistics(
        routed.flatMap((control) => control.rotationErrorDegrees
            ? [control.rotationErrorDegrees.max]
            : []),
    )),
    routedMatrixElementError: roundedStatistics(statistics(
        routed.flatMap((control) => control.matrixElementError
            ? [control.matrixElementError.max]
            : []),
    )),
    perControl,
};

if (args.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log([
        `frames=${report.frameCount}`,
        `root-coherent=${report.rootCoherentFrameCount}`,
        `synchronized=${report.synchronizedFrameCount}`,
        `routed=${report.routedMatrixCount}`,
        `maxRoutedPositionError=${report.routedPositionError.max}`,
        `maxRoutedRotationErrorDegrees=${report.routedRotationErrorDegrees.max}`,
        `maxRoutedMatrixElementError=${report.routedMatrixElementError.max}`,
    ].join(" "));
    console.log("idx routed max-position-error max-rotation-error-deg max-matrix-element-error");
    for (const control of perControl) {
        console.log([
            String(control.index).padStart(2),
            control.renderRouted ? "yes" : " no",
            control.positionError.max.toExponential(3).padStart(18),
            control.rotationErrorDegrees.max.toFixed(6).padStart(22),
            control.matrixElementError.max.toExponential(3).padStart(24),
        ].join(" "));
    }
}
