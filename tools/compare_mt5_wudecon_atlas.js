#!/usr/bin/env node
import fs from "node:fs";

function usage() {
    console.error([
        "Usage: node tools/compare_mt5_wudecon_atlas.js <mt5-atlas.json> <wudecon-obj-atlas.json> [--json] [--samples N]",
        "",
        "The MT5 dump should come from dump_mt5_atlas.js --json --vertices.",
        "The OBJ dump should come from dump_wudecon_obj_atlas.js --json --vertices.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        mt5File: null,
        objFile: null,
        json: false,
        samples: 8,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--samples") {
            args.samples = Number.parseInt(argv[++i] || "8", 10);
        } else if (!args.mt5File) {
            args.mt5File = arg;
        } else if (!args.objFile) {
            args.objFile = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.mt5File || !args.objFile) {
        usage();
        process.exit(2);
    }
    if (!Number.isFinite(args.samples) || args.samples < 0) args.samples = 8;
    return args;
}

function center(points) {
    return points.reduce(
        (sum, point) => [
            sum[0] + point[0] / points.length,
            sum[1] + point[1] / points.length,
            sum[2] + point[2] / points.length,
        ],
        [0, 0, 0],
    );
}

function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const PERMUTATIONS = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

function bestPermutationScore(left, right, score) {
    let best = { permutation: PERMUTATIONS[0], score: Infinity };
    for (const permutation of PERMUTATIONS) {
        let sum = 0;
        for (let i = 0; i < 3; i++) {
            sum += score(left[i], right[permutation[i]]);
        }
        const average = sum / 3;
        if (average < best.score) best = { permutation, score: average };
    }
    return best;
}

function faceDistance(leftPositions, rightPositions) {
    return bestPermutationScore(leftPositions, rightPositions, distance).score;
}

function mt5ObjPosition(vertex) {
    return [
        -(vertex.renderPos?.[0] || 0),
        vertex.renderPos?.[1] || 0,
        vertex.renderPos?.[2] || 0,
    ];
}

function regionFromUvU(uValues) {
    if (uValues.every((u) => u < 0.5)) return "sideBackHalf";
    if (uValues.every((u) => u >= 0.5)) return "faceHalf";
    return "seamCrossing";
}

function triangleRows(mt5Dump) {
    const triangles = [];
    for (const row of mt5Dump.rows || []) {
        const vertices = row.vertices || [];
        for (let i = 0; i < vertices.length - 2; i++) {
            const triangle = i % 2 === 0
                ? [vertices[i], vertices[i + 1], vertices[i + 2]]
                : [vertices[i], vertices[i + 2], vertices[i + 1]];
            triangles.push({
                row,
                triangle,
                positions: triangle.map(mt5ObjPosition),
                center: center(triangle.map(mt5ObjPosition)),
                rawRegion: regionFromUvU(triangle.map((vertex) => vertex.uv?.[0] || 0)),
            });
        }
    }
    return triangles;
}

function binKey(point, size) {
    return point.map((value) => Math.floor(value / size)).join(",");
}

function neighborKeys(point, size) {
    const base = point.map((value) => Math.floor(value / size));
    const keys = [];
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                keys.push([base[0] + x, base[1] + y, base[2] + z].join(","));
            }
        }
    }
    return keys;
}

function buildObjFaceIndex(objDump, binSize) {
    const faces = (objDump.atlasFaces || []).map((face, index) => {
        const positions = face.vertices.map((vertex) => vertex.position);
        return {
            index,
            face,
            positions,
            center: center(positions),
        };
    });
    const bins = new Map();
    for (const face of faces) {
        const key = binKey(face.center, binSize);
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(face);
    }
    return { faces, bins };
}

function findBestObjFace(triangle, index, binSize) {
    let candidates = [];
    for (const key of neighborKeys(triangle.center, binSize)) {
        candidates.push(...(index.bins.get(key) || []));
    }
    if (candidates.length === 0) candidates = index.faces;

    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        if (distance(triangle.center, candidate.center) > binSize * 2) continue;
        const candidateDistance = faceDistance(triangle.positions, candidate.positions);
        if (candidateDistance < bestDistance) {
            bestDistance = candidateDistance;
            best = candidate;
        }
    }

    return { face: best, distance: bestDistance };
}

function currentProjectCwUv(vertex) {
    return vertex.finalProjectCwAtlasUv || vertex.uv || [0, 0];
}

function rawObjUv(vertex) {
    return vertex.uv || [0, 0];
}

function projectCwObjSideUv(row, vertex) {
    return row.atlasRegion === "face" ? currentProjectCwUv(vertex) : rawObjUv(vertex);
}

function uvDistance(leftUv, rightUv) {
    return Math.hypot(leftUv[0] - rightUv[0], leftUv[1] - rightUv[1]);
}

function uvError(triangle, objFace, uvForVertex) {
    return bestPermutationScore(
        triangle.triangle,
        objFace.face.vertices,
        (left, right) => uvDistance(uvForVertex(left), right.uv),
    ).score;
}

function incrementMatrix(matrix, left, right) {
    if (!matrix[left]) matrix[left] = {};
    matrix[left][right] = (matrix[left][right] || 0) + 1;
}

