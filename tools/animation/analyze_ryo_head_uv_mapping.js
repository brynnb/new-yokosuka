#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { PvrDecoder } from "../../src/PvrDecoder.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function usage() {
    console.error([
        "Usage: node tools/animation/analyze_ryo_head_uv_mapping.js <ryo.MT5> <YKB_KAJ.pvr> [--texture-pack <textures.bin>] [--json]",
        "",
        "Ranks the finite axis/flip UV transforms using topology, atlas-half",
        "agreement, physical triangle distortion, and texture-color continuity",
        "across geometric seams. It also audits the 0x0d TWIDDLED_RECT layout.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = { model: "", texture: "", texturePack: "", json: false };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--texture-pack") {
            args.texturePack = argv[++index] || "";
            if (!args.texturePack) throw new Error("--texture-pack requires a path");
        } else if (!args.model) {
            args.model = arg;
        } else if (!args.texture) {
            args.texture = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (!args.model || !args.texture) {
        usage();
        process.exit(2);
    }
    return args;
}

function exactArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function distance3(left, right) {
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function positionKey(position) {
    return position.map((value) => value.toFixed(5)).join(",");
}

function edgeKey(left, right) {
    const a = positionKey(left);
    const b = positionKey(right);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function canonicalEdge(left, right) {
    return positionKey(left.renderPos) < positionKey(right.renderPos)
        ? { uv0: left.uv, uv1: right.uv }
        : { uv0: right.uv, uv1: left.uv };
}

function buildTriangles(rows) {
    const triangles = [];
    for (const row of rows) {
        const vertices = row.vertices || [];
        for (let index = 0; index + 2 < vertices.length; index++) {
            const corners = index % 2 === 0
                ? [vertices[index], vertices[index + 1], vertices[index + 2]]
                : [vertices[index], vertices[index + 2], vertices[index + 1]];
            if (new Set(corners.map((corner) => positionKey(corner.renderPos))).size < 3) continue;
            triangles.push({ row, corners });
        }
    }
    return triangles;
}

function buildSharedEdges(triangles) {
    const edges = new Map();
    for (const triangle of triangles) {
        const pairs = [[0, 1], [1, 2], [2, 0]];
        for (const [a, b] of pairs) {
            const left = triangle.corners[a];
            const right = triangle.corners[b];
            const key = edgeKey(left.renderPos, right.renderPos);
            if (!edges.has(key)) edges.set(key, []);
            edges.get(key).push({ ...canonicalEdge(left, right), region: triangle.row.atlasRegion });
        }
    }
    return [...edges.values()].filter((uses) => uses.length === 2);
}

const BASE_TRANSFORMS = [
    ["identity", (u, v) => [u, v]],
    ["flip-u", (u, v) => [1 - u, v]],
    ["flip-v", (u, v) => [u, 1 - v]],
    ["flip-uv", (u, v) => [1 - u, 1 - v]],
    ["swap-uv", (u, v) => [v, u]],
    ["rotate-cw", (u, v) => [1 - v, u]],
    ["rotate-ccw", (u, v) => [v, 1 - u]],
    ["swap-flip", (u, v) => [1 - v, 1 - u]],
];

function makeCandidates() {
    const candidates = [];
    for (const [name, transform] of BASE_TRANSFORMS) {
        candidates.push({ name, family: "raw-full-atlas", transform });
        candidates.push({
            name: `${name}+repack-by-strip`,
            family: "repack-by-strip",
            transform(u, v, region) {
                const mapped = transform(u, v);
                return [mapped[0] * 0.5 + (region === "face" ? 0.5 : 0), mapped[1]];
            },
        });
    }
    return candidates;
}

function addressCoordinate(value, mode) {
    if (mode === "clamp") return Math.max(0, Math.min(1, value));
    if (mode === "repeat") return ((value % 1) + 1) % 1;
    const wrapped = ((value % 2) + 2) % 2;
    return wrapped <= 1 ? wrapped : 2 - wrapped;
}

function sampleTexture(decoded, uv, addressMode) {
    const u = addressCoordinate(uv[0], addressMode);
    const v = addressCoordinate(uv[1], addressMode);
    const x = Math.max(0, Math.min(decoded.width - 1, Math.round(u * (decoded.width - 1))));
    const y = Math.max(0, Math.min(decoded.height - 1, Math.round(v * (decoded.height - 1))));
    const offset = (y * decoded.width + x) * 4;
    return decoded.pixelData.subarray(offset, offset + 4);
}

function normalizedColorDistance(left, right) {
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) /
        (255 * Math.sqrt(3));
}

function uvClose(left, right, epsilon = 1e-6) {
    return Math.abs(left[0] - right[0]) <= epsilon && Math.abs(left[1] - right[1]) <= epsilon;
}

function triangleRegion(corners) {
    const us = corners.map((corner) => corner[0]);
    if (Math.max(...us) < 0.5) return "side";
    if (Math.min(...us) >= 0.5) return "face";
    return "crossing";
}

function physicalShapeDistortion(corners, width, height) {
    const ratios = [];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const worldLength = distance3(corners[a].renderPos, corners[b].renderPos);
        const uvLength = Math.hypot(
            (corners[a].mappedUv[0] - corners[b].mappedUv[0]) * width,
            (corners[a].mappedUv[1] - corners[b].mappedUv[1]) * height,
        );
        if (worldLength > 1e-9 && uvLength > 1e-9) ratios.push(uvLength / worldLength);
    }
    if (ratios.length < 2) return null;
    return Math.log(Math.max(...ratios) / Math.min(...ratios));
}

function triangleNormal(corners) {
    const [a, b, c] = corners.map((corner) => corner.renderPos);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...normal);
    return length > 1e-10 ? normal.map((value) => value / length) : null;
}

