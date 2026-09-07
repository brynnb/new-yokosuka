#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { MotnLoader } from "../../src/MotnLoader.js";
import {
    createRyoMotnControls,
    evaluateRyoMotnFrame,
    ryoMotnGameplayTiming,
} from "../../src/RyoMotnRuntime.js";
import {
    evaluateRyoRuntimeControls,
} from "../../src/ShenmueRuntimeRig.js";
import {
    parseRuntimeControlRecording,
    parseRuntimeMatrixRecording,
    RYO_YK_RENDER_MATRIX_ROUTES,
} from "../../src/RuntimeMatrixRecording.js";

const DEFAULT_MOTION = ".disc-work/runtime-motion/MOTION.BIN";
const DEFAULT_CONTROLS = "captures/skeleton/ryo-controls-1784830335.csv";
const DEFAULT_MATRICES = "captures/skeleton/ryo-matrices-1784830335.csv";
const DEFAULT_CANDIDATES = ["A_WALK_L_02", "AKI_AKI_WALK_LP"];
const ROTATION_MATRIX_ELEMENTS = [0, 1, 2, 4, 5, 6, 8, 9, 10];
const TRANSLATION_MATRIX_ELEMENTS = [12, 13, 14];
const MATRIX_ELEMENTS = [
    ...ROTATION_MATRIX_ELEMENTS,
    ...TRANSLATION_MATRIX_ELEMENTS,
];

function parseArgs(argv) {
    const args = {
        motion: DEFAULT_MOTION,
        controls: DEFAULT_CONTROLS,
        matrices: DEFAULT_MATRICES,
        candidates: [],
        json: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--motion") args.motion = argv[++index] || "";
        else if (arg === "--controls") args.controls = argv[++index] || "";
        else if (arg === "--matrices") args.matrices = argv[++index] || "";
        else if (arg === "--candidate") args.candidates.push(argv[++index] || "");
        else if (arg === "--json") args.json = true;
        else {
            throw new Error(
                "Usage: node tools/animation/compare_ryo_extracted_walk.js " +
                "[--motion MOTION.BIN] [--controls CONTROLS.csv] " +
                "[--matrices MATRICES.csv] [--candidate NAME] [--json]",
            );
        }
    }
    if (args.candidates.length === 0) args.candidates = DEFAULT_CANDIDATES;
    return args;
}

function signedInt16(value) {
    const wrapped = ((value % 65536) + 65536) % 65536;
    return wrapped >= 32768 ? wrapped - 65536 : wrapped;
}

function rotationDelta(left, right) {
    return signedInt16(left - right);
}

function distance(left, right) {
    return Math.hypot(...left.map((value, index) => value - right[index]));
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

function rowMultiply(left, right) {
    const output = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            for (let inner = 0; inner < 4; inner++) {
                output[row * 4 + column] += (
                    left[row * 4 + inner] * right[inner * 4 + column]
                );
            }
        }
    }
    return output;
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

function rootLocalMatrices(frame) {
    const inverseRoot = inverseRigidRow(frame.matrices[0]);
    return frame.matrices.map((matrix) => rowMultiply(matrix, inverseRoot));
}

function rotationKey(frame) {
    return frame.controls.flatMap((control) => control.rotationRaw).join(",");
}

function coherentWalkTicks(controls, matrices) {
    const matrixByFrame = new Map(matrices.frames.map((frame) => (
        [`${frame.frame}:${frame.phase}`, frame]
    )));
    const ticks = [];
    let previousKey = null;
    for (const controlFrame of controls.frames) {
        if (!/^walk/i.test(controlFrame.phase)) {
            continue;
        }
        const matrixFrame = matrixByFrame.get(
            `${controlFrame.frame}:${controlFrame.phase}`,
        );
        if (
            !matrixFrame
            || distance(
                controlFrame.controls[0].position,
                matrixFrame.matrices[0].slice(12, 15),
            ) > 1e-4
        ) {
            continue;
        }
        const key = rotationKey(controlFrame);
        if (key === previousKey) continue;
        ticks.push({ controlFrame, matrixFrame, key });
        previousKey = key;
    }
    return ticks;
}

function findExactPeriod(ticks) {
    for (let start = 0; start < ticks.length; start++) {
        for (let end = start + 4; end < ticks.length; end++) {
            if (ticks[start].key === ticks[end].key) {
                return {
                    start,
                    period: end - start,
                    startFrame: ticks[start].controlFrame.frame,
                    repeatFrame: ticks[end].controlFrame.frame,
                };
            }
        }
    }
    throw new Error("No exact repeated runtime walk pose was found.");
}

