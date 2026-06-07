#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";

const repoRoot = process.cwd();
const HEAD_ATLAS_HEX = "a64b425f4b414a5f";

function usage() {
    console.error([
        "Usage: node tools/diagnose_ryo_face_uv_transfer.js --body <body.MT5> --face <face.MT5> [options]",
        "",
        "Options:",
        "  --out <json>             Write report JSON. Default: viewer-test/output/ryo-face-uv-transfer-diagnostic.json",
        "  --attach-node <hex>      Body attach node. Default: 0xd648",
        "  --compose <mode>         face-node, attach-only, face-only, identity. Default: face-node",
        "  --max-distance <n>       Good position-match cutoff. Default: 0.035",
        "  --normal-weight <n>      Normal penalty weight for matching. Default: 0.015",
        "  --match-mode <mode>      nearest or triangle. Default: nearest",
        "  --quiet                  Write JSON without printing the full report.",
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        body: "public/models/S2_YDB1_YKC_M.MT5",
        face: "viewer-test/output/pc-sm1-ryo/SCENE/03/MODEL/FACE/YKG_F.MT5",
        out: "viewer-test/output/ryo-face-uv-transfer-diagnostic.json",
        attachNode: 0xd648,
        compose: "face-node",
        maxDistance: 0.035,
        normalWeight: 0.015,
        matchMode: "nearest",
        quiet: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = argv[i + 1];
        if (arg === "--help" || arg === "-h") {
            usage();
            process.exit(0);
        } else if (arg === "--body") {
            args.body = value;
            i++;
        } else if (arg === "--face") {
            args.face = value;
            i++;
        } else if (arg === "--out") {
            args.out = value;
            i++;
        } else if (arg === "--attach-node") {
            args.attachNode = Number.parseInt(String(value).replace(/^0x/i, ""), 16);
            i++;
        } else if (arg === "--compose") {
            args.compose = value;
            i++;
        } else if (arg === "--max-distance") {
            args.maxDistance = Number.parseFloat(value);
            i++;
        } else if (arg === "--normal-weight") {
            args.normalWeight = Number.parseFloat(value);
            i++;
        } else if (arg === "--match-mode") {
            args.matchMode = value;
            i++;
        } else if (arg === "--quiet") {
            args.quiet = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!["face-node", "attach-only", "face-only", "identity"].includes(args.compose)) {
        throw new Error(`Unsupported --compose ${args.compose}`);
    }
    if (!Number.isFinite(args.attachNode)) throw new Error("Invalid --attach-node");
    if (!Number.isFinite(args.maxDistance)) throw new Error("Invalid --max-distance");
    if (!Number.isFinite(args.normalWeight)) throw new Error("Invalid --normal-weight");
    if (!["nearest", "triangle"].includes(args.matchMode)) throw new Error(`Unsupported --match-mode ${args.matchMode}`);
    return args;
}

function resolveInput(file) {
    return path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
}

function normalize(vec) {
    const len = Math.hypot(vec[0], vec[1], vec[2]);
    if (!Number.isFinite(len) || len <= 1e-8) return [0, 0, 0];
    return [vec[0] / len, vec[1] / len, vec[2] / len];
}

function transformNormal(normal, matrix) {
    return normalize(Mt5Loader.transformRowVector(normal, matrix));
}

function findNodeByAddr(root, addr) {
    return (root._mt5Nodes || []).find((node) => node.addr === addr) || null;
}

function textureIdForHex(loader, hex) {
    for (const [index, id] of loader.textureIds.entries()) {
        if (Mt5Loader.textureIdHex(id) === hex) return index;
    }
    return null;
}

function meshTextureId(mesh) {
    const match = /^mt5_mat_(\d+)(?:_|$)/.exec(mesh.material?.name || "");
    return match ? Number.parseInt(match[1], 10) : null;
}

function faceOverlayMatrix(faceLoader, faceNode, attachMatrix, composeMode) {
    const faceWorld = faceLoader.sourceWorldMatrixForNode(faceNode);
    if (composeMode === "attach-only") return attachMatrix;
    if (composeMode === "face-only") return faceWorld;
    if (composeMode === "identity") return Mt5Loader.rowIdentity();
    return Mt5Loader.rowMultiply(faceWorld, attachMatrix);
}

function atlasMeshes(root, loader, atlasTexId) {
    return root.getDescendants(false).filter((node) => (
        node instanceof BABYLON.Mesh &&
        node.getTotalVertices() > 0 &&
        meshTextureId(node) === atlasTexId
    ));
}

function collectBodyCandidates(root, loader, atlasTexId) {
    const rows = [];
    for (const mesh of atlasMeshes(root, loader, atlasTexId)) {
        const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) || [];
        const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind) || [];
        const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind) || [];
        const sourcePositions = mesh._mt5SourcePositions || [];
        const sourceNormals = mesh._mt5SourceNormals || [];

        for (let i = 0; i < positions.length; i += 3) {
            const si = i;
            const sourcePos = sourcePositions.length >= si + 3
                ? [sourcePositions[si], sourcePositions[si + 1], sourcePositions[si + 2]]
                : null;
            const sourceNorm = sourceNormals.length >= si + 3
                ? normalize([sourceNormals[si], sourceNormals[si + 1], sourceNormals[si + 2]])
                : null;
            if (!sourcePos || !sourceNorm) continue;

            const [x, y, z] = sourcePos;
            const [nx, ny, nz] = sourceNorm;
            const looksLikeFace = (
                x >= 0.02 &&
                Math.abs(y) <= 0.13 &&
                z >= -0.035 &&
                z <= 0.25 &&
                nx >= -0.05 &&
                Math.abs(ny) <= 0.95 &&
                Math.abs(nz) <= 0.98
            );
            if (!looksLikeFace) continue;

            rows.push({
                mesh: mesh.name,
                parent: mesh.parent?.name || "",
                vertex: i / 3,
                position: [positions[i], positions[i + 1], positions[i + 2]],
                normal: normals.length >= i + 3
                    ? normalize([normals[i], normals[i + 1], normals[i + 2]])
                    : sourceNorm,
                sourcePos,
                sourceNorm,
                currentUv: uvs.length >= (i / 3) * 2 + 2
                    ? [uvs[(i / 3) * 2], uvs[(i / 3) * 2 + 1]]
                    : null,
            });
        }
    }
    return rows;
}