function windingAudit(triangles) {
    const dots = [];
    for (const triangle of triangles) {
        const geometric = triangleNormal(triangle.corners);
        if (!geometric) continue;
        const stored = [0, 1, 2].map((axis) => average(
            triangle.corners.map((corner) => corner.renderNorm[axis]),
        ));
        const storedLength = Math.hypot(...stored);
        if (storedLength <= 1e-10) continue;
        const normalizedStored = stored.map((value) => value / storedLength);
        dots.push(geometric.reduce((sum, value, axis) => sum + value * normalizedStored[axis], 0));
    }
    const mean = average(dots);
    return {
        triangles: dots.length,
        storedNormalAgreementRate: dots.filter((dot) => dot > 0).length / Math.max(1, dots.length),
        meanStoredNormalDot: mean,
        reversedStoredNormalAgreementRate: dots.filter((dot) => dot < 0).length / Math.max(1, dots.length),
        reversedMeanStoredNormalDot: -mean,
    };
}

function alphaCoverageAudit(triangles, decoded) {
    const barycentricSamples = [
        [1 / 3, 1 / 3, 1 / 3],
        [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6],
        [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8],
    ];
    let samples = 0;
    let zeroAlphaSamples = 0;
    let mostlyTransparentTriangles = 0;
    const byNode = new Map();

    for (const triangle of triangles) {
        const node = `0x${triangle.row.nodeOffset.toString(16)}`;
        const nodeStats = byNode.get(node) || { triangles: 0, samples: 0, zeroAlphaSamples: 0 };
        nodeStats.triangles++;
        let triangleZeroAlpha = 0;
        for (const weights of barycentricSamples) {
            const uv = [0, 1].map((axis) => weights.reduce(
                (sum, weight, corner) => sum + weight * triangle.corners[corner].uv[axis],
                0,
            ));
            const alpha = sampleTexture(decoded, uv, "mirror")[3];
            samples++;
            nodeStats.samples++;
            if (alpha === 0) {
                zeroAlphaSamples++;
                nodeStats.zeroAlphaSamples++;
                triangleZeroAlpha++;
            }
        }
        if (triangleZeroAlpha > barycentricSamples.length / 2) mostlyTransparentTriangles++;
        byNode.set(node, nodeStats);
    }

    return {
        samples,
        zeroAlphaSamples,
        zeroAlphaSampleRate: zeroAlphaSamples / Math.max(1, samples),
        mostlyTransparentTriangles,
        mostlyTransparentTriangleRate: mostlyTransparentTriangles / Math.max(1, triangles.length),
        byNode: Object.fromEntries([...byNode].map(([node, stats]) => [node, {
            ...stats,
            zeroAlphaSampleRate: stats.zeroAlphaSamples / Math.max(1, stats.samples),
        }])),
    };
}