function circularMean(values) {
    const scale = Math.PI * 2 / 65536;
    const x = values.reduce((sum, value) => sum + Math.cos(value * scale), 0);
    const y = values.reduce((sum, value) => sum + Math.sin(value * scale), 0);
    return Math.round(Math.atan2(y, x) / scale);
}

function dynamicCapturedAxes(samples) {
    const axes = [];
    for (let control = 0; control < samples[0].controlFrame.controls.length; control++) {
        for (let axis = 0; axis < 3; axis++) {
            const values = samples.map(
                (sample) => sample.controlFrame.controls[control].rotationRaw[axis],
            );
            const anchor = values[0];
            const maximumDelta = Math.max(
                ...values.map((value) => Math.abs(rotationDelta(value, anchor))),
            );
            if (maximumDelta > 4) axes.push([control, axis]);
        }
    }
    return axes;
}

function sampledControls(sequence, phase, count) {
    const timing = ryoMotnGameplayTiming(sequence);
    const rate = timing.sourceFrameSpan / count;
    return Array.from({ length: count }, (_, tick) => {
        const unwrapped = phase + tick * rate;
        const frame = (
            (unwrapped % timing.sourceFrameSpan) + timing.sourceFrameSpan
        ) % timing.sourceFrameSpan;
        return createRyoMotnControls(sequence, frame);
    });
}

function controlResidual(sequence, phase, samples, axes) {
    const predicted = sampledControls(sequence, phase, samples.length);
    let squared = 0;
    let count = 0;
    for (const [control, axis] of axes) {
        const deltas = samples.map((sample, tick) => rotationDelta(
            sample.controlFrame.controls[control].rotationRaw[axis],
            predicted[tick][control].rotationRaw[axis],
        ));
        const staticOffset = circularMean(deltas);
        for (const delta of deltas) {
            squared += rotationDelta(delta, staticOffset) ** 2;
            count++;
        }
    }
    return Math.sqrt(squared / Math.max(1, count));
}

function fitPhase(sequence, samples, axes) {
    const { sourceFrameSpan } = ryoMotnGameplayTiming(sequence);
    let best = { phase: 0, rotationResidualRaw: Infinity };
    const search = (from, to, step) => {
        for (let phase = from; phase < to; phase += step) {
            const wrapped = (
                (phase % sourceFrameSpan) + sourceFrameSpan
            ) % sourceFrameSpan;
            const residual = controlResidual(sequence, wrapped, samples, axes);
            if (residual < best.rotationResidualRaw) {
                best = { phase: wrapped, rotationResidualRaw: residual };
            }
        }
    };
    search(0, sourceFrameSpan, 0.05);
    search(best.phase - 0.1, best.phase + 0.1, 0.001);
    return best;
}

function settleShoulders(sequence, phase, period) {
    let state = [0, 0];
    const { sourceFrameSpan } = ryoMotnGameplayTiming(sequence);
    const rate = sourceFrameSpan / period;
    for (let cycle = 0; cycle < 64; cycle++) {
        const before = [...state];
        for (let tick = 0; tick < period; tick++) {
            const frame = (
                phase + tick * rate
            ) % sourceFrameSpan;
            state = evaluateRyoMotnFrame(sequence, frame, {
                shoulderRollRaw: state,
            }).shoulderRollRaw;
        }
        if (before.every((value, index) => value === state[index])) break;
    }
    return state;
}

function matrixComparison(sequence, phase, samples, options = {}) {
    let shoulderRollRaw = settleShoulders(sequence, phase, samples.length);
    const { sourceFrameSpan } = ryoMotnGameplayTiming(sequence);
    const rate = sourceFrameSpan / samples.length;
    const errors = new Map(RYO_YK_RENDER_MATRIX_ROUTES.map(([key, index]) => (
        [index, {
            key,
            squared: 0,
            count: 0,
            maximum: 0,
            rotationSquared: 0,
            rotationCount: 0,
            translationSquared: 0,
            translationCount: 0,
        }]
    )));
    for (let tick = 0; tick < samples.length; tick++) {
        const frame = (phase + tick * rate) % sourceFrameSpan;
        if (options.alignCapturedShoulders) {
            const capturedGeneric = evaluateRyoRuntimeControls(
                samples[tick].controlFrame.controls,
                { rootMatrix: samples[tick].matrixFrame.matrices[0] },
            );
            shoulderRollRaw = capturedShoulderRollRaw(
                capturedGeneric,
                samples[tick].matrixFrame.matrices,
            );
        }
        const evaluated = evaluateRyoMotnFrame(sequence, frame, {
            shoulderRollRaw,
            advanceShoulderRoll: !options.alignCapturedShoulders,
        });
        shoulderRollRaw = evaluated.shoulderRollRaw;
        const extractedLocal = rootLocalMatrices(evaluated);
        const capturedLocal = rootLocalMatrices(samples[tick].matrixFrame);
        for (const [index, stats] of errors) {
            for (const element of MATRIX_ELEMENTS) {
                const error = (
                    extractedLocal[index][element] - capturedLocal[index][element]
                );
                stats.squared += error * error;
                stats.count++;
                stats.maximum = Math.max(stats.maximum, Math.abs(error));
                if (ROTATION_MATRIX_ELEMENTS.includes(element)) {
                    stats.rotationSquared += error * error;
                    stats.rotationCount++;
                } else {
                    stats.translationSquared += error * error;
                    stats.translationCount++;
                }
            }
        }
    }
    const routes = [...errors.entries()].map(([matrixIndex, stats]) => ({
        renderKey: stats.key,
        matrixIndex,
        rms: Math.sqrt(stats.squared / stats.count),
        rotationRms: Math.sqrt(stats.rotationSquared / stats.rotationCount),
        translationRms: Math.sqrt(
            stats.translationSquared / stats.translationCount,
        ),
        maximum: stats.maximum,
    }));
    return {
        overallRms: Math.sqrt(
            routes.reduce((sum, route) => sum + route.rms ** 2, 0)
            / routes.length,
        ),
        routes,
    };
}

