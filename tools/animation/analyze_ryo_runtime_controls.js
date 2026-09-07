#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
    console.error([
        "Usage: node tools/animation/analyze_ryo_runtime_controls.js <controls.csv> [matrices.csv] [--json]",
        "",
        "Decodes Ryo's 37 runtime animation-control records. With the synchronized",
        "matrix recording, it also checks the embedded hierarchy, control-to-matrix",
        "pointers, local translations, and direct-vs-solver-derived rotations.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = { controls: "", matrices: "", json: false };
    for (const arg of argv) {
        if (arg === "--json") args.json = true;
        else if (!args.controls) args.controls = arg;
        else if (!args.matrices) args.matrices = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!args.controls) {
        usage();
        process.exit(2);
    }
    return args;
}

function parseMetadata(lines) {
    return Object.fromEntries(lines
        .filter((line) => line.startsWith("# "))
        .map((line) => {
            const separator = line.indexOf("=");
            return separator < 0
                ? [line.slice(2), true]
                : [line.slice(2, separator), line.slice(separator + 1)];
        }));
}

function parseHexRecord(words) {
    const bytes = Buffer.alloc(words.length * 4);
    words.forEach((word, index) => bytes.writeUInt32LE(Number.parseInt(word, 16) >>> 0, index * 4));
    return bytes;
}

function parseRecording(file, wordsPerRecord) {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
    const metadata = parseMetadata(lines);
    const dataLines = lines.filter((line) => !line.startsWith("#"));
    const header = dataLines.shift().split(",");
    const recordColumns = header.length - 3;
    if (recordColumns <= 0 || recordColumns % wordsPerRecord !== 0) {
        throw new Error(
            `${file}: expected ${wordsPerRecord} words per record; found ${recordColumns} data columns`,
        );
    }
    const recordCount = recordColumns / wordsPerRecord;
    const frames = dataLines.map((line) => {
        const columns = line.split(",");
        if (columns.length !== header.length) {
            throw new Error(
                `${file}: frame ${columns[0]} has ${columns.length} columns; expected ${header.length}`,
            );
        }
        const records = [];
        for (let index = 0; index < recordCount; index++) {
            const start = 3 + index * wordsPerRecord;
            records.push(parseHexRecord(columns.slice(start, start + wordsPerRecord)));
        }
        return {
            frame: Number.parseInt(columns[0], 10),
            phase: columns[1],
            dpadButtons: Number.parseInt(columns[2], 10),
            records,
        };
    });
    return { file: path.resolve(file), metadata, header, recordCount, frames };
}

function parseAddress(value) {
    return Number.parseInt(String(value), 0);
}

function addressToIndex(address, base, stride, count) {
    const normalizedAddress = address & 0x1fffffff;
    const normalizedBase = base & 0x1fffffff;
    const delta = normalizedAddress - normalizedBase;
    if (delta < 0 || delta % stride !== 0) return null;
    const index = delta / stride;
    return index >= 0 && index < count ? index : null;
}

function decodeControl(bytes, index, base, stride, count) {
    const childAddresses = [44, 48, 52]
        .map((offset) => bytes.readUInt32LE(offset))
        .filter((address) => address !== 0);
    return {
        index,
        address: base + index * stride,
        type: bytes.readUInt8(0),
        solverClass: bytes.readUInt8(1),
        solverSubtype: bytes.readUInt8(2),
        flags3: bytes.readUInt8(3),
        flags4: bytes.readUInt8(4),
        referenceIndex: bytes.readUInt8(5),
        flags6: bytes.readUInt8(6),
        flags7: bytes.readUInt8(7),
        rotationRaw: [
            bytes.readInt16LE(10),
            bytes.readInt16LE(12),
            bytes.readInt16LE(14),
        ],
        position: [
            bytes.readFloatLE(16),
            bytes.readFloatLE(20),
            bytes.readFloatLE(24),
        ],
        translationCurveAddress: bytes.readUInt32LE(28),
        rotationCurveAddress: bytes.readUInt32LE(32),
        defaultPositionAddress: bytes.readUInt32LE(36),
        defaultRotationAddress: bytes.readUInt32LE(40),
        childAddresses,
        children: childAddresses
            .map((address) => addressToIndex(address, base, stride, count))
            .filter((child) => child !== null),
        companionAddress: bytes.readUInt32LE(56),
        blendWeight: bytes.readFloatLE(60),
        matrixAddress: bytes.readUInt32LE(68),
    };
}

function decodeMatrix(bytes) {
    return Array.from({ length: 16 }, (_, index) => bytes.readFloatLE(index * 4));
}

function rowMultiply(left, right) {
    const result = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            for (let inner = 0; inner < 4; inner++) {
                result[row * 4 + column] += (
                    left[row * 4 + inner] * right[inner * 4 + column]
                );
            }
        }
    }
    return result;
}