function scoreCandidate(candidate, addressMode, triangles, sharedEdges, decoded) {
    let agrees = 0;
    let disagrees = 0;
    let crossings = 0;
    let outOfBoundsCorners = 0;
    let collapsedTriangles = 0;
    const distortion = [];

    for (const triangle of triangles) {
        const mapped = triangle.corners.map((corner) => ({
            ...corner,
            mappedUv: candidate.transform(corner.uv[0], corner.uv[1], triangle.row.atlasRegion),
        }));
        const region = triangleRegion(mapped.map((corner) => corner.mappedUv));
        if (region === "crossing") crossings++;
        else if (region === triangle.row.atlasRegion) agrees++;
        else disagrees++;

        for (const corner of mapped) {
            if (corner.mappedUv.some((value) => value < 0 || value > 1)) outOfBoundsCorners++;
        }

        const [a, b, c] = mapped.map((corner) => corner.mappedUv);
        const twiceArea = Math.abs(
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        );
        if (twiceArea < 1e-10) collapsedTriangles++;
        const shape = physicalShapeDistortion(mapped, decoded.width, decoded.height);
        if (shape !== null && Number.isFinite(shape)) distortion.push(shape);
    }

    let continuousEdges = 0;
    const seamErrors = [];
    for (const uses of sharedEdges) {
        const [left, right] = uses;
        const left0 = candidate.transform(left.uv0[0], left.uv0[1], left.region);
        const left1 = candidate.transform(left.uv1[0], left.uv1[1], left.region);
        const right0 = candidate.transform(right.uv0[0], right.uv0[1], right.region);
        const right1 = candidate.transform(right.uv1[0], right.uv1[1], right.region);
        if (uvClose(left0, right0) && uvClose(left1, right1)) {
            continuousEdges++;
            continue;
        }
        for (const amount of [0.25, 0.5, 0.75]) {
            const lerp = (a, b) => [
                a[0] + (b[0] - a[0]) * amount,
                a[1] + (b[1] - a[1]) * amount,
            ];
            seamErrors.push(normalizedColorDistance(
                sampleTexture(decoded, lerp(left0, left1), addressMode),
                sampleTexture(decoded, lerp(right0, right1), addressMode),
            ));
        }
    }

    const sortedSeams = [...seamErrors].sort((a, b) => a - b);
    const sortedDistortion = [...distortion].sort((a, b) => a - b);
    const percentile = (values, ratio) => values.length
        ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))]
        : 0;

    return {
        name: candidate.name,
        family: candidate.family,
        addressMode,
        atlasRegionAgreement: {
            agrees,
            disagrees,
            crossings,
            rateExcludingCrossings: agrees / Math.max(1, agrees + disagrees),
            rateIncludingCrossings: agrees / Math.max(1, triangles.length),
        },
        outOfBoundsCorners,
        collapsedTriangles,
        physicalShapeDistortion: {
            meanLogEdgeRatio: average(distortion),
            p90LogEdgeRatio: percentile(sortedDistortion, 0.9),
        },
        sharedEdgeContinuity: {
            sharedEdges: sharedEdges.length,
            continuousEdges,
            discontinuousEdges: sharedEdges.length - continuousEdges,
            continuousRate: continuousEdges / Math.max(1, sharedEdges.length),
            meanDiscontinuousColorError: average(seamErrors),
            p90DiscontinuousColorError: percentile(sortedSeams, 0.9),
        },
    };
}

function textureHalfStats(decoded) {
    const result = [];
    for (const [name, startX, endX] of [
        ["left", 0, Math.floor(decoded.width / 2)],
        ["right", Math.floor(decoded.width / 2), decoded.width],
    ]) {
        let count = 0;
        let transparent = 0;
        let dark = 0;
        let skinLike = 0;
        for (let y = 0; y < decoded.height; y++) {
            for (let x = startX; x < endX; x++) {
                const offset = (y * decoded.width + x) * 4;
                const [r, g, b, a] = decoded.pixelData.subarray(offset, offset + 4);
                count++;
                if (a === 0) transparent++;
                if (Math.max(r, g, b) < 70) dark++;
                if (a > 0 && r > 65 && r > g * 1.08 && g > b * 1.08) skinLike++;
            }
        }
        result.push({
            half: name,
            transparentRate: transparent / count,
            darkRate: dark / count,
            skinLikeRate: skinLike / count,
        });
    }
    return result;
}