function collectFaceReferences(root, loader, atlasTexId, attachMatrix, composeMode) {
    const rows = [];
    for (const node of root._mt5Nodes || []) {
        if (!node.mesh) continue;
        const matrix = faceOverlayMatrix(loader, node, attachMatrix, composeMode);
        for (const mesh of atlasMeshes(node.mesh, loader, atlasTexId)) {
            const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind) || [];
            const sourcePositions = mesh._mt5SourcePositions || [];
            const sourceNormals = mesh._mt5SourceNormals || [];
            for (let i = 0; i < sourcePositions.length; i += 3) {
                const uvIndex = (i / 3) * 2;
                if (uvs.length < uvIndex + 2) continue;
                const uv = [uvs[uvIndex], uvs[uvIndex + 1]];
                // The right half of the combined atlas is the face. Keep only
                // likely face references so side-ear/hair cards do not dominate.
                if (uv[0] < 0.5) continue;

                const sourcePos = [
                    sourcePositions[i],
                    sourcePositions[i + 1],
                    sourcePositions[i + 2],
                ];
                const sourceNorm = sourceNormals.length >= i + 3
                    ? [sourceNormals[i], sourceNormals[i + 1], sourceNormals[i + 2]]
                    : [0, 0, 1];
                rows.push({
                    mesh: mesh.name,
                    node: `0x${node.addr.toString(16)}`,
                    vertex: i / 3,
                    position: Mt5Loader.transformRowPoint(sourcePos, matrix),
                    normal: transformNormal(sourceNorm, matrix),
                    sourcePos,
                    sourceNorm: normalize(sourceNorm),
                    uv,
                });
            }
        }
    }
    return rows;
}

function quantizedPositionKey(position, scale = 100000) {
    return position.map((value) => Math.round(value * scale)).join(",");
}

function triangleKey(corners) {
    return corners
        .map((corner) => corner.qpos)
        .slice()
        .sort()
        .join("|");
}

function closestCornerByPosition(corner, candidates) {
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const dx = corner.position[0] - candidate.position[0];
        const dy = corner.position[1] - candidate.position[1];
        const dz = corner.position[2] - candidate.position[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    }
    return best;
}