const args = parseArgs(process.argv.slice(2));
const controlPath = path.resolve(args.controls);
const matrixPath = path.resolve(args.matrices);
const motionPath = path.resolve(args.motion);
const controls = parseRuntimeControlRecording(fs.readFileSync(controlPath, "utf8"));
const matrices = parseRuntimeMatrixRecording(fs.readFileSync(matrixPath, "utf8"));
const motion = MotnLoader.parse(fs.readFileSync(motionPath));
const ticks = coherentWalkTicks(controls, matrices);
const repeat = findExactPeriod(ticks);
const samples = ticks.slice(repeat.start, repeat.start + repeat.period);
const axes = dynamicCapturedAxes(samples);
const candidates = args.candidates.map((name) => {
    const sequence = motion.getSequence(name);
    if (!sequence) throw new Error(`MOTN sequence not found: ${name}`);
    const fit = fitPhase(sequence, samples, axes);
    const matrix = matrixComparison(sequence, fit.phase, samples, {
        alignCapturedShoulders: true,
    });
    return {
        name,
        durationFrames: sequence.durationFrames,
        ...fit,
        rootNormalizedRenderMatrixRms: matrix.overallRms,
        sequence,
    };
}).sort((left, right) => (
    left.rotationResidualRaw - right.rotationResidualRaw
));
const best = candidates[0];
const matrix = matrixComparison(best.sequence, best.phase, samples, {
    alignCapturedShoulders: true,
});
const settledMatrix = matrixComparison(best.sequence, best.phase, samples);
const report = {
    schema: "shenmue-ryo-extracted-walk-comparison-v1",
    motion: motionPath,
    controls: controlPath,
    matrices: matrixPath,
    coherentWalkTickCount: ticks.length,
    exactPeriodGameTicks: repeat.period,
    repeatStartVblank: repeat.startFrame,
    repeatEndVblank: repeat.repeatFrame,
    dynamicRotationAxisCount: axes.length,
    candidates: candidates.map(({ sequence, ...candidate }) => candidate),
    bestSequence: best.name,
    bestPhase: best.phase,
    rootNormalizedRenderMatrixRms: matrix.overallRms,
    settledShoulderRenderMatrixRms: settledMatrix.overallRms,
    shoulderStateComparison: "captured-per-frame",
    routes: matrix.routes,
};

if (args.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(
        `exact runtime period: ${report.exactPeriodGameTicks} game ticks ` +
        `(VBlank ${report.repeatStartVblank} → ${report.repeatEndVblank})`,
    );
    for (const candidate of report.candidates) {
        console.log(
            `candidate ${candidate.name}: phase=${candidate.phase.toFixed(3)} ` +
            `rotationResidualRaw=${candidate.rotationResidualRaw.toFixed(3)} ` +
            `matrixRms=${candidate.rootNormalizedRenderMatrixRms.toFixed(6)}`,
        );
    }
    console.log(
        `best ${report.bestSequence}: rootNormalizedRenderMatrixRms=` +
        report.rootNormalizedRenderMatrixRms.toFixed(6) +
        ` (captured shoulder state; settled-loop state=` +
        `${report.settledShoulderRenderMatrixRms.toFixed(6)})`,
    );
    for (const route of report.routes) {
        console.log(
            `  key=${route.renderKey} matrix=${route.matrixIndex} ` +
            `rms=${route.rms.toFixed(6)} max=${route.maximum.toFixed(6)}`,
            `rotation=${route.rotationRms.toFixed(6)} ` +
            `translation=${route.translationRms.toFixed(6)}`,
        );
    }
}
