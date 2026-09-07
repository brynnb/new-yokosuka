#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error([
        "Usage: node tools/animation/analyze_ryo_runtime_matrices.js <recording.csv> [model.MT5] [--json]",
        "",
        "Validates the per-frame Ryo matrix recording and finds runtime joint pairs",
        "whose separation stays invariant while he walks. If an MT5 model is supplied,",
        "the invariant lengths are matched against its parent/child offsets.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = { csv: "", model: "", json: false };
    for (const arg of argv) {
        if (arg === "--json") args.json = true;
        else if (!args.csv) args.csv = arg;
        else if (!args.model) args.model = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.csv) {
        usage();
        process.exit(2);
    }
    return args;
}

function hexFloat(word) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32BE(Number.parseInt(word, 16), 0);
    return buffer.readFloatBE(0);
}

function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function statistics(values) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        mean,
        standardDeviation: Math.sqrt(variance),
    };
}

function parseRecording(file) {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
    const metadata = Object.fromEntries(lines
        .filter((line) => line.startsWith("# "))
        .map((line) => {
            const separator = line.indexOf("=");
            return separator < 0
                ? [line.slice(2), true]
                : [line.slice(2, separator), line.slice(separator + 1)];
        }));
    const dataLines = lines.filter((line) => !line.startsWith("#"));
    const header = dataLines.shift().split(",");
    const matrixColumns = header.length - 3;
    if (matrixColumns <= 0 || matrixColumns % 16 !== 0) {
        throw new Error(`Expected 16 words per matrix, found ${matrixColumns} matrix columns`);
    }
    const matrixCount = matrixColumns / 16;
    const frames = dataLines.map((line) => {
        const columns = line.split(",");
        if (columns.length !== header.length) {
            throw new Error(`Frame ${columns[0]} has ${columns.length} columns; expected ${header.length}`);
        }
        const matrices = [];
        for (let matrixIndex = 0; matrixIndex < matrixCount; matrixIndex++) {
            const start = 3 + matrixIndex * 16;
            matrices.push(columns.slice(start, start + 16).map(hexFloat));
        }
        return {
            frame: Number.parseInt(columns[0], 10),
            phase: columns[1],
            dpadButtons: Number.parseInt(columns[2], 10),
            matrices,
        };
    });
    return { metadata, header, matrixCount, frames };
}

function validateRecording(recording) {
    let nonFiniteValueCount = 0;
    let affineViolationCount = 0;
    let maximumAffineError = 0;
    for (const frame of recording.frames) {
        for (const matrix of frame.matrices) {
            nonFiniteValueCount += matrix.filter((value) => !Number.isFinite(value)).length;
            for (const [index, expected] of [[3, 0], [7, 0], [11, 0], [15, 1]]) {
                const error = Math.abs(matrix[index] - expected);
                maximumAffineError = Math.max(maximumAffineError, error);
                if (error > 1e-5) affineViolationCount++;
            }
        }
    }
    const expectedFrames = Array.from(
        { length: recording.frames.length },
        (_, index) => recording.frames[0].frame + index,
    );
    const frameNumbersAreContiguous = recording.frames.every(
        (frame, index) => frame.frame === expectedFrames[index],
    );
    return {
        frameNumbersAreContiguous,
        nonFiniteValueCount,
        affineViolationCount,
        maximumAffineError,
    };
}

function phaseSummary(recording) {
    const groups = new Map();
    for (const frame of recording.frames) {
        if (!groups.has(frame.phase)) groups.set(frame.phase, []);
        groups.get(frame.phase).push(frame);
    }
    return Array.from(groups, ([phase, frames]) => {
        const first = frames[0].matrices[0].slice(12, 15);
        const last = frames.at(-1).matrices[0].slice(12, 15);
        return {
            phase,
            firstFrame: frames[0].frame,
            lastFrame: frames.at(-1).frame,
            frameCount: frames.length,
            dpadButtons: [...new Set(frames.map((frame) => frame.dpadButtons))],
            rootStart: first,
            rootEnd: last,
            rootDisplacement: distance(first, last),
        };
    });
}