function pvrLayoutAudit(decoded) {
    let differingSourceIndexes = 0;
    const sourceIndexes = new Set();
    for (let y = 0; y < decoded.height; y++) {
        for (let x = 0; x < decoded.width; x++) {
            const correct = PvrDecoder.twiddledSourceIndex(x, y, decoded.width, decoded.height, true);
            const legacy = PvrDecoder.twiddledSourceIndex(x, y, decoded.width, decoded.height, false);
            sourceIndexes.add(correct);
            if (correct !== legacy) differingSourceIndexes++;
        }
    }
    return {
        width: decoded.width,
        height: decoded.height,
        colorFormat: decoded.colorFormat,
        dataFormat: decoded.dataFormat,
        dataFormatHex: `0x${decoded.dataFormat.toString(16).padStart(2, "0")}`,
        twiddledRect: decoded.dataFormat === 0x0d,
        squareTileSize: Math.min(decoded.width, decoded.height),
        squareTileCount: Math.max(decoded.width, decoded.height) / Math.min(decoded.width, decoded.height),
        sourceIndexCoverage: sourceIndexes.size / (decoded.width * decoded.height),
        legacyGenericTwiddleMismatchPixels: differingSourceIndexes,
        legacyGenericTwiddleMismatchRate: differingSourceIndexes / (decoded.width * decoded.height),
    };
}

function triangleUvKey(uvs) {
    return uvs
        .map((uv) => uv.map((value) => value.toFixed(7)).join(","))
        .sort()
        .join("|");
}

function multisetAgreement(expectedKeys, actualKeys) {
    const remaining = new Map();
    for (const key of expectedKeys) remaining.set(key, (remaining.get(key) || 0) + 1);
    let matches = 0;
    for (const key of actualKeys) {
        const count = remaining.get(key) || 0;
        if (count <= 0) continue;
        matches++;
        if (count === 1) remaining.delete(key);
        else remaining.set(key, count - 1);
    }
    return {
        expected: expectedKeys.length,
        actual: actualKeys.length,
        matches,
        expectedMatchRate: matches / Math.max(1, expectedKeys.length),
        actualMatchRate: matches / Math.max(1, actualKeys.length),
    };
}