function summarize(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return {
        count: sorted.length,
        min: sorted[0],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p90: sorted[Math.floor(sorted.length * 0.9)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        max: sorted[sorted.length - 1],
        avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    };
}

function round(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

function roundArray(values) {
    return values?.map(round);
}

function sampleMatch(match) {
    return {
        distance: match.distance,
        nodeOffset: match.triangle.row.nodeOffset,
        stripIndex: match.triangle.row.stripIndex,
        stripClass: match.triangle.row.atlasRegion,
        rawRegion: match.triangle.rawRegion,
        objRegion: match.obj.face.region,
        uvError: {
            rawObj: match.uvError.rawObj,
            currentProjectCw: match.uvError.currentProjectCw,
            projectCwObjSide: match.uvError.projectCwObjSide,
        },
        mt5: match.triangle.triangle.map((vertex) => ({
            position: roundArray(mt5ObjPosition(vertex)),
            rawUv: roundArray(vertex.uv),
            currentProjectCwUv: roundArray(vertex.finalProjectCwAtlasUv),
        })),
        obj: match.obj.face.vertices.map((vertex) => ({
            position: roundArray(vertex.position),
            uv: roundArray(vertex.uv),
        })),
    };
}

function compare(mt5Dump, objDump, options = {}) {
    const binSize = options.binSize || 0.03;
    const mt5Triangles = triangleRows(mt5Dump);
    const objIndex = buildObjFaceIndex(objDump, binSize);
    const matches = [];
    const unmatched = [];

    for (const triangle of mt5Triangles) {
        const best = findBestObjFace(triangle, objIndex, binSize);
        if (!best.face) {
            unmatched.push(triangle);
            continue;
        }
        const match = {
            triangle,
            obj: best.face,
            distance: best.distance,
            uvError: {
                rawObj: uvError(triangle, best.face, rawObjUv),
                currentProjectCw: uvError(triangle, best.face, currentProjectCwUv),
                projectCwObjSide: uvError(triangle, best.face, (vertex) => projectCwObjSideUv(triangle.row, vertex)),
            },
        };
        matches.push(match);
    }

    const stripClassVsObjRegion = {};
    const rawRegionVsObjRegion = {};
    const distances = [];
    const rawUvErrors = [];
    const currentUvErrors = [];
    const objSideUvErrors = [];

    for (const match of matches) {
        distances.push(match.distance);
        rawUvErrors.push(match.uvError.rawObj);
        currentUvErrors.push(match.uvError.currentProjectCw);
        objSideUvErrors.push(match.uvError.projectCwObjSide);
        incrementMatrix(stripClassVsObjRegion, match.triangle.row.atlasRegion, match.obj.face.region);
        incrementMatrix(rawRegionVsObjRegion, match.triangle.rawRegion, match.obj.face.region);
    }

    const sortedByCurrentError = [...matches].sort((a, b) => b.uvError.currentProjectCw - a.uvError.currentProjectCw);
    const stripClassDisagreements = matches.filter((match) => {
        if (match.triangle.row.atlasRegion === "face") return match.obj.face.region !== "faceHalf";
        return match.obj.face.region === "faceHalf";
    });

    return {
        mt5Triangles: mt5Triangles.length,
        objFaces: objIndex.faces.length,
        matched: matches.length,
        unmatched: unmatched.length,
        distance: summarize(distances),
        stripClassVsObjRegion,
        rawRegionVsObjRegion,
        uvError: {
            rawObj: summarize(rawUvErrors),
            currentProjectCw: summarize(currentUvErrors),
            projectCwObjSide: summarize(objSideUvErrors),
        },
        samples: {
            worstCurrentProjectCw: sortedByCurrentError.slice(0, options.samples || 0).map(sampleMatch),
            stripClassDisagreements: stripClassDisagreements.slice(0, options.samples || 0).map(sampleMatch),
        },
    };
}

function printText(result) {
    console.log(`MT5 triangles: ${result.mt5Triangles}`);
    console.log(`OBJ faces: ${result.objFaces}`);
    console.log(`Matched: ${result.matched}`);
    console.log(`Unmatched: ${result.unmatched}`);
    console.log(`Position distance avg: ${result.distance?.avg}`);
    console.log("");
    console.log("Strip classifier vs OBJ region:");
    console.log(JSON.stringify(result.stripClassVsObjRegion, null, 2));
    console.log("");
    console.log("Raw MT5 UV region vs OBJ region:");
    console.log(JSON.stringify(result.rawRegionVsObjRegion, null, 2));
    console.log("");
    console.log("UV error:");
    console.log(JSON.stringify(result.uvError, null, 2));
}

const args = parseArgs(process.argv.slice(2));
const mt5Dump = JSON.parse(fs.readFileSync(args.mt5File, "utf8"));
const objDump = JSON.parse(fs.readFileSync(args.objFile, "utf8"));
const result = compare(mt5Dump, objDump, { samples: args.samples });

if (args.json) {
    console.log(JSON.stringify(result, null, 2));
} else {
    printText(result);
}
