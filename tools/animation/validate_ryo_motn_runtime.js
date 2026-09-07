#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { MotnLoader } from "../../src/MotnLoader.js";
import {
    evaluateRyoMotnFrame,
    ryoMotnFrameForGameTick,
    ryoMotnGameplayTiming,
} from "../../src/RyoMotnRuntime.js";
import { RYO_YK_RENDER_MATRIX_ROUTES } from "../../src/RuntimeMatrixRecording.js";
import { RYO_RUNTIME_RIG } from "../../src/ShenmueRuntimeRig.js";

const DEFAULT_MOTION = ".disc-work/runtime-motion/MOTION.BIN";
const DEFAULT_SEQUENCE = "A_WALK_L_02";

function parseArgs(argv) {
    const args = {
        motion: DEFAULT_MOTION,
        sequence: DEFAULT_SEQUENCE,
        json: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--motion") args.motion = argv[++index] || "";
        else if (arg === "--sequence") args.sequence = argv[++index] || "";
        else if (arg === "--json") args.json = true;
        else {
            throw new Error(
                "Usage: node tools/animation/validate_ryo_motn_runtime.js " +
                "[--motion MOTION.BIN] [--sequence NAME] [--json]",
            );
        }
    }
    return args;
}

function position(matrix) {
    return matrix.slice(12, 15);
}

function distance(left, right) {
    return Math.hypot(...left.map((value, index) => value - right[index]));
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function matrixInvariantError(matrix) {
    let error = Math.max(
        Math.abs(matrix[3]),
        Math.abs(matrix[7]),
        Math.abs(matrix[11]),
        Math.abs(matrix[15] - 1),
    );
    for (let row = 0; row < 3; row++) {
        const axis = matrix.slice(row * 4, row * 4 + 3);
        error = Math.max(error, Math.abs(dot(axis, axis) - 1));
        for (let other = row + 1; other < 3; other++) {
            error = Math.max(
                error,
                Math.abs(dot(axis, matrix.slice(other * 4, other * 4 + 3))),
            );
        }
    }
    return error;
}

function settleShoulders(sequence) {
    let state = [0, 0];
    const timing = ryoMotnGameplayTiming(sequence);
    for (let cycle = 0; cycle < 64; cycle++) {
        const before = [...state];
        for (let tick = 0; tick < timing.gameTicksPerCycle; tick++) {
            const frame = ryoMotnFrameForGameTick(sequence, tick);
            state = evaluateRyoMotnFrame(sequence, frame, {
                shoulderRollRaw: state,
            }).shoulderRollRaw;
        }
        if (before.every((value, index) => value === state[index])) break;
    }
    return state;
}

const args = parseArgs(process.argv.slice(2));
const motionPath = path.resolve(args.motion);
const motion = MotnLoader.parse(fs.readFileSync(motionPath));
const sequence = motion.getSequence(args.sequence);
if (!sequence) throw new Error(`MOTN sequence not found: ${args.sequence}`);

const lengthChecks = [
    [2, 3, RYO_RUNTIME_RIG[3].defaultPosition[0]],
    [6, 7, RYO_RUNTIME_RIG[7].defaultPosition[0]],
    [7, 8, RYO_RUNTIME_RIG[8].defaultPosition[0]],
    [13, 14, RYO_RUNTIME_RIG[14].defaultPosition[0]],
    [14, 15, RYO_RUNTIME_RIG[15].defaultPosition[0]],
    [18, 20, RYO_RUNTIME_RIG[20].defaultPosition[0]],
    [21, 23, RYO_RUNTIME_RIG[23].defaultPosition[0]],
    [27, 28, RYO_RUNTIME_RIG[28].defaultPosition[0]],
    [28, 29, RYO_RUNTIME_RIG[29].defaultPosition[0]],
    [33, 34, RYO_RUNTIME_RIG[34].defaultPosition[0]],
    [34, 35, RYO_RUNTIME_RIG[35].defaultPosition[0]],
];

let shoulderRollRaw = settleShoulders(sequence);
let nonFiniteValueCount = 0;
let maximumMatrixInvariantError = 0;
let maximumSolverLengthError = 0;
const timing = ryoMotnGameplayTiming(sequence);
for (let tick = 0; tick < timing.gameTicksPerCycle; tick++) {
    const frame = ryoMotnFrameForGameTick(sequence, tick);
    const result = evaluateRyoMotnFrame(sequence, frame, { shoulderRollRaw });
    shoulderRollRaw = result.shoulderRollRaw;
    for (const matrix of result.matrices) {
        nonFiniteValueCount += matrix.filter((value) => !Number.isFinite(value)).length;
        maximumMatrixInvariantError = Math.max(
            maximumMatrixInvariantError,
            matrixInvariantError(matrix),
        );
    }
    for (const [from, to, expected] of lengthChecks) {
        maximumSolverLengthError = Math.max(
            maximumSolverLengthError,
            Math.abs(
                distance(position(result.matrices[from]), position(result.matrices[to]))
                - expected
            ),
        );
    }
}

const start = evaluateRyoMotnFrame(sequence, 0, {
    shoulderRollRaw,
    advanceShoulderRoll: false,
});
const end = evaluateRyoMotnFrame(sequence, timing.sourceFrameSpan, {
    shoulderRollRaw,
    advanceShoulderRoll: false,
});
const rootCycleDisplacement = end.controls[0].position.map(
    (value, index) => value - start.controls[0].position[index],
);
const report = {
    schema: "shenmue-ryo-motn-runtime-validation-v1",
    motion: motionPath,
    sequence: sequence.name,
    durationFrames: sequence.durationFrames,
    sourceFrameSpan: timing.sourceFrameSpan,
    gameTicksPerCycle: timing.gameTicksPerCycle,
    sourceFramesPerGameTick: timing.sourceFramesPerGameTick,
    channelCount: sequence.channelCount,
    runtimeControlCount: RYO_RUNTIME_RIG.length,
    renderRouteCount: RYO_YK_RENDER_MATRIX_ROUTES.length,
    nonFiniteValueCount,
    maximumMatrixInvariantError,
    maximumSolverLengthError,
    rootCycleDisplacement,
    settledShoulderRollRaw: shoulderRollRaw,
};

if (args.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log([
        `sequence=${report.sequence}`,
        `frames=${report.durationFrames}`,
        `channels=${report.channelCount}`,
        `controls=${report.runtimeControlCount}`,
        `routes=${report.renderRouteCount}`,
    ].join(" "));
    console.log([
        `nonFinite=${report.nonFiniteValueCount}`,
        `maxMatrixInvariantError=${report.maximumMatrixInvariantError}`,
        `maxSolverLengthError=${report.maximumSolverLengthError}`,
        `rootCycleDisplacement=${report.rootCycleDisplacement.join(",")}`,
        `shoulderRaw=${report.settledShoulderRollRaw.join(",")}`,
    ].join(" "));
}