async function runtimeLoaderAudit(modelPath, texturePackPath, triangles, textureIndex) {
    BABYLON.Logger.LogLevels = BABYLON.Logger.NoneLogLevel;
    const engine = new BABYLON.NullEngine({ renderWidth: 64, renderHeight: 64 });
    const scene = new BABYLON.Scene(engine);
    try {
        const modelBuffer = exactArrayBuffer(fs.readFileSync(modelPath));
        const textureBuffer = exactArrayBuffer(fs.readFileSync(texturePackPath));
        const loader = new Mt5Loader(scene, {
            ryoHeadAtlasFix: true,
            backFaceCulling: false,
        });
        loader.setTexturePackIndex(
            Mt5Loader.buildTexturePackIndex(textureBuffer),
            null,
            textureBuffer,
            null,
        );
        const roots = await loader.load(modelBuffer, textureBuffer);
        const headMeshes = roots
            .flatMap((root) => root.getChildMeshes())
            .filter((mesh) => mesh.name === `mt5_tex_${textureIndex}`);
        if (!headMeshes.length) throw new Error(`Runtime loader produced no texture-${textureIndex} meshes`);

        const expectedUvKeys = triangles.map((triangle) =>
            triangleUvKey(triangle.corners.map((corner) => corner.uv)));
        const actualUvKeys = [];
        let vertices = 0;
        let trianglesLoaded = 0;
        let minU = Infinity;
        let minV = Infinity;
        let maxU = -Infinity;
        let maxV = -Infinity;
        let normalSamples = 0;
        let normalHemisphereMatches = 0;

        const root = roots[0];
        const nodes = root?._mt5Nodes || [];
        const nodesByAddress = new Map(nodes.map((node) => [node.addr, node]));
        const worldMatrices = new Map();
        const sourceWorldMatrix = (node) => {
            if (worldMatrices.has(node.addr)) return worldMatrices.get(node.addr);
            const local = Mt5Loader.sourceTransformMatrix(node);
            const parent = nodesByAddress.get(node.parentAddr);
            const world = parent
                ? Mt5Loader.rowMultiply(local, sourceWorldMatrix(parent))
                : local;
            worldMatrices.set(node.addr, world);
            return world;
        };

        for (const mesh of headMeshes) {
            const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind) || [];
            const indices = mesh.getIndices() || [];
            const actualNormals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind) || [];
            const sourceNormals = mesh._mt5SourceNormals || [];
            vertices += uvs.length / 2;
            trianglesLoaded += indices.length / 3;
            for (let index = 0; index < uvs.length; index += 2) {
                minU = Math.min(minU, uvs[index]);
                maxU = Math.max(maxU, uvs[index]);
                minV = Math.min(minV, uvs[index + 1]);
                maxV = Math.max(maxV, uvs[index + 1]);
            }
            for (let index = 0; index < indices.length; index += 3) {
                actualUvKeys.push(triangleUvKey(indices.slice(index, index + 3).map((vertexIndex) =>
                    uvs.slice(vertexIndex * 2, vertexIndex * 2 + 2))));
            }

            const node = mesh.parent?._mt5Node;
            if (!node || sourceNormals.length !== actualNormals.length) continue;
            const world = sourceWorldMatrix(node);
            for (let index = 0; index < actualNormals.length; index += 3) {
                const expected = Mt5Loader.transformRowVector(
                    sourceNormals.slice(index, index + 3),
                    world,
                );
                const actual = actualNormals.slice(index, index + 3);
                const expectedLength = Math.hypot(...expected);
                const actualLength = Math.hypot(...actual);
                if (expectedLength <= 1e-9 || actualLength <= 1e-9) continue;
                const dot = expected.reduce((sum, value, axis) => sum + value * actual[axis], 0) /
                    (expectedLength * actualLength);
                normalSamples++;
                if (dot > 0) normalHemisphereMatches++;
            }
        }

        const materials = headMeshes.map((mesh) => mesh.material).filter(Boolean);
        return {
            texturePack: texturePackPath,
            roots: roots.length,
            meshes: headMeshes.length,
            vertices,
            triangles: trianglesLoaded,
            uvRange: { min: [minU, minV], max: [maxU, maxV] },
            rawTriangleUvAgreement: multisetAgreement(expectedUvKeys, actualUvKeys),
            bakedStoredNormalHemisphereAgreement:
                normalHemisphereMatches / Math.max(1, normalSamples),
            normalSamples,
            materials: materials.map((material) => ({
                transparencyMode: material.transparencyMode,
                alphaTest: material.transparencyMode === BABYLON.Material.MATERIAL_ALPHATEST,
                alphaCutOff: material.alphaCutOff,
                hasAlpha: material.diffuseTexture?.hasAlpha === true,
                invertY: material.diffuseTexture?._texture?.invertY,
                backFaceCulling: material.backFaceCulling,
            })),
        };
    } finally {
        scene.dispose();
        engine.dispose();
    }
}