function inverseRigidRow(matrix) {
    return [
        matrix[0], matrix[4], matrix[8], 0,
        matrix[1], matrix[5], matrix[9], 0,
        matrix[2], matrix[6], matrix[10], 0,
        -(matrix[12] * matrix[0] + matrix[13] * matrix[1] + matrix[14] * matrix[2]),
        -(matrix[12] * matrix[4] + matrix[13] * matrix[5] + matrix[14] * matrix[6]),
        -(matrix[12] * matrix[8] + matrix[13] * matrix[9] + matrix[14] * matrix[10]),
        1,
    ];
}

function rowRotationX(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        1, 0, 0, 0,
        0, cos, sin, 0,
        0, -sin, cos, 0,
        0, 0, 0, 1,
    ];
}

function rowRotationY(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        cos, 0, -sin, 0,
        0, 1, 0, 0,
        sin, 0, cos, 0,
        0, 0, 0, 1,
    ];
}

function rowRotationZ(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
        cos, sin, 0, 0,
        -sin, cos, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ];
}

function rowEulerXyz(rawAngles) {
    const radians = rawAngles.map((value) => value * Math.PI * 2 / 65536);
    return rowMultiply(
        rowMultiply(rowRotationX(radians[0]), rowRotationY(radians[1])),
        rowRotationZ(radians[2]),
    );
}

function distance(left, right) {
    return Math.hypot(
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2],
    );
}

function add(left, right) {
    return left.map((value, index) => value + right[index]);
}

function subtract(left, right) {
    return left.map((value, index) => value - right[index]);
}

function scale(vector, scalar) {
    return vector.map((value) => value * scalar);
}

function dot(left, right) {
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalize(vector) {
    const length = Math.hypot(...vector);
    return length > 1e-12 ? scale(vector, 1 / length) : null;
}

function matrixAxis(matrix, axis) {
    const offset = axis * 4;
    return matrix.slice(offset, offset + 3);
}

function rotationErrorDegrees(left, right) {
    let dot = 0;
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            dot += left[row * 4 + column] * right[row * 4 + column];
        }
    }
    const cosine = Math.max(-1, Math.min(1, (dot - 1) / 2));
    return Math.acos(cosine) * 180 / Math.PI;
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

function round(value, digits = 9) {
    return Number(value.toFixed(digits));
}

function roundedStats(stats, digits = 9) {
    if (!stats) return null;
    return Object.fromEntries(
        Object.entries(stats).map(([key, value]) => [key, round(value, digits)]),
    );
}

function buildParents(controls) {
    const parents = new Array(controls.length).fill(null);
    for (const control of controls) {
        for (const child of control.children) {
            if (parents[child] !== null) {
                throw new Error(
                    `Control ${child} has multiple parents: ${parents[child]} and ${control.index}`,
                );
            }
            parents[child] = control.index;
        }
    }
    return parents;
}

function verifySynchronized(controls, matrices) {
    if (controls.frames.length !== matrices.frames.length) {
        throw new Error(
            `Frame-count mismatch: controls=${controls.frames.length}, matrices=${matrices.frames.length}`,
        );
    }
    controls.frames.forEach((controlFrame, index) => {
        const matrixFrame = matrices.frames[index];
        if (
            controlFrame.frame !== matrixFrame.frame
            || controlFrame.phase !== matrixFrame.phase
            || controlFrame.dpadButtons !== matrixFrame.dpadButtons
        ) {
            throw new Error(`Recordings diverge at row ${index + 1}`);
        }
    });
}