function collectBodyTriangles(root, loader, atlasTexId) {
    const rows = [];
    for (const mesh of atlasMeshes(root, loader, atlasTexId)) {
        const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) || [];
        const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind) || [];
        const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind) || [];
        const indices = mesh.getIndices() || [];
        const parent = mesh.parent?.name || "";

        for (let i = 0; i < indices.length; i += 3) {
            const corners = [];
            for (const vertex of [indices[i], indices[i + 1], indices[i + 2]]) {
                const pi = vertex * 3;
                const ui = vertex * 2;
                if (positions.length < pi + 3 || uvs.length < ui + 2) continue;
                const position = [positions[pi], positions[pi + 1], positions[pi + 2]];
                corners.push({
                    mesh: mesh.name,
                    parent,
                    vertex,
                    position,
                    qpos: quantizedPositionKey(position),
                    normal: normals.length >= pi + 3
                        ? normalize([normals[pi], normals[pi + 1], normals[pi + 2]])
                        : [0, 0, 1],
                    currentUv: [uvs[ui], uvs[ui + 1]],
                });
            }
            if (corners.length === 3) {
                rows.push({
                    mesh: mesh.name,
                    parent,
                    triangle: i / 3,
                    key: triangleKey(corners),
                    corners,
                });
            }
        }
    }
    return rows;
}

function collectFaceTriangles(root, loader, atlasTexId, attachMatrix, composeMode) {
    const rows = [];
    for (const node of root._mt5Nodes || []) {
        if (!node.mesh) continue;
        const matrix = faceOverlayMatrix(loader, node, attachMatrix, composeMode);
        for (const mesh of atlasMeshes(node.mesh, loader, atlasTexId)) {
            const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind) || [];
            const indices = mesh.getIndices() || [];
            const sourcePositions = mesh._mt5SourcePositions || [];
            const sourceNormals = mesh._mt5SourceNormals || [];

            for (let i = 0; i < indices.length; i += 3) {
                const corners = [];
                for (const vertex of [indices[i], indices[i + 1], indices[i + 2]]) {
                    const pi = vertex * 3;
                    const ui = vertex * 2;
                    if (sourcePositions.length < pi + 3 || uvs.length < ui + 2) continue;
                    const uv = [uvs[ui], uvs[ui + 1]];
                    if (uv[0] < 0.5) continue;
                    const sourcePos = [
                        sourcePositions[pi],
                        sourcePositions[pi + 1],
                        sourcePositions[pi + 2],
                    ];
                    const sourceNorm = sourceNormals.length >= pi + 3
                        ? [sourceNormals[pi], sourceNormals[pi + 1], sourceNormals[pi + 2]]
                        : [0, 0, 1];
                    const position = Mt5Loader.transformRowPoint(sourcePos, matrix);
                    corners.push({
                        mesh: mesh.name,
                        node: `0x${node.addr.toString(16)}`,
                        vertex,
                        position,
                        qpos: quantizedPositionKey(position),
                        normal: transformNormal(sourceNorm, matrix),
                        uv,
                    });
                }
                if (corners.length === 3) {
                    rows.push({
                        mesh: mesh.name,
                        node: `0x${node.addr.toString(16)}`,
                        triangle: i / 3,
                        key: triangleKey(corners),
                        corners,
                    });
                }
            }
        }
    }
    return rows;
}

