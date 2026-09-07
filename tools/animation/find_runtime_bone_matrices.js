#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error(
        "Usage: node tools/animation/find_runtime_bone_matrices.js <idle-ram.bin> <walk-start-ram.bin> " +
        "<walk-mid-ram.bin> <walk-late-ram.bin> <stopped-ram.bin>"
    );
    process.exit(2);
}

if (process.argv.length !== 7) usage();

const snapshots = process.argv.slice(2).map((file) => ({
    file: path.resolve(file),
    data: fs.readFileSync(file)
}));
const size = snapshots[0].data.length;
if (snapshots.some((snapshot) => snapshot.data.length !== size)) {
    throw new Error("RAM snapshots have different sizes");
}

const layouts = [
    {
        name: "affine-4x4-row",
        stride: 64,
        rotation: [0, 1, 2, 4, 5, 6, 8, 9, 10],
        translation: [12, 13, 14],
        fixed: [[3, 0], [7, 0], [11, 0], [15, 1]]
    },
    {
        name: "affine-4x4-column",
        stride: 64,
        rotation: [0, 4, 8, 1, 5, 9, 2, 6, 10],
        translation: [3, 7, 11],
        fixed: [[12, 0], [13, 0], [14, 0], [15, 1]]
    },
    {
        name: "affine-3x4-row",
        stride: 48,
        rotation: [0, 1, 2, 4, 5, 6, 8, 9, 10],
        translation: [3, 7, 11],
        fixed: []
    },
    {
        name: "affine-4x3-row",
        stride: 48,
        rotation: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        translation: [9, 10, 11],
        fixed: []
    }
];

function readFloats(buffer, offset, count) {
    const values = new Array(count);
    for (let i = 0; i < count; i++) values[i] = buffer.readFloatLE(offset + i * 4);
    return values;
}

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v) {
    return Math.sqrt(dot(v, v));
}

function rotationQuality(values, layout) {
    for (const [index, expected] of layout.fixed) {
        if (Math.abs(values[index] - expected) > 0.0005) return null;
    }
    const r = layout.rotation.map((index) => values[index]);
    const axes = [r.slice(0, 3), r.slice(3, 6), r.slice(6, 9)];
    const lengths = axes.map(length);
    if (lengths.some((value) => !Number.isFinite(value) || value < 0.15 || value > 8)) return null;
    const normalized = axes.map((axis, i) => axis.map((value) => value / lengths[i]));
    const orthogonality = Math.max(
        Math.abs(dot(normalized[0], normalized[1])),
        Math.abs(dot(normalized[0], normalized[2])),
        Math.abs(dot(normalized[1], normalized[2]))
    );
    if (orthogonality > 0.12) return null;
    const determinant = dot(normalized[0], [
        normalized[1][1] * normalized[2][2] - normalized[1][2] * normalized[2][1],
        normalized[1][2] * normalized[2][0] - normalized[1][0] * normalized[2][2],
        normalized[1][0] * normalized[2][1] - normalized[1][1] * normalized[2][0]
    ]);
    if (Math.abs(determinant) < 0.85) return null;
    const translation = layout.translation.map((index) => values[index]);
    if (translation.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)) return null;
    return { rotation: r, translation, orthogonality, determinant, lengths };
}

function matrixAt(snapshot, offset, layout) {
    const count = layout.stride / 4;
    if (offset + layout.stride > size) return null;
    const values = readFloats(snapshot.data, offset, count);
    if (values.some((value) => !Number.isFinite(value))) return null;
    return rotationQuality(values, layout);
}

function rmsDifference(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const difference = a[i] - b[i];
        sum += difference * difference;
    }
    return Math.sqrt(sum / a.length);
}

function analyzeRun(offset, count, layout) {
    let movement = 0;
    let stopped = 0;
    let translationMovement = 0;
    let samples = 0;
    for (let i = 0; i < count; i++) {
        const address = offset + i * layout.stride;
        const matrices = snapshots.map((snapshot) => matrixAt(snapshot, address, layout));
        if (matrices.some((matrix) => matrix === null)) return null;
        const walkingDelta = (
            rmsDifference(matrices[0].rotation, matrices[1].rotation) +
            rmsDifference(matrices[0].rotation, matrices[2].rotation) +
            rmsDifference(matrices[0].rotation, matrices[3].rotation)
        ) / 3;
        movement += walkingDelta;
        stopped += rmsDifference(matrices[0].rotation, matrices[4].rotation);
        translationMovement += rmsDifference(matrices[0].translation, matrices[3].translation);
        samples++;
    }
    movement /= samples;
    stopped /= samples;
    translationMovement /= samples;
    const score = movement * Math.log2(count + 1) / (0.01 + stopped);
    return { movement, stopped, translationMovement, score };
}

const results = [];
for (const layout of layouts) {
    const valid = new Set();
    for (let offset = 0; offset + layout.stride <= size; offset += 4) {
        if (matrixAt(snapshots[0], offset, layout) !== null) valid.add(offset);
    }

    for (const offset of valid) {
        if (valid.has(offset - layout.stride)) continue;
        let count = 1;
        while (valid.has(offset + count * layout.stride)) count++;
        if (count < 3) continue;
        const analysis = analyzeRun(offset, count, layout);
        if (analysis === null || analysis.movement < 0.002) continue;
        results.push({ layout: layout.name, offset, count, ...analysis });
    }
}

results.sort((a, b) => b.score - a.score || b.count - a.count);
const output = {
    schema: "shenmue-runtime-matrix-candidates-v1",
    snapshots: snapshots.map((snapshot) => snapshot.file),
    ramSize: size,
    candidateCount: results.length,
    topCandidates: results.slice(0, 100).map((candidate) => ({
        ...candidate,
        offsetHex: `0x${candidate.offset.toString(16).padStart(8, "0")}`,
        sh4AddressHex: `0x${(0x8c000000 + candidate.offset).toString(16)}`
    }))
};
console.log(JSON.stringify(output, null, 2));