function runtimePairStats(recording) {
    const result = [];
    for (let a = 0; a < recording.matrixCount; a++) {
        for (let b = a + 1; b < recording.matrixCount; b++) {
            const distances = recording.frames.map((frame) => (
                distance(frame.matrices[a].slice(12, 15), frame.matrices[b].slice(12, 15))
            ));
            const aToB = localOffsetStats(recording.frames, a, b);
            const bToA = localOffsetStats(recording.frames, b, a);
            result.push({ a, b, ...statistics(distances), aToB, bToA });
        }
    }
    return result;
}

function localOffsetStats(frames, parent, child) {
    const offsets = frames.map((frame) => {
        const parentMatrix = frame.matrices[parent];
        const childMatrix = frame.matrices[child];
        const worldOffset = [
            childMatrix[12] - parentMatrix[12],
            childMatrix[13] - parentMatrix[13],
            childMatrix[14] - parentMatrix[14],
        ];
        // Matrices use row vectors, so worldOffset * transpose(parentRotation)
        // recovers the proposed child's offset in the proposed parent's space.
        return [
            worldOffset[0] * parentMatrix[0] + worldOffset[1] * parentMatrix[1] + worldOffset[2] * parentMatrix[2],
            worldOffset[0] * parentMatrix[4] + worldOffset[1] * parentMatrix[5] + worldOffset[2] * parentMatrix[6],
            worldOffset[0] * parentMatrix[8] + worldOffset[1] * parentMatrix[9] + worldOffset[2] * parentMatrix[10],
        ];
    });
    const axes = [0, 1, 2].map((axis) => statistics(offsets.map((offset) => offset[axis])));
    return {
        mean: axes.map((axis) => axis.mean),
        standardDeviation: Math.sqrt(
            axes.reduce((sum, axis) => sum + axis.standardDeviation ** 2, 0) / 3,
        ),
    };
}