function buildTriangleTransferMatches(bodyTriangles, faceTriangles) {
    const faceByKey = new Map();
    for (const tri of faceTriangles) {
        if (!faceByKey.has(tri.key)) faceByKey.set(tri.key, []);
        faceByKey.get(tri.key).push(tri);
    }

    const assignments = new Map();
    let matchedTriangles = 0;
    let conflictedAssignments = 0;
    for (const bodyTri of bodyTriangles) {
        const candidates = faceByKey.get(bodyTri.key);
        if (!candidates || candidates.length === 0) continue;
        matchedTriangles++;
        const faceTri = candidates[0];
        for (const bodyCorner of bodyTri.corners) {
            const faceCorner = closestCornerByPosition(bodyCorner, faceTri.corners);
            if (!faceCorner) continue;
            const key = `${bodyCorner.parent}/${bodyCorner.mesh}/${bodyCorner.vertex}`;
            const existing = assignments.get(key);
            const row = {
                parent: bodyCorner.parent,
                mesh: bodyCorner.mesh,
                vertex: bodyCorner.vertex,
                position: bodyCorner.position,
                currentUv: bodyCorner.currentUv,
                transferredUv: faceCorner.uv,
                reference: {
                    mesh: faceCorner.mesh,
                    node: faceCorner.node,
                    vertex: faceCorner.vertex,
                    position: faceCorner.position,
                    distance: Math.hypot(
                        bodyCorner.position[0] - faceCorner.position[0],
                        bodyCorner.position[1] - faceCorner.position[1],
                        bodyCorner.position[2] - faceCorner.position[2],
                    ),
                    normalDot: (
                        bodyCorner.normal[0] * faceCorner.normal[0] +
                        bodyCorner.normal[1] * faceCorner.normal[1] +
                        bodyCorner.normal[2] * faceCorner.normal[2]
                    ),
                    triangle: faceTri.triangle,
                },
                good: true,
            };
            if (existing) {
                const du = Math.abs(existing.transferredUv[0] - row.transferredUv[0]);
                const dv = Math.abs(existing.transferredUv[1] - row.transferredUv[1]);
                if (du > 0.00001 || dv > 0.00001) conflictedAssignments++;
            }
            assignments.set(key, row);
        }
    }

    return {
        matches: [...assignments.values()],
        matchedTriangles,
        conflictedAssignments,
        bodyTriangleCount: bodyTriangles.length,
        faceTriangleCount: faceTriangles.length,
    };
}

function nearestReference(body, references, normalWeight) {
    let best = null;
    let bestScore = Infinity;
    for (const ref of references) {
        const dx = body.position[0] - ref.position[0];
        const dy = body.position[1] - ref.position[1];
        const dz = body.position[2] - ref.position[2];
        const distance = Math.hypot(dx, dy, dz);
        const dot = Math.max(-1, Math.min(1,
            body.normal[0] * ref.normal[0] +
            body.normal[1] * ref.normal[1] +
            body.normal[2] * ref.normal[2],
        ));
        const normalPenalty = (1 - dot) * normalWeight;
        const score = distance + normalPenalty;
        if (score < bestScore) {
            bestScore = score;
            best = { ref, distance, dot, score };
        }
    }
    return best;
}

function stats(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const pct = (ratio) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)))];
    return {
        count: sorted.length,
        min: sorted[0],
        p50: pct(0.5),
        p90: pct(0.9),
        p95: pct(0.95),
        max: sorted[sorted.length - 1],
        avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    };
}

function range2(rows, key) {
    const values = rows.map((row) => row[key]).filter((value) => Array.isArray(value));
    if (values.length === 0) return null;
    return {
        count: values.length,
        min: [
            Math.min(...values.map((value) => value[0])),
            Math.min(...values.map((value) => value[1])),
        ],
        max: [
            Math.max(...values.map((value) => value[0])),
            Math.max(...values.map((value) => value[1])),
        ],
        avg: [
            values.reduce((sum, value) => sum + value[0], 0) / values.length,
            values.reduce((sum, value) => sum + value[1], 0) / values.length,
        ],
    };
}

