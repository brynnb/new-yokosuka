#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import * as BABYLON from "@babylonjs/core";

import { MotnLoader } from "../../src/MotnLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
    evaluateRyoMotnFrame,
    ryoMotnGameplayTiming,
} from "../../src/RyoMotnRuntime.js";
import {
    parseRuntimeControlRecording,
    parseRuntimeMatrixRecording,
    RYO_YK_RENDER_MATRIX_ROUTES,
} from "../../src/RuntimeMatrixRecording.js";

BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;

const DEFAULT_MODEL = "public/models/S2_YDB1_YKC_M.MT5";
const DEFAULT_TEXTURE_PACK = "public/models/S2_YDB1_textures.bin";
const DEFAULT_MOTION = ".disc-work/runtime-motion/MOTION.BIN";
const DEFAULT_CONTROLS = "captures/skeleton/ryo-controls-1784830335.csv";
const DEFAULT_MATRICES = "captures/skeleton/ryo-matrices-1784830335.csv";
const DEFAULT_SEQUENCE = "A_WALK_L_02";
const DEFAULT_SOLE_BIND_BAND = 0.0025;
const FOOT_BRANCHES = Object.freeze([
    Object.freeze({
        name: "positive-X",
        lowerLegRenderKey: 0x11,
        targetControl: 8,
    }),
    Object.freeze({
        name: "negative-X",
        lowerLegRenderKey: 0x16,
        targetControl: 15,
    }),
]);

function parseArgs(argv) {
    const args = {
        model: DEFAULT_MODEL,
        texturePack: DEFAULT_TEXTURE_PACK,
        motion: DEFAULT_MOTION,
        controls: DEFAULT_CONTROLS,
        matrices: DEFAULT_MATRICES,
        sequence: DEFAULT_SEQUENCE,
        soleBindBand: DEFAULT_SOLE_BIND_BAND,
        describe: false,
        json: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === "--model") args.model = argv[++index] || "";
        else if (argument === "--texture-pack") args.texturePack = argv[++index] || "";
        else if (argument === "--motion") args.motion = argv[++index] || "";
        else if (argument === "--controls") args.controls = argv[++index] || "";
        else if (argument === "--matrices") args.matrices = argv[++index] || "";
        else if (argument === "--sequence") args.sequence = argv[++index] || "";
        else if (argument === "--sole-band") {
            args.soleBindBand = Number.parseFloat(argv[++index] || "");
        }
        else if (argument === "--describe") args.describe = true;
        else if (argument === "--json") args.json = true;
        else {
            throw new Error([
                "Usage: node tools/animation/audit_ryo_foot_contact.js",
                "[--model MT5] [--texture-pack BIN] [--motion MOTION.BIN]",
                "[--controls CSV] [--matrices CSV] [--sequence NAME]",
                "[--sole-band METERS] [--describe] [--json]",
            ].join(" "));
        }
    }
    if (!Number.isFinite(args.soleBindBand) || args.soleBindBand < 0) {
        throw new Error("--sole-band must be a non-negative number.");
    }
    return args;
}

function exactArrayBuffer(buffer) {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    );
}

