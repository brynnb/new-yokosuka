#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ATLAS_ADDRESS = 0x561800;
const ATLAS_HEX = "a64b425f4b414a5f";
const UV_SCALE = 1024;

const transforms = [
    ["identity", (u, v) => [u, v]],
    ["flip-u", (u, v) => [1 - u, v]],
    ["flip-v", (u, v) => [u, 1 - v]],
    ["rotate-180", (u, v) => [1 - u, 1 - v]],
    ["swap-uv", (u, v) => [v, u]],
    ["rotate-cw", (u, v) => [1 - v, u]],
    ["rotate-ccw", (u, v) => [v, 1 - u]],
    ["swap-flip-both", (u, v) => [1 - v, 1 - u]],
];

const uvBases = [
    ["decoded", (vertex) => vertex.uv],
    ["raw/256", (vertex) => vertex.rawUv?.map((value) => value / 256)],
    ["raw/512", (vertex) => vertex.rawUv?.map((value) => value / 512)],
    ["raw/1024", (vertex) => vertex.rawUv?.map((value) => value / 1024)],
    ["raw/2048", (vertex) => vertex.rawUv?.map((value) => value / 2048)],
    ["raw/256x128", (vertex) => vertex.rawUv
        ? [vertex.rawUv[0] / 256, vertex.rawUv[1] / 128]
        : null],
    ["raw/512x256", (vertex) => vertex.rawUv
        ? [vertex.rawUv[0] / 512, vertex.rawUv[1] / 256]
        : null],
    ["raw/1024x512", (vertex) => vertex.rawUv
        ? [vertex.rawUv[0] / 1024, vertex.rawUv[1] / 512]
        : null],
];

function usage() {
    console.error(
        "Usage: node tools/animation/compare_ryo_runtime_uv.js <capture-dir> <model.MT5>...",
    );
}

function quantize(value) {
    return Math.round(value * UV_SCALE);
}

function pointKey(point) {
    return `${quantize(point[0])},${quantize(point[1])}`;
}

function triangleKey(points) {
    return points.map(pointKey).sort().join("|");
}