function analyzeTwoBoneChains(
    controlsRecording,
    matrixRecording,
    definitions,
) {
    const chains = [];
    for (const parent of definitions) {
        if (parent.solverClass !== 2 || parent.solverSubtype !== 2) continue;
        const upper = definitions[parent.children[0]];
        const lower = definitions[upper?.children[0]];
        const target = definitions[lower?.children[0]];
        if (
            upper?.solverClass !== 3
            || lower?.solverClass !== 3
            || target?.solverClass !== 4
        ) {
            continue;
        }

        const candidates = [];
        for (let frameIndex = 0; frameIndex < controlsRecording.frames.length; frameIndex++) {
            const targetBytes = controlsRecording.frames[frameIndex].records[target.index];
            const targetControlPosition = [
                targetBytes.readFloatLE(16),
                targetBytes.readFloatLE(20),
                targetBytes.readFloatLE(24),
            ];
            const matrices = matrixRecording.frames[frameIndex].records.map(decodeMatrix);
            const rootPosition = matrices[upper.index].slice(12, 15);
            const kneePosition = matrices[lower.index].slice(12, 15);
            const targetPosition = matrices[target.index].slice(12, 15);
            if (distance(targetControlPosition, targetPosition) > 1e-5) continue;
            candidates.push({
                frameIndex,
                rootPosition,
                kneePosition,
                targetPosition,
                parentMatrix: matrices[parent.index],
                upperLength: distance(rootPosition, kneePosition),
                lowerLength: distance(kneePosition, targetPosition),
            });
        }
        if (candidates.length === 0) continue;

        const upperLength = statistics(
            candidates.map((candidate) => candidate.upperLength),
        ).median;
        const lowerLength = statistics(
            candidates.map((candidate) => candidate.lowerLength),
        ).median;
        const kneeErrors = [];
        for (const candidate of candidates) {
            const targetDelta = subtract(
                candidate.targetPosition,
                candidate.rootPosition,
            );
            const targetDistance = Math.hypot(...targetDelta);
            const targetDirection = normalize(targetDelta);
            if (!targetDirection || targetDistance <= 1e-12) continue;
            const parentZ = matrixAxis(candidate.parentMatrix, 2);
            const planeNormal = normalize(subtract(
                parentZ,
                scale(targetDirection, dot(parentZ, targetDirection)),
            ));
            if (!planeNormal) continue;

            const along = Math.max(
                -upperLength,
                Math.min(
                    upperLength,
                    (
                        upperLength * upperLength
                        + targetDistance * targetDistance
                        - lowerLength * lowerLength
                    ) / (2 * targetDistance),
                ),
            );
            const height = Math.sqrt(Math.max(
                0,
                upperLength * upperLength - along * along,
            ));
            // The sign branch at 0x0C0916F4 is selected with the lower
            // class-3 record's subtype. Subtype 1 bends arms one way;
            // subtype 0 bends legs the other way.
            const bendDirection = lower.solverSubtype === 0
                ? cross(targetDirection, planeNormal)
                : cross(planeNormal, targetDirection);
            const predictedKnee = add(
                add(
                    candidate.rootPosition,
                    scale(targetDirection, along),
                ),
                scale(bendDirection, height),
            );
            kneeErrors.push(distance(predictedKnee, candidate.kneePosition));
        }

        chains.push({
            parent: parent.index,
            upper: upper.index,
            lower: lower.index,
            target: target.index,
            lowerSolverSubtype: lower.solverSubtype,
            validatedFrameCount: kneeErrors.length,
            upperLength: round(upperLength),
            lowerLength: round(lowerLength),
            kneePositionError: roundedStats(statistics(kneeErrors), 9),
        });
    }
    return chains;
}

function analyze(controlsRecording, matrixRecording = null) {
    const stride = Number.parseInt(
        controlsRecording.metadata.stride?.match(/\d+/)?.[0] || "72",
        10,
    );
    const base = parseAddress(
        controlsRecording.metadata.base?.match(/0x[0-9a-f]+/i)?.[0] || "0x8cc05820",
    );
    const firstControls = controlsRecording.frames[0].records.map(
        (record, index) => decodeControl(
            record,
            index,
            base,
            stride,
            controlsRecording.recordCount,
        ),
    );
    const parents = buildParents(firstControls);
    const roots = parents
        .map((parent, index) => parent === null ? index : null)
        .filter((index) => index !== null);
    const class4Targets = firstControls
        .filter((control) => control.solverClass === 4)
        .map((control) => control.index);
    const report = {
        schema: "shenmue-ryo-runtime-control-analysis-v1",
        controlFile: controlsRecording.file,
        matrixFile: matrixRecording?.file || null,
        frameCount: controlsRecording.frames.length,
        controlCount: controlsRecording.recordCount,
        controlBase: `0x${base.toString(16)}`,
        controlStride: stride,
        roots,
        hierarchyEdgeCount: parents.filter((parent) => parent !== null).length,
        class4Targets,
        controlDefinitions: firstControls.map((control) => ({
            index: control.index,
            type: control.type,
            solverClass: control.solverClass,
            solverSubtype: control.solverSubtype,
            parent: parents[control.index],
            children: control.children,
            hasTranslationCurve: control.translationCurveAddress !== 0,
            hasRotationCurve: control.rotationCurveAddress !== 0,
            matrixAddress: `0x${control.matrixAddress.toString(16)}`,
        })),
    };

    if (!matrixRecording) return report;
    verifySynchronized(controlsRecording, matrixRecording);
    if (matrixRecording.recordCount !== controlsRecording.recordCount) {
        throw new Error(
            `Record-count mismatch: controls=${controlsRecording.recordCount}, ` +
            `matrices=${matrixRecording.recordCount}`,
        );
    }

    const matrixBase = firstControls[0].matrixAddress;
    const matrixStride = 0x40;
    const matrixPointerErrors = firstControls.filter((control) => (
        addressToIndex(
            control.matrixAddress,
            matrixBase,
            matrixStride,
            firstControls.length,
        ) !== control.index
    )).length;
    const directFrameIndices = [];
    controlsRecording.frames.forEach((frame, frameIndex) => {
        const control = decodeControl(
            frame.records[0],
            0,
            base,
            stride,
            controlsRecording.recordCount,
        );
        const matrix = decodeMatrix(matrixRecording.frames[frameIndex].records[0]);
        if (distance(control.position, matrix.slice(12, 15)) <= 1e-4) {
            directFrameIndices.push(frameIndex);
        }
    });

    const perControl = firstControls.map((definition) => {
        const translationErrors = [];
        const rotationErrors = [];
        for (const frameIndex of directFrameIndices) {
            const control = decodeControl(
                controlsRecording.frames[frameIndex].records[definition.index],
                definition.index,
                base,
                stride,
                controlsRecording.recordCount,
            );
            const world = decodeMatrix(
                matrixRecording.frames[frameIndex].records[definition.index],
            );
            const parent = parents[definition.index];
            const local = parent === null
                ? world
                : rowMultiply(
                    world,
                    inverseRigidRow(
                        decodeMatrix(matrixRecording.frames[frameIndex].records[parent]),
                    ),
                );
            if (definition.solverClass !== 4) {
                translationErrors.push(distance(control.position, local.slice(12, 15)));
            }
            rotationErrors.push(rotationErrorDegrees(
                rowEulerXyz(control.rotationRaw),
                local,
            ));
        }
        return {
            index: definition.index,
            solverClass: definition.solverClass,
            translationError: roundedStats(statistics(translationErrors), 9),
            xyzRotationErrorDegrees: roundedStats(statistics(rotationErrors), 6),
        };
    });

    report.matrixBase = `0x${matrixBase.toString(16)}`;
    report.matrixStride = matrixStride;
    report.matrixPointerErrors = matrixPointerErrors;
    report.rootCoherentFrameCount = directFrameIndices.length;
    report.nonTargetTranslationError = roundedStats(statistics(
        perControl.flatMap((control) => (
            control.translationError ? [control.translationError.max] : []
        )),
    ), 9);
    report.perControlValidation = perControl;
    report.twoBoneChains = analyzeTwoBoneChains(
        controlsRecording,
        matrixRecording,
        firstControls,
    );
    return report;
}