function signedLow16(value) {
    const low16 = value & 0xffff;
    return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function transformPoint(point, matrix) {
    return [
        point[0] * matrix[0] + point[1] * matrix[4] + point[2] * matrix[8] + matrix[12],
        point[0] * matrix[1] + point[1] * matrix[5] + point[2] * matrix[9] + matrix[13],
        point[0] * matrix[2] + point[1] * matrix[6] + point[2] * matrix[10] + matrix[14],
    ];
}

function bounds(points) {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (const point of points) {
        for (let axis = 0; axis < 3; axis++) {
            minimum[axis] = Math.min(minimum[axis], point[axis]);
            maximum[axis] = Math.max(maximum[axis], point[axis]);
        }
    }
    return { minimum, maximum };
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

function rootLocalMatrices(matrices) {
    const inverseRoot = inverseRigidRow(matrices[0]);
    return matrices.map((matrix) => Mt5Loader.rowMultiply(matrix, inverseRoot));
}

function sourceWorldMatrices(nodes) {
    const byAddress = new Map(nodes.map((node) => [node.addr, node]));
    const cache = new Map();
    const matrixFor = (node) => {
        if (cache.has(node.addr)) return cache.get(node.addr);
        const local = Mt5Loader.sourceTransformMatrix(node);
        const parent = byAddress.get(node.parentAddr);
        const matrix = parent
            ? Mt5Loader.rowMultiply(local, matrixFor(parent))
            : local;
        cache.set(node.addr, matrix);
        return matrix;
    };
    for (const node of nodes) matrixFor(node);
    return cache;
}

function sourceVerticesForNode(node, matrix, nodeIndex = null) {
    const points = [];
    for (const child of node.mesh?.getChildren?.() || []) {
        const positions = child._mt5SourcePositions;
        if (!positions) continue;
        for (let offset = 0; offset < positions.length; offset += 3) {
            const sourcePoint = [
                positions[offset],
                positions[offset + 1],
                positions[offset + 2],
            ];
            points.push({
                nodeIndex,
                sourcePoint,
                sourceWorldPoint: transformPoint(sourcePoint, matrix),
            });
        }
    }
    return points;
}

async function loadModel(args) {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const modelBuffer = exactArrayBuffer(fs.readFileSync(path.resolve(args.model)));
    const textureBuffer = exactArrayBuffer(
        fs.readFileSync(path.resolve(args.texturePack)),
    );
    const loader = new Mt5Loader(scene, {
        backFaceCulling: false,
        characterRigMode: "baked",
    });
    loader.setTexturePackIndex(
        Mt5Loader.buildTexturePackIndex(textureBuffer),
        null,
        textureBuffer,
        null,
    );
    const [root] = await loader.load(modelBuffer, textureBuffer);
    const nodes = root?._mt5Nodes || [];
    if (nodes.length === 0) throw new Error("Ryo MT5 did not contain rig nodes.");
    return { engine, nodes };
}

function describeModel(nodes) {
    const indexByAddress = new Map(nodes.map((node, index) => [node.addr, index]));
    const worldMatrices = sourceWorldMatrices(nodes);
    const descriptions = nodes.map((node, index) => {
        const points = sourceVerticesForNode(
            node,
            worldMatrices.get(node.addr),
            index,
        ).map((vertex) => vertex.sourceWorldPoint);
        return {
            index,
            parent: indexByAddress.get(node.parentAddr) ?? null,
            renderKey: signedLow16(node.flag),
            position: [node.pos.x, node.pos.y, node.pos.z],
            rotation: [node.rot.x, node.rot.y, node.rot.z],
            pointCount: points.length,
            bounds: points.length > 0 ? bounds(points) : null,
        };
    });
    return descriptions;
}

function printDescriptions(descriptions) {
    for (const node of descriptions) {
        const range = node.bounds
            ? [
                `x=${node.bounds.minimum[0].toFixed(3)}..${node.bounds.maximum[0].toFixed(3)}`,
                `y=${node.bounds.minimum[1].toFixed(3)}..${node.bounds.maximum[1].toFixed(3)}`,
                `z=${node.bounds.minimum[2].toFixed(3)}..${node.bounds.maximum[2].toFixed(3)}`,
            ].join(" ")
            : "";
        console.log([
            String(node.index).padStart(2),
            `parent=${String(node.parent ?? "-").padStart(2)}`,
            `key=${String(node.renderKey).padStart(4)}`,
            `points=${String(node.pointCount).padStart(4)}`,
            range,
        ].join(" "));
    }
}

function descendantsOf(nodes, rootIndex) {
    const indexByAddress = new Map(nodes.map((node, index) => [node.addr, index]));
    const parentByIndex = nodes.map(
        (node) => indexByAddress.get(node.parentAddr) ?? null,
    );
    const output = [];
    for (let index = 0; index < nodes.length; index++) {
        let parent = parentByIndex[index];
        while (parent !== null) {
            if (parent === rootIndex) {
                output.push(index);
                break;
            }
            parent = parentByIndex[parent];
        }
    }
    return output;
}

function buildFootDefinitions(nodes, soleBindBand) {
    const sourceWorld = sourceWorldMatrices(nodes);
    return FOOT_BRANCHES.map((definition) => {
        const lowerLegNode = nodes.findIndex(
            (node) => signedLow16(node.flag) === definition.lowerLegRenderKey,
        );
        if (lowerLegNode < 0) {
            throw new Error(
                `MT5 render key ${definition.lowerLegRenderKey} was not found.`,
            );
        }
        const footNodes = descendantsOf(nodes, lowerLegNode);
        const vertices = footNodes.flatMap((nodeIndex) => (
            sourceVerticesForNode(
                nodes[nodeIndex],
                sourceWorld.get(nodes[nodeIndex].addr),
                nodeIndex,
            )
        ));
        const bindMinimumY = Math.min(
            ...vertices.map((vertex) => vertex.sourceWorldPoint[1]),
        );
        const soleVertices = vertices.filter(
            (vertex) => vertex.sourceWorldPoint[1]
                <= bindMinimumY + soleBindBand,
        );
        if (soleVertices.length < 3) {
            throw new Error(
                `${definition.name} produced only ${soleVertices.length} sole vertices.`,
            );
        }
        return {
            ...definition,
            lowerLegNode,
            footNodes,
            bindMinimumY,
            soleVertices,
        };
    });
}

function solveThreeByThree(matrix, vector) {
    const rows = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < 3; pivot++) {
        let best = pivot;
        for (let row = pivot + 1; row < 3; row++) {
            if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) {
                best = row;
            }
        }
        if (Math.abs(rows[best][pivot]) <= 1e-12) {
            throw new Error("Sole points do not span a two-dimensional plane.");
        }
        [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
        const divisor = rows[pivot][pivot];
        for (let column = pivot; column < 4; column++) {
            rows[pivot][column] /= divisor;
        }
        for (let row = 0; row < 3; row++) {
            if (row === pivot) continue;
            const factor = rows[row][pivot];
            for (let column = pivot; column < 4; column++) {
                rows[row][column] -= factor * rows[pivot][column];
            }
        }
    }
    return rows.map((row) => row[3]);
}

function fitSolePlane(points) {
    const sums = points.reduce((output, point) => {
        const [x, y, z] = point;
        output.x2 += x * x;
        output.z2 += z * z;
        output.xz += x * z;
        output.x += x;
        output.z += z;
        output.y += y;
        output.xy += x * y;
        output.zy += z * y;
        return output;
    }, {
        x2: 0,
        z2: 0,
        xz: 0,
        x: 0,
        z: 0,
        y: 0,
        xy: 0,
        zy: 0,
    });
    const [slopeX, slopeZ, intercept] = solveThreeByThree([
        [sums.x2, sums.xz, sums.x],
        [sums.xz, sums.z2, sums.z],
        [sums.x, sums.z, points.length],
    ], [sums.xy, sums.zy, sums.y]);
    const residuals = points.map(
        ([x, y, z]) => y - (slopeX * x + slopeZ * z + intercept),
    );
    const pointBounds = bounds(points);
    return {
        angleDegrees: Math.atan(Math.hypot(slopeX, slopeZ)) * 180 / Math.PI,
        normal: [-slopeX, 1, -slopeZ].map(
            (value) => value / Math.hypot(slopeX, 1, slopeZ),
        ),
        planeRms: Math.sqrt(
            residuals.reduce((sum, value) => sum + value * value, 0)
            / residuals.length,
        ),
        minimumY: pointBounds.minimum[1],
        maximumY: pointBounds.maximum[1],
        meanY: sums.y / points.length,
        verticalRange: pointBounds.maximum[1] - pointBounds.minimum[1],
    };
}

function posedWorldMatrix(nodes, nodeIndex, routedMatrices, cache) {
    if (cache.has(nodeIndex)) return cache.get(nodeIndex);
    const node = nodes[nodeIndex];
    const renderKey = signedLow16(node.flag);
    let matrix = routedMatrices.get(renderKey);
    if (!matrix) {
        const parentIndex = nodes.findIndex(
            (candidate) => candidate.addr === node.parentAddr,
        );
        const local = Mt5Loader.sourceTransformMatrix(node);
        matrix = parentIndex >= 0
            ? Mt5Loader.rowMultiply(
                local,
                posedWorldMatrix(nodes, parentIndex, routedMatrices, cache),
            )
            : local;
    }
    cache.set(nodeIndex, matrix);
    return matrix;
}

function posedSolePoints(nodes, foot, matrices) {
    const routedMatrices = new Map(
        RYO_YK_RENDER_MATRIX_ROUTES.map(([renderKey, matrixIndex]) => (
            [renderKey, matrices[matrixIndex]]
        )),
    );
    const cache = new Map();
    return foot.soleVertices.map((vertex) => transformPoint(
        vertex.sourcePoint,
        posedWorldMatrix(nodes, vertex.nodeIndex, routedMatrices, cache),
    ));
}

function rotationKey(frame) {
    return frame.controls.flatMap((control) => control.rotationRaw).join(",");
}

function coherentWalkTicks(controlRecording, matrixRecording) {
    const matrixByFrame = new Map(matrixRecording.frames.map((frame) => (
        [`${frame.frame}:${frame.phase}`, frame]
    )));
    const ticks = [];
    let previousKey = null;
    for (const controlFrame of controlRecording.frames) {
        if (!/^walk/i.test(controlFrame.phase)) continue;
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
    for (let start = 0; start < ticks.length; start++) {
        for (let end = start + 4; end < ticks.length; end++) {
            if (ticks[start].key === ticks[end].key) {
                return ticks.slice(start, end);
            }
        }
    }
    throw new Error("Captured data does not contain an exact walk cycle.");
}

function signedInt16(value) {
    const wrapped = ((value % 65536) + 65536) % 65536;
    return wrapped >= 32768 ? wrapped - 65536 : wrapped;
}

function rotationDelta(left, right) {
    return signedInt16(left - right);
}

function dynamicCapturedAxes(samples) {
    const axes = [];
    for (
        let control = 0;
        control < samples[0].controlFrame.controls.length;
        control++
    ) {
        for (let axis = 0; axis < 3; axis++) {
            const values = samples.map(
                (sample) => sample.controlFrame.controls[control].rotationRaw[axis],
            );
            if (
                Math.max(
                    ...values.map(
                        (value) => Math.abs(rotationDelta(value, values[0])),
                    ),
                ) > 4
            ) {
                axes.push([control, axis]);
            }
        }
    }
    return axes;
}

function controlResidual(sequence, phase, samples, axes) {
    const timing = ryoMotnGameplayTiming(sequence);
    let squared = 0;
    let count = 0;
    for (let tick = 0; tick < samples.length; tick++) {
        const frame = (
            phase + tick * timing.sourceFrameSpan / samples.length
        ) % timing.sourceFrameSpan;
        const extracted = evaluateRyoMotnFrame(sequence, frame, {
            advanceShoulderRoll: false,
        }).controls;
        for (const [control, axis] of axes) {
            const delta = rotationDelta(
                samples[tick].controlFrame.controls[control].rotationRaw[axis],
                extracted[control].rotationRaw[axis],
            );
            squared += delta * delta;
            count++;
        }
    }
    return Math.sqrt(squared / Math.max(1, count));
}

function fitPhase(sequence, samples) {
    const axes = dynamicCapturedAxes(samples);
    const { sourceFrameSpan } = ryoMotnGameplayTiming(sequence);
    let best = { phase: 0, residual: Infinity };
    const search = (start, end, step) => {
        for (let phase = start; phase < end; phase += step) {
            const wrapped = (
                (phase % sourceFrameSpan) + sourceFrameSpan
            ) % sourceFrameSpan;
            const residual = controlResidual(sequence, wrapped, samples, axes);
            if (residual < best.residual) best = { phase: wrapped, residual };
        }
    };
    search(0, sourceFrameSpan, 0.05);
    search(best.phase - 0.1, best.phase + 0.1, 0.001);
    return best;
}

function summarizeValues(values) {
    return {
        minimum: Math.min(...values),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        maximum: Math.max(...values),
    };
}

function auditFootContact(nodes, feet, sequence, samples, phase) {
    const timing = ryoMotnGameplayTiming(sequence);
    const frames = [];
    for (let tick = 0; tick < samples.length; tick++) {
        const captured = samples[tick];
        const extractedFrame = (
            phase + tick * timing.sourceFrameSpan / samples.length
        ) % timing.sourceFrameSpan;
        const extracted = evaluateRyoMotnFrame(sequence, extractedFrame, {
            advanceShoulderRoll: false,
        });
        const capturedLocal = rootLocalMatrices(captured.matrixFrame.matrices);
        const extractedLocal = rootLocalMatrices(extracted.matrices);
        for (const foot of feet) {
            const capturedWorldPoints = posedSolePoints(
                nodes,
                foot,
                captured.matrixFrame.matrices,
            );
            const extractedWorldPoints = posedSolePoints(
                nodes,
                foot,
                extracted.matrices,
            );
            const capturedLocalPoints = posedSolePoints(
                nodes,
                foot,
                capturedLocal,
            );
            const extractedLocalPoints = posedSolePoints(
                nodes,
                foot,
                extractedLocal,
            );
            const pointErrors = capturedLocalPoints.map(
                (point, index) => distance(point, extractedLocalPoints[index]),
            );
            const targetY = captured.controlFrame.controls[
                foot.targetControl
            ].position[1];
            frames.push({
                tick,
                foot: foot.name,
                planted: Math.abs(targetY - 0.117) <= 1e-6,
                targetY,
                captured: fitSolePlane(capturedWorldPoints),
                extracted: fitSolePlane(extractedWorldPoints),
                rootLocalPointRms: Math.sqrt(
                    pointErrors.reduce(
                        (sum, value) => sum + value * value,
                        0,
                    ) / pointErrors.length,
                ),
                rootLocalPointMaximum: Math.max(...pointErrors),
            });
        }
    }

    const feetReport = feet.map((foot) => {
        const rows = frames.filter((frame) => frame.foot === foot.name);
        const planted = rows.filter((frame) => frame.planted);
        const measured = planted.length > 0 ? planted : rows;
        return {
            name: foot.name,
            lowerLegRenderKey: foot.lowerLegRenderKey,
            lowerLegNode: foot.lowerLegNode,
            footNodes: foot.footNodes,
            targetControl: foot.targetControl,
            soleVertexCount: foot.soleVertices.length,
            bindMinimumY: foot.bindMinimumY,
            plantedFrameCount: planted.length,
            capturedPlantedAngleDegrees: summarizeValues(
                measured.map((frame) => frame.captured.angleDegrees),
            ),
            capturedPlantedMinimumY: summarizeValues(
                measured.map((frame) => frame.captured.minimumY),
            ),
            capturedPlantedVerticalRange: summarizeValues(
                measured.map((frame) => frame.captured.verticalRange),
            ),
            extractedPlantedAngleDegrees: summarizeValues(
                measured.map((frame) => frame.extracted.angleDegrees),
            ),
            maximumRootLocalPointError: Math.max(
                ...rows.map((frame) => frame.rootLocalPointMaximum),
            ),
            rootLocalPointRms: Math.sqrt(
                rows.reduce(
                    (sum, frame) => sum + frame.rootLocalPointRms ** 2,
                    0,
                ) / rows.length,
            ),
        };
    });
    return { feet: feetReport, frames };
}

function fixed(value, digits = 6) {
    return value.toFixed(digits);
}

function printAudit(report) {
    console.log([
        `sequence=${report.sequence}`,
        `capturedTicks=${report.capturedTicks}`,
        `fittedPhase=${fixed(report.fittedPhase, 3)}`,
        `controlResidualRaw=${fixed(report.controlResidualRaw, 3)}`,
    ].join(" "));
    console.log([
        `renderRoutes=${RYO_YK_RENDER_MATRIX_ROUTES.length}`,
        `independentFootRoutes=${report.independentFootRouteCount}`,
        `soleBand=${fixed(report.soleBindBand, 4)}`,
    ].join(" "));
    for (const foot of report.feet) {
        console.log([
            `${foot.name}:`,
            `nodes=${foot.footNodes.join(",")}`,
            `soleVertices=${foot.soleVertexCount}`,
            `planted=${foot.plantedFrameCount}/${report.capturedTicks}`,
            `capturedAngle=${fixed(foot.capturedPlantedAngleDegrees.minimum, 2)}..${fixed(foot.capturedPlantedAngleDegrees.maximum, 2)}deg`,
            `capturedMinY=${fixed(foot.capturedPlantedMinimumY.minimum, 4)}..${fixed(foot.capturedPlantedMinimumY.maximum, 4)}`,
            `soleYRange=${fixed(foot.capturedPlantedVerticalRange.minimum, 4)}..${fixed(foot.capturedPlantedVerticalRange.maximum, 4)}`,
            `extractedAngle=${fixed(foot.extractedPlantedAngleDegrees.minimum, 2)}..${fixed(foot.extractedPlantedAngleDegrees.maximum, 2)}deg`,
            `captureVsExtractedRms=${foot.rootLocalPointRms.toExponential(3)}`,
            `max=${foot.maximumRootLocalPointError.toExponential(3)}`,
        ].join(" "));
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { engine, nodes } = await loadModel(args);
    if (args.describe) {
        printDescriptions(describeModel(nodes));
        engine.dispose();
        return;
    }

    const motion = MotnLoader.parse(
        fs.readFileSync(path.resolve(args.motion)),
    );
    const sequence = motion.getSequence(args.sequence);
    if (!sequence) throw new Error(`MOTN sequence not found: ${args.sequence}`);
    const controlRecording = parseRuntimeControlRecording(
        fs.readFileSync(path.resolve(args.controls), "utf8"),
    );
    const matrixRecording = parseRuntimeMatrixRecording(
        fs.readFileSync(path.resolve(args.matrices), "utf8"),
    );
    const samples = coherentWalkTicks(controlRecording, matrixRecording);
    const phase = fitPhase(sequence, samples);
    const feet = buildFootDefinitions(nodes, args.soleBindBand);
    const audit = auditFootContact(
        nodes,
        feet,
        sequence,
        samples,
        phase.phase,
    );
    const routedKeys = new Set(
        RYO_YK_RENDER_MATRIX_ROUTES.map(([renderKey]) => renderKey),
    );
    const report = {
        schema: "shenmue-ryo-foot-contact-audit-v1",
        sequence: sequence.name,
        capturedTicks: samples.length,
        fittedPhase: phase.phase,
        controlResidualRaw: phase.residual,
        soleBindBand: args.soleBindBand,
        renderRouteCount: routedKeys.size,
        independentFootRouteCount: feet.reduce(
            (count, foot) => count + foot.footNodes.filter(
                (nodeIndex) => routedKeys.has(signedLow16(nodes[nodeIndex].flag)),
            ).length,
            0,
        ),
        ...audit,
    };
    engine.dispose();
    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printAudit(report);
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