function addCount(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function multisetIntersection(left, right) {
    let total = 0;
    for (const [key, count] of left) {
        total += Math.min(count, right.get(key) || 0);
    }
    return total;
}

function runtimeGeometry(frame) {
    const pointCounts = new Map();
    const triangleCounts = new Map();
    let polygonCount = 0;
    let referencedCorners = 0;

    for (const polygons of Object.values(frame.polygonLists)) {
        for (const polygon of polygons) {
            if (polygon.texture?.vramAddress !== ATLAS_ADDRESS) continue;
            polygonCount++;
            let segment = [];
            const flush = () => {
                // A PolyParam range is a triangle strip. Primitive-restart
                // markers split it into independently wound strip segments.
                for (let offset = 0; offset + 2 < segment.length; offset++) {
                    const order = offset % 2 === 0
                        ? [offset, offset + 1, offset + 2]
                        : [offset, offset + 2, offset + 1];
                    const triangle = order.map((corner) => segment[corner]);
                    if (new Set(triangle.map(pointKey)).size < 3) continue;
                    addCount(triangleCounts, triangleKey(triangle));
                }
                segment = [];
            };
            for (
                let offset = polygon.firstIndex;
                offset < polygon.firstIndex + polygon.indexCount;
                offset++
            ) {
                const vertexIndex = frame.indices[offset];
                if (vertexIndex === 0xffffffff) {
                    flush();
                    continue;
                }
                const uv = frame.vertices[vertexIndex]?.uv;
                if (!uv || uv.some((value) => !Number.isFinite(value))) continue;
                segment.push(uv);
                addCount(pointCounts, pointKey(uv));
                referencedCorners++;
            }
            flush();
        }
    }
    return {
        pointCounts,
        triangleCounts,
        polygonCount,
        referencedCorners,
        triangles: [...triangleCounts.values()].reduce((sum, count) => sum + count, 0),
    };
}

function rawTaStrips(captureDir, frame) {
    const strips = [];
    const headers = [];
    for (const pass of frame.taCommandPasses || []) {
        const bytes = fs.readFileSync(path.join(captureDir, pass.file));
        let active = false;
        let current = [];
        for (let offset = 0; offset + 32 <= bytes.length; offset += 32) {
            const pcw = bytes.readUInt32LE(offset);
            const parameterType = pcw >>> 29;
            const endOfStrip = ((pcw >>> 28) & 1) === 1;
            if (parameterType === 4) {
                const tcw = bytes.readUInt32LE(offset + 12);
                const address = (tcw & 0x1fffff) * 8;
                active = address === ATLAS_ADDRESS;
                current = [];
                if (active) {
                    headers.push({
                        pass: pass.file,
                        offset,
                        pcw,
                        isp: bytes.readUInt32LE(offset + 4),
                        tsp: bytes.readUInt32LE(offset + 8),
                        tcw,
                    });
                }
            } else if (parameterType === 7 && active) {
                // Target headers use textured packed-color, 32-bit UV vertices
                // (object-control 0x0e / TA_Vertex3).
                current.push([
                    bytes.readFloatLE(offset + 16),
                    bytes.readFloatLE(offset + 20),
                ]);
                if (endOfStrip) {
                    strips.push(current);
                    current = [];
                }
            } else if (parameterType !== 7) {
                active = false;
                current = [];
            }
        }
    }
    return { strips, headers };
}

function alignStripLengths(runtimeStrips, rows) {
    const height = runtimeStrips.length + 1;
    const width = rows.length + 1;
    const scores = Array.from({ length: height }, () => new Int32Array(width));
    for (let i = 1; i < height; i++) {
        for (let j = 1; j < width; j++) {
            let best = Math.max(scores[i - 1][j], scores[i][j - 1]);
            if (runtimeStrips[i - 1].length === rows[j - 1].vertices.length) {
                const length = runtimeStrips[i - 1].length;
                // Long strips are much stronger anchors than common 3/4-vertex
                // strips, while still allowing whole strips to be culled.
                best = Math.max(best, scores[i - 1][j - 1] + length * length);
            }
            scores[i][j] = best;
        }
    }
    const matches = [];
    let i = runtimeStrips.length;
    let j = rows.length;
    while (i > 0 && j > 0) {
        const runtimeLength = runtimeStrips[i - 1].length;
        const sourceLength = rows[j - 1].vertices.length;
        const matchScore = runtimeLength === sourceLength
            ? scores[i - 1][j - 1] + runtimeLength * runtimeLength
            : -1;
        if (matchScore === scores[i][j]) {
            matches.push([i - 1, j - 1]);
            i--;
            j--;
        } else if (scores[i - 1][j] >= scores[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    matches.reverse();
    return {
        score: scores[runtimeStrips.length][rows.length],
        matches,
        matchedStrips: matches.length,
        matchedCorners: matches.reduce(
            (sum, [runtimeIndex]) => sum + runtimeStrips[runtimeIndex].length,
            0,
        ),
    };
}

function alignedUvError(runtimeStrips, rows, alignment, basis, transform) {
    const errors = [];
    let exactCorners = 0;
    for (const [runtimeIndex, sourceIndex] of alignment.matches) {
        const runtime = runtimeStrips[runtimeIndex];
        const source = rows[sourceIndex].vertices.map(basis).map(([u, v]) => transform(u, v));
        for (let corner = 0; corner < runtime.length; corner++) {
            const error = Math.hypot(
                runtime[corner][0] - source[corner][0],
                runtime[corner][1] - source[corner][1],
            );
            errors.push(error);
            if (pointKey(runtime[corner]) === pointKey(source[corner])) exactCorners++;
        }
    }
    errors.sort((left, right) => left - right);
    const percentile = (ratio) => errors.length
        ? errors[Math.min(errors.length - 1, Math.floor((errors.length - 1) * ratio))]
        : null;
    return {
        exactCorners,
        exactCornerRate: exactCorners / Math.max(1, errors.length),
        medianError: percentile(0.5),
        p90Error: percentile(0.9),
        rmsError: Math.sqrt(
            errors.reduce((sum, error) => sum + error * error, 0) / Math.max(1, errors.length),
        ),
    };
}

function dumpModel(modelPath) {
    const stdout = execFileSync(
        process.execPath,
        [
            path.resolve("tools/assets/dump_mt5_atlas.js"),
            modelPath,
            "--texture",
            ATLAS_HEX,
            "--json",
            "--vertices",
        ],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
}

function sourceGeometry(dump, basis, transform) {
    const pointCounts = new Map();
    const triangleCounts = new Map();
    let corners = 0;
    let triangles = 0;

    for (const row of dump.rows) {
        const points = row.vertices
            .map(basis)
            .filter((uv) => uv && uv.every(Number.isFinite))
            .map(([u, v]) => transform(u, v));
        for (const point of points) {
            addCount(pointCounts, pointKey(point));
            corners++;
        }
        for (let index = 0; index + 2 < points.length; index++) {
            const order = index % 2 === 0
                ? [index, index + 1, index + 2]
                : [index, index + 2, index + 1];
            const triangle = order.map((corner) => points[corner]);
            if (new Set(triangle.map(pointKey)).size < 3) continue;
            addCount(triangleCounts, triangleKey(triangle));
            triangles++;
        }
    }
    return { pointCounts, triangleCounts, corners, triangles };
}

function compare(runtime, dump, basisName, basis, transformName, transform) {
    const source = sourceGeometry(dump, basis, transform);
    const matchedCorners = multisetIntersection(runtime.pointCounts, source.pointCounts);
    const matchedTriangles = multisetIntersection(runtime.triangleCounts, source.triangleCounts);
    return {
        basis: basisName,
        transform: transformName,
        sourceCorners: source.corners,
        matchedRuntimeCorners: matchedCorners,
        runtimeCornerCoverage: matchedCorners / Math.max(1, runtime.referencedCorners),
        sourceTriangles: source.triangles,
        matchedRuntimeTriangles: matchedTriangles,
        runtimeTriangleCoverage: matchedTriangles / Math.max(1, runtime.triangles),
    };
}

const [captureArg, ...models] = process.argv.slice(2);
if (!captureArg || models.length === 0) {
    usage();
    process.exit(2);
}

const captureDir = path.resolve(captureArg);
const frame = JSON.parse(fs.readFileSync(path.join(captureDir, "frame.json"), "utf8"));
const runtime = runtimeGeometry(frame);
const rawTa = rawTaStrips(captureDir, frame);
const reports = [];

for (const modelArg of models) {
    const model = path.resolve(modelArg);
    const dump = dumpModel(model);
    const alignment = alignStripLengths(rawTa.strips, dump.rows);
    const scores = uvBases
        .flatMap(([basisName, basis]) => transforms.map(([name, transform]) => (
            {
                ...compare(runtime, dump, basisName, basis, name, transform),
                ...alignedUvError(rawTa.strips, dump.rows, alignment, basis, transform),
            }
        )))
        .sort((left, right) => (
            right.exactCorners - left.exactCorners
            || left.medianError - right.medianError
            || right.matchedRuntimeTriangles - left.matchedRuntimeTriangles
            || right.matchedRuntimeCorners - left.matchedRuntimeCorners
        ));
    reports.push({
        model,
        strips: dump.stripCount,
        alignment: {
            score: alignment.score,
            matchedStrips: alignment.matchedStrips,
            matchedCorners: alignment.matchedCorners,
            runtimeStrips: rawTa.strips.length,
            sourceStrips: dump.rows.length,
        },
        scores,
    });
}

reports.sort((left, right) => (
    right.scores[0].matchedRuntimeTriangles - left.scores[0].matchedRuntimeTriangles
    || right.scores[0].matchedRuntimeCorners - left.scores[0].matchedRuntimeCorners
));

console.log(JSON.stringify({
    schema: "ryo-runtime-uv-comparison-v1",
    captureDir,
    runtime: {
        polygons: runtime.polygonCount,
        referencedCorners: runtime.referencedCorners,
        triangles: runtime.triangles,
        distinctUvPairs: runtime.pointCounts.size,
        distinctUvTriangles: runtime.triangleCounts.size,
        rawTaHeaders: rawTa.headers.length,
        rawTaStrips: rawTa.strips.length,
        rawTaCorners: rawTa.strips.reduce((sum, strip) => sum + strip.length, 0),
    },
    reports,
}, null, 2));