async function loadMt5(scene, file, options = {}) {
    const loader = new Mt5Loader(scene, {
        characterRigMode: options.characterRigMode || "baked",
        backFaceCulling: false,
        ryoHeadAtlasFix: options.ryoHeadAtlasFix ?? false,
        ryoHeadAtlasMode: options.ryoHeadAtlasMode || "obj-raw",
        textureCoordinateMode: options.textureCoordinateMode || "viewer",
    });
    const buffer = fs.readFileSync(file);
    const roots = await loader.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), null);
    if (roots.length === 0) throw new Error(`No renderable MT5 roots for ${file}`);
    return { loader, root: roots[0] };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const bodyPath = resolveInput(args.body);
    const facePath = resolveInput(args.face);
    const outPath = resolveInput(args.out);

    const engine = new BABYLON.NullEngine({ renderHeight: 256, renderWidth: 256, textureSize: 256 });
    const scene = new BABYLON.Scene(engine);

    const body = await loadMt5(scene, bodyPath, { characterRigMode: "baked", ryoHeadAtlasFix: true });
    const face = await loadMt5(scene, facePath, { characterRigMode: "hierarchy", ryoHeadAtlasFix: false });
    const bodyAtlasTexId = textureIdForHex(body.loader, HEAD_ATLAS_HEX);
    const faceAtlasTexId = textureIdForHex(face.loader, HEAD_ATLAS_HEX);
    if (bodyAtlasTexId === null) throw new Error(`Body model does not reference ${HEAD_ATLAS_HEX}`);
    if (faceAtlasTexId === null) throw new Error(`FACE model does not reference ${HEAD_ATLAS_HEX}`);

    const attachNode = findNodeByAddr(body.root, args.attachNode);
    if (!attachNode) throw new Error(`Attach node 0x${args.attachNode.toString(16)} not found in body model`);
    const attachMatrix = body.loader.sourceWorldMatrixForNode(attachNode);

    const bodyCandidates = collectBodyCandidates(body.root, body.loader, bodyAtlasTexId);
    const faceReferences = collectFaceReferences(face.root, face.loader, faceAtlasTexId, attachMatrix, args.compose);
    const bodyTriangles = collectBodyTriangles(body.root, body.loader, bodyAtlasTexId);
    const faceTriangles = collectFaceTriangles(face.root, face.loader, faceAtlasTexId, attachMatrix, args.compose);
    const triangleTransfer = buildTriangleTransferMatches(bodyTriangles, faceTriangles);
    const nearestMatches = bodyCandidates.map((candidate) => {
        const best = nearestReference(candidate, faceReferences, args.normalWeight);
        return {
            mesh: candidate.mesh,
            parent: candidate.parent,
            vertex: candidate.vertex,
            position: candidate.position,
            sourcePos: candidate.sourcePos,
            currentUv: candidate.currentUv,
            transferredUv: best?.ref?.uv || null,
            reference: best ? {
                mesh: best.ref.mesh,
                node: best.ref.node,
                vertex: best.ref.vertex,
                position: best.ref.position,
                distance: best.distance,
                normalDot: best.dot,
                score: best.score,
            } : null,
            good: best ? best.distance <= args.maxDistance : false,
        };
    });
    const matches = args.matchMode === "triangle"
        ? triangleTransfer.matches
        : nearestMatches;

    const goodMatches = matches.filter((match) => match.good);
    const report = {
        body: path.relative(repoRoot, bodyPath),
        face: path.relative(repoRoot, facePath),
        attachNode: `0x${args.attachNode.toString(16)}`,
        compose: args.compose,
        matchMode: args.matchMode,
        maxDistance: args.maxDistance,
        normalWeight: args.normalWeight,
        texture: HEAD_ATLAS_HEX,
        bodyAtlasTextureIndex: bodyAtlasTexId,
        faceAtlasTextureIndex: faceAtlasTexId,
        counts: {
            bodyFaceCandidates: bodyCandidates.length,
            faceReferences: faceReferences.length,
            bodyTriangles: bodyTriangles.length,
            faceTriangles: faceTriangles.length,
            matchedTriangles: triangleTransfer.matchedTriangles,
            conflictedTriangleAssignments: triangleTransfer.conflictedAssignments,
            matched: matches.length,
            good: goodMatches.length,
            goodRatio: matches.length ? goodMatches.length / matches.length : 0,
        },
        distance: stats(matches.map((match) => match.reference?.distance)),
        normalDot: stats(matches.map((match) => match.reference?.normalDot)),
        currentUv: range2(matches, "currentUv"),
        transferredUv: range2(matches, "transferredUv"),
        goodTransferredUv: range2(goodMatches, "transferredUv"),
        matches,
        worst: matches
            .slice()
            .sort((a, b) => (b.reference?.distance || 0) - (a.reference?.distance || 0))
            .slice(0, 16),
        samples: matches.slice(0, 32),
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!args.quiet) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(JSON.stringify({
            out: path.relative(repoRoot, outPath),
            body: report.body,
            face: report.face,
            compose: report.compose,
            matchMode: report.matchMode,
            counts: report.counts,
            distance: report.distance,
            transferredUv: report.transferredUv,
        }, null, 2));
    }
    engine.dispose();
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