function printReport(report) {
    console.log(`Ryo head UV mapping audit: ${report.model}`);
    console.log(`texture=${report.texture}`);
    console.log([
        `PVR ${report.pvr.width}x${report.pvr.height}`,
        `format=${report.pvr.dataFormatHex}`,
        `tiles=${report.pvr.squareTileCount}x${report.pvr.squareTileSize}²`,
        `legacy-layout-mismatch=${(report.pvr.legacyGenericTwiddleMismatchRate * 100).toFixed(1)}%`,
    ].join(" "));
    console.log([
        `triangles=${report.geometry.triangles}`,
        `shared-edges=${report.geometry.sharedEdges}`,
        `raw-continuity=${(report.rawEvidence.sharedEdgeContinuousRate * 100).toFixed(1)}%`,
        `raw-region-agreement=${(report.rawEvidence.atlasRegionAgreementExcludingCrossings * 100).toFixed(1)}%`,
    ].join(" "));
    console.log([
        `attr=${report.renderState.headAttributeTypes.join(",")}`,
        `normal-agreement=${(report.renderState.winding.storedNormalAgreementRate * 100).toFixed(1)}%`,
        `alpha-zero-samples=${(report.renderState.alphaCoverage.zeroAlphaSampleRate * 100).toFixed(1)}%`,
    ].join(" "));
    if (report.runtimeLoader) {
        console.log([
            `runtime-triangles=${report.runtimeLoader.triangles}`,
            `runtime-raw-uv=${(report.runtimeLoader.rawTriangleUvAgreement.expectedMatchRate * 100).toFixed(1)}%`,
            `runtime-normal-agreement=${(report.runtimeLoader.bakedStoredNormalHemisphereAgreement * 100).toFixed(1)}%`,
            `runtime-alpha-test=${report.runtimeLoader.materials.every((material) => material.alphaTest)}`,
            `runtime-invert-y=${report.runtimeLoader.materials.some((material) => material.invertY === true)}`,
        ].join(" "));
    }
    console.log("");
    console.log("Raw full-atlas candidates (mirror addressing):");
    for (const row of report.rankings.rawFullAtlas.slice(0, 8)) {
        console.log([
            row.name.padEnd(12),
            `region=${(row.atlasRegionAgreement.rateIncludingCrossings * 100).toFixed(1)}%`,
            `continuous=${(row.sharedEdgeContinuity.continuousRate * 100).toFixed(1)}%`,
            `seamError=${row.sharedEdgeContinuity.meanDiscontinuousColorError.toFixed(4)}`,
            `shape=${row.physicalShapeDistortion.meanLogEdgeRatio.toFixed(3)}`,
        ].join(" "));
    }
    console.log("");
    console.log("Best strip-repacked candidate:");
    const repacked = report.rankings.repackByStrip[0];
    console.log([
        repacked.name,
        `continuous=${(repacked.sharedEdgeContinuity.continuousRate * 100).toFixed(1)}%`,
        `seamError=${repacked.sharedEdgeContinuity.meanDiscontinuousColorError.toFixed(4)}`,
        `shape=${repacked.physicalShapeDistortion.meanLogEdgeRatio.toFixed(3)}`,
    ].join(" "));
    console.log("");
    console.log("Machine conclusion:");
    for (const line of report.conclusions) console.log(`- ${line}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const model = path.resolve(args.model);
    const texture = path.resolve(args.texture);
    const texturePack = args.texturePack ? path.resolve(args.texturePack) : "";
    const dumpScript = path.join(repoRoot, "tools", "assets/dump_mt5_atlas.js");
    const stateAuditScript = path.join(repoRoot, "tools", "assets/audit_mt5_model_state.js");
    const dump = JSON.parse(execFileSync(process.execPath, [dumpScript, model, "--json", "--vertices"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    }));
    const stateAudit = JSON.parse(execFileSync(process.execPath, [stateAuditScript, model, "--json"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    }));
    const decoded = new PvrDecoder(exactArrayBuffer(fs.readFileSync(texture))).decodePixels();
    if (!decoded) throw new Error(`Could not decode ${texture}`);

    const triangles = buildTriangles(dump.rows);
    const sharedEdges = buildSharedEdges(triangles);
    const scores = [];
    for (const candidate of makeCandidates()) {
        for (const addressMode of ["mirror", "repeat", "clamp"]) {
            scores.push(scoreCandidate(candidate, addressMode, triangles, sharedEdges, decoded));
        }
    }
    const rank = (rows) => [...rows].sort((a, b) =>
        b.atlasRegionAgreement.rateIncludingCrossings - a.atlasRegionAgreement.rateIncludingCrossings ||
        a.sharedEdgeContinuity.meanDiscontinuousColorError - b.sharedEdgeContinuity.meanDiscontinuousColorError ||
        a.physicalShapeDistortion.meanLogEdgeRatio - b.physicalShapeDistortion.meanLogEdgeRatio);
    const rawMirror = rank(scores.filter((row) => row.family === "raw-full-atlas" && row.addressMode === "mirror"));
    const repackMirror = rank(scores.filter((row) => row.family === "repack-by-strip" && row.addressMode === "mirror"));
    const identity = scores.find((row) => row.name === "identity" && row.addressMode === "mirror");
    const currentViewer = scores.find((row) => row.name === "swap-uv" && row.addressMode === "mirror");
    const bestRepack = repackMirror[0];
    const headState = stateAudit.textures[dump.textureIndex];
    const attributeTypes = (textureState) => [...new Set(Object.keys(textureState?.attrGroups || {})
        .map((key) => key.match(/attr=(0x[0-9a-f]+)/i)?.[1])
        .filter(Boolean))];
    const headAttributeTypes = attributeTypes(headState);
    const otherTextureAttributeTypes = Object.fromEntries(stateAudit.textures
        .filter((textureState) => textureState.textureIndex !== dump.textureIndex)
        .map((textureState) => [textureState.textureIndex, attributeTypes(textureState)]));
    const winding = windingAudit(triangles);
    const runtimeLoader = texturePack
        ? await runtimeLoaderAudit(model, texturePack, triangles, dump.textureIndex)
        : null;

    const report = {
        model,
        texture,
        atlasTextureId: dump.textureHex,
        pvr: pvrLayoutAudit(decoded),
        textureHalves: textureHalfStats(decoded),
        geometry: {
            nodes: dump.nodeCount,
            strips: dump.stripCount,
            triangles: triangles.length,
            sharedEdges: sharedEdges.length,
        },
        renderState: {
            headAttributeTypes,
            otherTextureAttributeTypes,
            winding,
            alphaCoverage: alphaCoverageAudit(triangles, decoded),
        },
        runtimeLoader,
        rawEvidence: {
            atlasRegionAgreementIncludingCrossings: identity.atlasRegionAgreement.rateIncludingCrossings,
            atlasRegionAgreementExcludingCrossings: identity.atlasRegionAgreement.rateExcludingCrossings,
            sharedEdgeContinuousRate: identity.sharedEdgeContinuity.continuousRate,
            discontinuousEdgeColorError: identity.sharedEdgeContinuity.meanDiscontinuousColorError,
            currentViewerSwapRegionAgreement: currentViewer.atlasRegionAgreement.rateIncludingCrossings,
        },
        rankings: {
            rawFullAtlas: rawMirror,
            repackByStrip: repackMirror,
            allAddressModes: rank(scores),
        },
        conclusions: [
            decoded.dataFormat === 0x0d && pvrLayoutAudit(decoded).legacyGenericTwiddleMismatchRate > 0
                ? "The atlas requires square-tiled TWIDDLED_RECT decoding; generic rectangular Morton decoding rearranges source pixels."
                : "No TWIDDLED_RECT-specific layout difference was detected.",
            identity.atlasRegionAgreement.rateExcludingCrossings > 0.85
                ? "Raw MT5 UVs already encode the horizontal face/side atlas split; geometric reprojection is not needed to create that split."
                : "Raw MT5 UVs do not strongly encode the expected horizontal atlas split.",
            identity.sharedEdgeContinuity.continuousRate > 0.95
                ? "Raw MT5 UVs are topologically coherent across more than 95% of shared geometric edges."
                : "Raw MT5 UV continuity is too low to treat the mapping as final without another patching stage.",
            currentViewer.atlasRegionAgreement.rateIncludingCrossings < identity.atlasRegionAgreement.rateIncludingCrossings * 0.75
                ? "The viewer's global U/V swap destroys much of the atlas-half correspondence for this rectangular texture."
                : "The viewer's global U/V swap is not strongly contradicted by atlas-half correspondence.",
            bestRepack.sharedEdgeContinuity.continuousRate < identity.sharedEdgeContinuity.continuousRate
                ? "Repacking by geometrically classified strips introduces additional UV discontinuities compared with the raw mapping."
                : "Strip-based repacking does not reduce measured UV continuity.",
            headAttributeTypes.includes("0x3")
                ? "The head atlas explicitly uses MT5 attribute type 0x03, matching the alpha hair-card path rather than Ryo's 0x02 opaque body textures."
                : "The head atlas does not expose the expected 0x03 alpha attribute.",
            winding.storedNormalAgreementRate > 0.95
                ? "Under the baked coordinate conversion and Babylon's left-handed face-normal convention, the non-reversed strip winding agrees with stored head normals; treating the atlas as opaque selects the loader's opposite winding path."
                : "Stored normals do not decisively select a strip winding.",
            runtimeLoader?.rawTriangleUvAgreement.expectedMatchRate === 1
                ? "The final Babylon meshes preserve every raw source UV triangle exactly."
                : runtimeLoader
                    ? "The final Babylon mesh UV triangles differ from the raw source mapping."
                    : "Pass --texture-pack to verify the final Babylon mesh and material state.",
            runtimeLoader?.materials.every((material) => material.alphaTest && material.invertY === false)
                ? "The final Babylon head materials use alpha test and upload decoded rows without a Y inversion."
                : runtimeLoader
                    ? "The final Babylon material state does not match the expected alpha-test/non-inverted texture path."
                    : "Runtime alpha and texture-orientation state was not checked without a texture pack.",
            "Identity and vertical-flip variants cannot be conclusively separated by topology alone; final V orientation needs a renderer convention or runtime reference.",
        ],
    };

    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
}

try {
    await main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