function printReport(report) {
    console.log(`Ryo runtime controls: ${report.controlFile}`);
    console.log([
        `frames=${report.frameCount}`,
        `controls=${report.controlCount}`,
        `base=${report.controlBase}`,
        `stride=${report.controlStride}`,
        `roots=${report.roots.join(",")}`,
        `edges=${report.hierarchyEdgeCount}`,
    ].join(" "));
    console.log(`class-4 absolute/IK targets=${report.class4Targets.join(",")}`);
    if (!report.matrixFile) return;
    console.log(`synchronized matrices: ${report.matrixFile}`);
    console.log([
        `matrixBase=${report.matrixBase}`,
        `matrixStride=${report.matrixStride}`,
        `pointerErrors=${report.matrixPointerErrors}`,
        `rootCoherentFrames=${report.rootCoherentFrameCount}`,
        `maxNonTargetTranslationError=${report.nonTargetTranslationError?.max ?? "n/a"}`,
    ].join(" "));
    for (const chain of report.twoBoneChains) {
        console.log([
            `two-bone ${chain.parent}->${chain.upper}->${chain.lower}->${chain.target}`,
            `subtype=${chain.lowerSolverSubtype}`,
            `frames=${chain.validatedFrameCount}`,
            `lengths=${chain.upperLength}/${chain.lowerLength}`,
            `medianKneeError=${chain.kneePositionError?.median ?? "n/a"}`,
            `maxKneeError=${chain.kneePositionError?.max ?? "n/a"}`,
        ].join(" "));
    }
    console.log("idx parent children class T R xyz-error(deg)");
    for (const control of report.controlDefinitions) {
        const validation = report.perControlValidation[control.index];
        console.log([
            String(control.index).padStart(2),
            String(control.parent ?? "-").padStart(2),
            (control.children.join("/") || "-").padEnd(8),
            String(control.solverClass).padStart(2),
            control.hasTranslationCurve ? "T" : "-",
            control.hasRotationCurve ? "R" : "-",
            validation.xyzRotationErrorDegrees
                ? `${validation.xyzRotationErrorDegrees.median.toFixed(3)} median / ` +
                  `${validation.xyzRotationErrorDegrees.max.toFixed(3)} max`
                : "n/a",
        ].join("  "));
    }
}

const args = parseArgs(process.argv.slice(2));
const controls = parseRecording(path.resolve(args.controls), 18);
const matrices = args.matrices
    ? parseRecording(path.resolve(args.matrices), 16)
    : null;
const report = analyze(controls, matrices);
if (args.json) console.log(JSON.stringify(report, null, 2));
else printReport(report);