function parseMt5Edges(file) {
    const bytes = fs.readFileSync(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (offset) => view.getUint32(offset, true);
    const f32 = (offset) => view.getFloat32(offset, true);
    const nodes = [];
    const seen = new Set();

    function visit(offset, parentOffset = 0) {
        if (!offset || offset + 64 > bytes.length || seen.has(offset)) return;
        seen.add(offset);
        const node = {
            index: nodes.length,
            offset,
            parentOffset,
            position: [f32(offset + 32), f32(offset + 36), f32(offset + 40)],
            childOffset: u32(offset + 44),
            siblingOffset: u32(offset + 48),
        };
        nodes.push(node);
        visit(node.childOffset, offset);
        visit(node.siblingOffset, parentOffset);
    }

    visit(u32(8));
    const byOffset = new Map(nodes.map((node) => [node.offset, node]));
    return {
        nodeCount: nodes.length,
        edges: nodes.filter((node) => node.parentOffset).map((node) => ({
            parent: byOffset.get(node.parentOffset)?.index ?? null,
            child: node.index,
            length: Math.hypot(...node.position),
            localPosition: node.position,
        })),
    };
}

function matchSourceEdges(invariantPairs, sourceEdges, tolerance = 0.002) {
    return sourceEdges.map((source) => {
        const candidates = invariantPairs
            .map((runtime) => ({
                runtimeA: runtime.a,
                runtimeB: runtime.b,
                runtimeLength: runtime.mean,
                standardDeviation: runtime.standardDeviation,
                lengthError: Math.abs(runtime.mean - source.length),
                aToBLocalOffset: runtime.aToB.mean,
                aToBLocalStandardDeviation: runtime.aToB.standardDeviation,
                bToALocalOffset: runtime.bToA.mean,
                bToALocalStandardDeviation: runtime.bToA.standardDeviation,
            }))
            .filter((candidate) => candidate.lengthError <= tolerance)
            .sort((a, b) => a.lengthError - b.lengthError || a.standardDeviation - b.standardDeviation);
        return { ...source, candidates };
    });
}

function rounded(value, digits = 9) {
    return Number(value.toFixed(digits));
}

function printReport(report) {
    console.log(`Ryo runtime matrix recording: ${report.recording}`);
    console.log([
        `frames=${report.frameCount}`,
        `matrices=${report.matrixCount}`,
        `contiguous=${report.validation.frameNumbersAreContiguous}`,
        `finite=${report.validation.nonFiniteValueCount === 0}`,
        `affine=${report.validation.affineViolationCount === 0}`,
    ].join(" "));
    for (const phase of report.phases) {
        console.log(
            `${phase.phase.padEnd(8)} frames=${phase.firstFrame}-${phase.lastFrame} ` +
            `dpad=${phase.dpadButtons.join("/")} rootDisplacement=${phase.rootDisplacement.toFixed(6)}`,
        );
    }
    console.log(
        `invariant nonzero pairs=${report.invariantNonzeroPairCount} ` +
        `(standard deviation <= ${report.invariantThreshold})`,
    );
    if (report.model) {
        console.log(`model=${report.model} nodes=${report.sourceNodeCount}`);
        console.log("MT5 parent->child length : matching invariant runtime pairs");
        for (const edge of report.sourceEdgeMatches) {
            const candidates = edge.candidates.slice(0, 8)
                .map((candidate) => (
                    `${candidate.runtimeA}-${candidate.runtimeB}` +
                    `(${candidate.runtimeLength.toFixed(6)},err=${candidate.lengthError.toExponential(1)})`
                ))
                .join(" ");
            console.log(
                `${String(edge.parent).padStart(2)}->${String(edge.child).padEnd(2)} ` +
                `${edge.length.toFixed(6)} : ${candidates || "no invariant match"}`,
            );
        }
    }
}

const args = parseArgs(process.argv.slice(2));
const recordingPath = path.resolve(args.csv);
const recording = parseRecording(recordingPath);
if (recording.frames.length === 0) throw new Error("Recording contains no data frames");
const validation = validateRecording(recording);
const pairs = runtimePairStats(recording);
const invariantThreshold = 1e-6;
const invariantPairs = pairs
    .filter((pair) => pair.mean > 1e-5 && pair.standardDeviation <= invariantThreshold)
    .sort((a, b) => a.standardDeviation - b.standardDeviation || a.mean - b.mean);
const modelPath = args.model ? path.resolve(args.model) : "";
const source = modelPath ? parseMt5Edges(modelPath) : null;
const report = {
    schema: "shenmue-ryo-runtime-matrix-analysis-v1",
    recording: recordingPath,
    model: modelPath || null,
    metadata: recording.metadata,
    frameCount: recording.frames.length,
    matrixCount: recording.matrixCount,
    validation,
    phases: phaseSummary(recording),
    pairCount: pairs.length,
    invariantThreshold,
    invariantNonzeroPairCount: invariantPairs.length,
    invariantPairs: invariantPairs.map((pair) => ({
        a: pair.a,
        b: pair.b,
        mean: rounded(pair.mean),
        standardDeviation: rounded(pair.standardDeviation, 12),
        range: rounded(pair.max - pair.min, 12),
        aToBLocalOffset: pair.aToB.mean.map((value) => rounded(value)),
        aToBLocalStandardDeviation: rounded(pair.aToB.standardDeviation, 12),
        bToALocalOffset: pair.bToA.mean.map((value) => rounded(value)),
        bToALocalStandardDeviation: rounded(pair.bToA.standardDeviation, 12),
    })),
    sourceNodeCount: source?.nodeCount ?? null,
    sourceEdgeMatches: source
        ? matchSourceEdges(invariantPairs, source.edges).map((edge) => ({
            ...edge,
            length: rounded(edge.length),
            localPosition: edge.localPosition.map((value) => rounded(value)),
            candidates: edge.candidates.map((candidate) => ({
                ...candidate,
                runtimeLength: rounded(candidate.runtimeLength),
                standardDeviation: rounded(candidate.standardDeviation, 12),
                lengthError: rounded(candidate.lengthError, 12),
                aToBLocalOffset: candidate.aToBLocalOffset.map((value) => rounded(value)),
                aToBLocalStandardDeviation: rounded(candidate.aToBLocalStandardDeviation, 12),
                bToALocalOffset: candidate.bToALocalOffset.map((value) => rounded(value)),
                bToALocalStandardDeviation: rounded(candidate.bToALocalStandardDeviation, 12),
            })),
        }))
        : null,
};

if (args.json) console.log(JSON.stringify(report, null, 2));
else printReport(report);
