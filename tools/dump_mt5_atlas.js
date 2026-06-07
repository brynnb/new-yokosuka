#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TEXTURE_HEX = "a64b425f4b414a5f";

function usage() {
    console.error([
        "Usage: node tools/dump_mt5_atlas.js <model.MT5> [--texture HEX|INDEX] [--json] [--limit N] [--vertices]",
        "",
        `Default --texture is ${DEFAULT_TEXTURE_HEX} (Ryo YKB_KAJ face/side-head atlas).`,
    ].join("\n"));
}

function parseArgs(argv) {
    const args = {
        file: null,
        texture: DEFAULT_TEXTURE_HEX,
        json: false,
        limit: 40,
        vertices: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--texture") {
            args.texture = argv[++i] || "";
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--vertices") {
            args.vertices = true;
        } else if (arg === "--limit") {
            args.limit = Number.parseInt(argv[++i] || "40", 10);
        } else if (!args.file) {
            args.file = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.file) {
        usage();
        process.exit(2);
    }
    if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 40;
    args.texture = String(args.texture || "").toLowerCase().replace(/^0x/, "");
    return args;
}

function openBuffer(file) {
    const bytes = fs.readFileSync(file);
    return {
        bytes,
        view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    };
}

function reader(buffer) {
    const { bytes, view } = buffer;
    return {
        size: bytes.byteLength,
        u16: (offset) => view.getUint16(offset, true),
        i16: (offset) => view.getInt16(offset, true),
        u32: (offset) => view.getUint32(offset, true),
        i32: (offset) => view.getInt32(offset, true),
        f32: (offset) => view.getFloat32(offset, true),
        hex: (offset, length) => Array.from(bytes.subarray(offset, offset + length))
            .map((value) => value.toString(16).padStart(2, "0"))
            .join(""),
    };
}

function fourcc(value) {
    return String.fromCharCode(
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff,
        (value >> 24) & 0xff,
    );
}

function rowMultiply(left, right) {
    const result = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            for (let i = 0; i < 4; i++) {
                result[row * 4 + col] += left[row * 4 + i] * right[i * 4 + col];
            }
        }
    }
    return result;
}

function rowScale(x, y, z) {
    return [
        x, 0, 0, 0,
        0, y, 0, 0,
        0, 0, z, 0,
        0, 0, 0, 1,
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

function rowTranslation(x, y, z) {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1,
    ];
}

function transformRowPoint(point, matrix) {
    const [x, y, z] = point;
    return [
        x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12],
        x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13],
        x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14],
    ];
}

function transformRowVector(vector, matrix) {
    const [x, y, z] = vector;
    return [
        x * matrix[0] + y * matrix[4] + z * matrix[8],
        x * matrix[1] + y * matrix[5] + z * matrix[9],
        x * matrix[2] + y * matrix[6] + z * matrix[10],
    ];
}

function sourceTransformMatrix(node) {
    return rowMultiply(
        rowMultiply(
            rowMultiply(
                rowMultiply(
                    rowScale(node.scale[0], node.scale[1], node.scale[2]),
                    rowRotationX(node.rotationRadians[0]),
                ),
                rowRotationY(node.rotationRadians[1]),
            ),
            rowRotationZ(node.rotationRadians[2]),
        ),
        rowTranslation(node.position[0], node.position[1], node.position[2]),
    );
}

function inverseSourceTransformMatrix(node) {
    return rowMultiply(
        rowMultiply(
            rowMultiply(
                rowMultiply(
                    rowTranslation(-node.position[0], -node.position[1], -node.position[2]),
                    rowRotationZ(-node.rotationRadians[2]),
                ),
                rowRotationY(-node.rotationRadians[1]),
            ),
            rowRotationX(-node.rotationRadians[0]),
        ),
        rowScale(
            node.scale[0] === 0 ? 1 : 1 / node.scale[0],
            node.scale[1] === 0 ? 1 : 1 / node.scale[1],
            node.scale[2] === 0 ? 1 : 1 / node.scale[2],
        ),
    );
}

function sourceWorldMatrixForNode(node, nodesByOffset, cache = new Map()) {
    if (cache.has(node.offset)) return cache.get(node.offset);
    const local = sourceTransformMatrix(node);
    const parent = nodesByOffset.get(node.parentOffset);
    const world = parent
        ? rowMultiply(local, sourceWorldMatrixForNode(parent, nodesByOffset, cache))
        : local;
    cache.set(node.offset, world);
    return world;
}

function hasUv(type) {
    return type === 0x11 || type === 0x14 || type === 0x19 || type === 0x1c;
}

function hasColor(type) {
    return type === 0x12 || type === 0x14 || type === 0x1a || type === 0x1c;
}

function isPcLengthPrefixedStripType(type) {
    return (type >= 0x10 && type <= 0x14) || (type >= 0x18 && type <= 0x1c);
}

function parseTextures(r) {
    const textureOffset = r.u32(4);
    const textures = [];
    if (!textureOffset || textureOffset >= r.size - 12) return textures;

    const headerSize = r.u32(textureOffset + 4);
    const textureCount = r.u32(textureOffset + 8);
    let offset = textureOffset + headerSize;

    for (let nodeIndex = 0; nodeIndex < 256 && offset < r.size - 8 && textures.length < textureCount; nodeIndex++) {
        const nodeOffset = offset;
        const identifier = fourcc(r.u32(offset));
        const nodeSize = r.u32(offset + 4);
        if (!nodeSize) break;

        if (identifier === "TEXN") {
            textures.push(r.hex(offset + 8, 8));
        } else if (identifier === "NAME") {
            let pos = offset + 8;
            while (pos < nodeOffset + nodeSize && textures.length < textureCount) {
                textures.push(r.hex(pos, 8));
                pos += 8;
            }
        }

        offset = nodeOffset + nodeSize;
    }

    return textures;
}

function parseNodes(r) {
    const firstNodeOffset = r.u32(8);
    const nodes = [];
    const seen = new Set();

    function parseNode(offset, parentOffset = 0) {
        if (!offset || offset >= r.size - 64 || seen.has(offset)) return;
        seen.add(offset);

        const node = {
            offset,
            parentOffset,
            id: r.u32(offset),
            boneId: r.u32(offset) & 0xff,
            meshOffset: r.u32(offset + 4),
            rotationRadians: [
                2 * Math.PI * r.i32(offset + 8) / 65536,
                2 * Math.PI * r.i32(offset + 12) / 65536,
                2 * Math.PI * r.i32(offset + 16) / 65536,
            ],
            rotationDegrees: [
                360 * r.i32(offset + 8) / 65536,
                360 * r.i32(offset + 12) / 65536,
                360 * r.i32(offset + 16) / 65536,
            ],
            scale: [r.f32(offset + 20), r.f32(offset + 24), r.f32(offset + 28)],
            position: [r.f32(offset + 32), r.f32(offset + 36), r.f32(offset + 40)],
            childOffset: r.u32(offset + 44),
            siblingOffset: r.u32(offset + 48),
            parentPointer: r.u32(offset + 52),
            objectName: r.u32(offset + 56),
            unknown: r.u32(offset + 60),
        };

        nodes.push(node);
        parseNode(node.childOffset, offset);
        parseNode(node.siblingOffset, parentOffset);
    }

    parseNode(firstNodeOffset, 0);
    return nodes;
}

function readMeshInfo(r, node) {
    if (!node.meshOffset || node.meshOffset >= r.size - 32) return null;
    const meshOffset = node.meshOffset;
    const vertexOffset = r.u32(meshOffset + 4);
    const vertexCount = r.i32(meshOffset + 8);
    const facesOffset = r.u32(meshOffset + 12);
    const vertices = [];

    if (vertexOffset && vertexOffset < r.size - 24 && vertexCount > 0) {
        for (let i = 0; i < vertexCount && vertexOffset + i * 24 + 24 <= r.size; i++) {
            const offset = vertexOffset + i * 24;
            vertices.push({
                sourcePos: [r.f32(offset), r.f32(offset + 4), r.f32(offset + 8)],
                sourceNorm: [r.f32(offset + 12), r.f32(offset + 16), r.f32(offset + 20)],
            });
        }
    }

    return {
        meshOffset,
        vertexOffset,
        vertexCount,
        facesOffset,
        vertices,
    };
}

function stats3() {
    return {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        sum: [0, 0, 0],
        count: 0,
    };
}

function addStats3(stats, values) {
    if (!values || values.length !== 3 || values.some((value) => !Number.isFinite(value))) return;
    for (let i = 0; i < 3; i++) {
        stats.min[i] = Math.min(stats.min[i], values[i]);
        stats.max[i] = Math.max(stats.max[i], values[i]);
        stats.sum[i] += values[i];
    }
    stats.count++;
}

function finishStats3(stats) {
    if (stats.count === 0) return null;
    return {
        min: stats.min,
        max: stats.max,
        avg: stats.sum.map((value) => value / stats.count),
    };
}

function stats2() {
    return {
        min: [Infinity, Infinity],
        max: [-Infinity, -Infinity],
        sum: [0, 0],
        count: 0,
    };
}

function addStats2(stats, values) {
    if (!values || values.length !== 2 || values.some((value) => !Number.isFinite(value))) return;
    for (let i = 0; i < 2; i++) {
        stats.min[i] = Math.min(stats.min[i], values[i]);
        stats.max[i] = Math.max(stats.max[i], values[i]);
        stats.sum[i] += values[i];
    }
    stats.count++;
}

function finishStats2(stats) {
    if (stats.count === 0) return null;
    return {
        min: stats.min,
        max: stats.max,
        avg: stats.sum.map((value) => value / stats.count),
    };
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function classifyRyoHeadAtlasStrip(sourcePos, sourceNorm) {
    const pos = sourcePos?.avg;
    const norm = sourceNorm?.avg;
    if (!pos || !norm) return "unknown";

    const [x, y, z] = pos;
    const [nx, ny, nz] = norm;
    if (
        x >= 0.045 &&
        Math.abs(y) <= 0.085 &&
        z >= 0.02 &&
        z <= 0.23 &&
        nx >= 0.18 &&
        Math.abs(ny) <= 0.85 &&
        Math.abs(nz) <= 0.85
    ) {
        return "face";
    }

    return "side";
}

function projectRyoFaceAtlasUv(renderPos) {
    if (!renderPos) return null;
    const renderX = renderPos[0];
    const renderY = renderPos[1];
    const minX = -0.108;
    const maxX = 0.108;
    const minY = 0.359;
    const maxY = 0.649;

    return [
        clamp01((renderX - minX) / (maxX - minX)),
        clamp01((renderY - minY) / (maxY - minY)),
    ];
}

function finalProjectCwAtlasUv(vertex, atlasRegion) {
    if (atlasRegion === "face") {
        const projected = projectRyoFaceAtlasUv(vertex.renderPos);
        if (!projected) return null;
        return [
            0.5 + projected[1] * 0.5,
            1.0 - projected[0],
        ];
    }

    if (atlasRegion === "side") {
        let texU = vertex.uv[1] * 0.5;
        if ((vertex.sourcePos?.[1] || 0) < 0) texU = 0.5 - texU;
        return [texU, vertex.uv[0]];
    }

    return null;
}

function stripDebugColor(nodeOffset, entryOffset, stripIndex) {
    const key = (
        Math.imul(nodeOffset, 1103515245) ^
        Math.imul(entryOffset, 2246822519) ^
        Math.imul(stripIndex, 2654435761)
    ) >>> 0;
    const rgb = [
        0.25 + ((key & 0xff) / 255) * 0.7,
        0.25 + (((key >> 8) & 0xff) / 255) * 0.7,
        0.25 + (((key >> 16) & 0xff) / 255) * 0.7,
    ].map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
    return {
        rgb,
        hex: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    };
}

function convertUv(rawU, rawV, state) {
    let u = rawU;
    let v = rawV;

    if (state.isUvHigh) {
        u *= 0.000015258789;
        v *= 0.000015258789;
    } else {
        u = Math.abs(u) < 0xf000 ? u / state.uvSize : u * 0.00000000023283064;
        v = Math.abs(v) < 0xf000 ? v / state.uvSize : v * 0.00000000023283064;
    }

    if (state.mirrorU && Math.abs(u) > 1.0) u /= 2.0;
    if (state.mirrorV && Math.abs(v) > 1.0) v /= 2.0;

    return [u, v];
}

function parseMeshStrips(r, node, textureIndex, nodesByOffset, options = {}) {
    const mesh = node.mesh;
    if (!mesh) return [];

    const { meshOffset, facesOffset, vertexOffset, vertexCount } = mesh;
    const parentNode = nodesByOffset.get(node.parentOffset);
    const parentMesh = parentNode?.mesh || null;
    const inverseLocalMatrix = inverseSourceTransformMatrix(node);
    const worldMatrix = sourceWorldMatrixForNode(node, nodesByOffset);
    const rows = [];
    let offset = facesOffset;
    let guard = 0;
    const state = {
        textureIndex: 0,
        isUvHigh: false,
        mirrorU: false,
        mirrorV: false,
        // PC Shenmue.exe FUN_140065160 initializes this to 0x100 before
        // opcode 0x0b can override it.
        uvSize: 256,
        attrType: null,
        attrHex: "",
        fixedState0008: null,
        fixedState000a: null,
    };

    while (offset < r.size - 2 && guard++ < 10000) {
        const entryOffset = offset;
        const type = r.u16(offset);
        offset += 2;

        if (type === 0x8000) break;
        if (type === 0x0000 || type === 0xffff) continue;

        if (type >= 0x0002 && type <= 0x0007) {
            const size = r.u16(offset);
            offset += 2;
            state.attrType = type;
            state.attrHex = r.hex(offset, size);
            const data = Buffer.from(state.attrHex, "hex");
            state.isUvHigh = data.length >= 1 && (data[0] & 1) === 1;
            state.mirrorU = data.length >= 11 && (data[10] & 4) === 4;
            state.mirrorV = data.length >= 11 && (data[10] & 2) === 2;
            offset += size;
            continue;
        }

        if (type === 0x0009) {
            state.textureIndex = r.u16(offset);
            offset += 2;
            continue;
        }

        if (type === 0x000b) {
            state.uvSize = r.u16(offset) || state.uvSize;
            offset += 2;
            continue;
        }

        if (type === 0x0008 || type === 0x000a) {
            const value = r.u16(offset);
            if (type === 0x0008) {
                state.fixedState0008 = value;
            } else {
                state.fixedState000a = value;
            }
            offset += 2;
            continue;
        }

        if (type >= 0x000c && type <= 0x000f) {
            const size = r.u16(offset);
            offset += 2 + size;
            continue;
        }

        if (type === 0x0015 || type === 0x001d) {
            const size = r.u16(offset);
            offset += 2 + size;
            continue;
        }

        if (isPcLengthPrefixedStripType(type)) {
            const entryLengthBytes = r.u16(offset);
            const stripCount = r.u16(offset + 2);
            const expectedEntryEnd = entryOffset + 4 + entryLengthBytes;
            offset += 4;
            const usesUv = hasUv(type);
            const usesColor = hasColor(type);
            const pendingRows = [];

            for (let stripIndex = 0; stripIndex < stripCount; stripIndex++) {
                const stripLengthRaw = r.i16(offset);
                offset += 2;
                const stripLength = Math.abs(stripLengthRaw);
                const uv = {
                    minU: Infinity,
                    maxU: -Infinity,
                    minV: Infinity,
                    maxV: -Infinity,
                    sumU: 0,
                    sumV: 0,
                    minRawU: Infinity,
                    maxRawU: -Infinity,
                    minRawV: Infinity,
                    maxRawV: -Infinity,
                    count: 0,
                };
                const sourcePosStats = stats3();
                const sourceNormStats = stats3();
                const renderPosStats = stats3();
                const renderNormStats = stats3();
                const vertices = [];

                for (let i = 0; i < stripLength; i++) {
                    const rawIndex = r.i16(offset);
                    offset += 2;
                    let vertex = rawIndex >= 0 ? mesh.vertices[rawIndex] : null;
                    if (rawIndex < 0 && parentMesh) {
                        const parentIndex = parentMesh.vertexCount + rawIndex;
                        const parentVertex = parentMesh.vertices[parentIndex];
                        if (parentVertex) {
                            vertex = {
                                sourcePos: transformRowPoint(parentVertex.sourcePos, inverseLocalMatrix),
                                sourceNorm: transformRowVector(parentVertex.sourceNorm, inverseLocalMatrix),
                            };
                        }
                    }

                    let sourcePos = null;
                    let sourceNorm = null;
                    let renderPos = null;
                    let renderNorm = null;
                    if (vertex) {
                        const worldPos = transformRowPoint(vertex.sourcePos, worldMatrix);
                        const worldNorm = transformRowVector(vertex.sourceNorm, worldMatrix);
                        sourcePos = vertex.sourcePos;
                        sourceNorm = vertex.sourceNorm;
                        renderPos = [-worldPos[0], worldPos[1], worldPos[2]];
                        renderNorm = [-worldNorm[0], worldNorm[1], worldNorm[2]];
                        addStats3(sourcePosStats, sourcePos);
                        addStats3(sourceNormStats, sourceNorm);
                        addStats3(renderPosStats, renderPos);
                        addStats3(renderNormStats, renderNorm);
                    }

                    let rawU = null;
                    let rawV = null;
                    let convertedUv = null;
                    if (usesUv) {
                        rawU = r.i16(offset);
                        rawV = r.i16(offset + 2);
                        offset += 4;
                        const [u, v] = convertUv(rawU, rawV, state);
                        convertedUv = [u, v];
                        uv.minU = Math.min(uv.minU, u);
                        uv.maxU = Math.max(uv.maxU, u);
                        uv.minV = Math.min(uv.minV, v);
                        uv.maxV = Math.max(uv.maxV, v);
                        uv.sumU += u;
                        uv.sumV += v;
                        uv.minRawU = Math.min(uv.minRawU, rawU);
                        uv.maxRawU = Math.max(uv.maxRawU, rawU);
                        uv.minRawV = Math.min(uv.minRawV, rawV);
                        uv.maxRawV = Math.max(uv.maxRawV, rawV);
                        uv.count++;
                    }
                    if (usesColor) offset += 4;

                    vertices.push({
                        rawIndex,
                        sourcePos,
                        sourceNorm,
                        renderPos,
                        renderNorm,
                        rawUv: rawU === null || rawV === null ? null : [rawU, rawV],
                        uv: convertedUv,
                    });
                }

                if (state.textureIndex === textureIndex) {
                    const sourcePos = finishStats3(sourcePosStats);
                    const sourceNorm = finishStats3(sourceNormStats);
                    const renderPos = finishStats3(renderPosStats);
                    const renderNorm = finishStats3(renderNormStats);
                    const atlasRegion = classifyRyoHeadAtlasStrip(sourcePos, sourceNorm);
                    const projectedFaceUvStats = stats2();
                    const finalProjectCwAtlasUvStats = stats2();
                    for (const vertex of vertices) {
                        addStats2(projectedFaceUvStats, projectRyoFaceAtlasUv(vertex.renderPos));
                        addStats2(finalProjectCwAtlasUvStats, vertex.uv ? finalProjectCwAtlasUv(vertex, atlasRegion) : null);
                    }

                    pendingRows.push({
                        nodeOffset: node.offset,
                        boneId: node.boneId,
                        meshOffset,
                        vertexOffset,
                        vertexCount,
                        entryOffset,
                        entryLengthBytes,
                        type,
                        stripIndex,
                        stripDebugColor: stripDebugColor(node.offset, entryOffset, stripIndex),
                        stripLengthRaw,
                        stripLength,
                        flipFirstTriangle: stripLengthRaw < 0,
                        isUvHigh: state.isUvHigh,
                        mirrorU: state.mirrorU,
                        mirrorV: state.mirrorV,
                        uvSize: state.uvSize,
                        attrType: state.attrType,
                        attrHex: state.attrHex,
                        fixedState0008: state.fixedState0008,
                        fixedState000a: state.fixedState000a,
                        atlasRegion,
                        uv: uv.count > 0 ? {
                            minU: uv.minU,
                            maxU: uv.maxU,
                            minV: uv.minV,
                            maxV: uv.maxV,
                            avgU: uv.sumU / uv.count,
                            avgV: uv.sumV / uv.count,
                            minRawU: uv.minRawU,
                            maxRawU: uv.maxRawU,
                            minRawV: uv.minRawV,
                            maxRawV: uv.maxRawV,
                        } : null,
                        sourcePos,
                        sourceNorm,
                        renderPos,
                        renderNorm,
                        projectedFaceUv: finishStats2(projectedFaceUvStats),
                        finalProjectCwAtlasUv: finishStats2(finalProjectCwAtlasUvStats),
                        vertices: options.vertices ? vertices.map((vertex) => ({
                            ...vertex,
                            projectedFaceUv: projectRyoFaceAtlasUv(vertex.renderPos),
                            finalProjectCwAtlasUv: vertex.uv ? finalProjectCwAtlasUv(vertex, atlasRegion) : null,
                        })) : undefined,
                    });
                }
            }
            const entryParsedBytes = offset - entryOffset;
            let entryPaddingBytes = 0;
            const entryOverrunBytes = Math.max(0, offset - expectedEntryEnd);
            if (offset < expectedEntryEnd && expectedEntryEnd <= r.size) {
                entryPaddingBytes = expectedEntryEnd - offset;
                offset = expectedEntryEnd;
            }
            const entryConsumedBytes = offset - entryOffset;
            const entryLengthMatchesPcSkip = expectedEntryEnd <= r.size && entryOverrunBytes === 0 && offset === expectedEntryEnd;
            for (const row of pendingRows) {
                row.entryParsedBytes = entryParsedBytes;
                row.entryPaddingBytes = entryPaddingBytes;
                row.entryOverrunBytes = entryOverrunBytes;
                row.entryConsumedBytes = entryConsumedBytes;
                row.entryLengthMatchesPcSkip = entryLengthMatchesPcSkip;
                rows.push(row);
            }
            continue;
        }

        throw new Error(`Unknown MT5 mesh entry 0x${type.toString(16)} at 0x${entryOffset.toString(16)}`);
    }

    return rows;
}

function formatHex(value) {
    return `0x${value.toString(16)}`;
}

function range(min, max, digits = 3) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return "n/a";
    return `${min.toFixed(digits)}..${max.toFixed(digits)}`;
}

function range3(stats, digits = 3) {
    if (!stats) return "n/a";
    return stats.min.map((min, i) => `${min.toFixed(digits)}..${stats.max[i].toFixed(digits)}`).join("/");
}

function summarize(rows) {
    const attrGroups = new Map();
    const nodeGroups = new Map();
    const regionGroups = new Map();
    let pcLengthMismatchCount = 0;
    let pcPaddingRowCount = 0;

    for (const row of rows) {
        const attrKey = [
            `attr=${row.attrType === null ? "none" : formatHex(row.attrType)}`,
            `data=${row.attrHex}`,
            `uvh=${row.isUvHigh}`,
            `mirrorU=${row.mirrorU}`,
            `mirrorV=${row.mirrorV}`,
            `uvSize=${row.uvSize}`,
            `s8=${row.fixedState0008 === null ? "none" : formatHex(row.fixedState0008)}`,
            `sA=${row.fixedState000a === null ? "none" : formatHex(row.fixedState000a)}`,
        ].join(" ");
        attrGroups.set(attrKey, (attrGroups.get(attrKey) || 0) + 1);

        const nodeKey = formatHex(row.nodeOffset);
        if (!nodeGroups.has(nodeKey)) nodeGroups.set(nodeKey, []);
        nodeGroups.get(nodeKey).push(row);

        regionGroups.set(row.atlasRegion, (regionGroups.get(row.atlasRegion) || 0) + 1);
        if (row.entryLengthMatchesPcSkip === false) pcLengthMismatchCount++;
        if ((row.entryPaddingBytes || 0) > 0) pcPaddingRowCount++;
    }

    return { attrGroups, nodeGroups, regionGroups, pcLengthMismatchCount, pcPaddingRowCount };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const buffer = openBuffer(args.file);
    const r = reader(buffer);
    const textures = parseTextures(r);
    const textureIndex = /^\d+$/.test(args.texture)
        ? Number.parseInt(args.texture, 10)
        : textures.findIndex((hex) => hex === args.texture);

    if (textureIndex < 0 || textureIndex >= textures.length) {
        console.error(`Texture ${args.texture} not found in ${args.file}`);
        console.error(textures.map((hex, index) => `${index}:${hex}`).join(" "));
        process.exit(1);
    }

    const nodes = parseNodes(r);
    for (const node of nodes) {
        node.mesh = readMeshInfo(r, node);
    }
    const nodesByOffset = new Map(nodes.map((node) => [node.offset, node]));
    const rows = nodes.flatMap((node) => parseMeshStrips(r, node, textureIndex, nodesByOffset, {
        vertices: args.vertices,
    }));
    const output = {
        file: path.resolve(args.file),
        textureIndex,
        textureHex: textures[textureIndex],
        textureCount: textures.length,
        textures,
        nodeCount: nodes.length,
        stripCount: rows.length,
        pcLengthMismatchCount: rows.filter((row) => row.entryLengthMatchesPcSkip === false).length,
        pcPaddingRowCount: rows.filter((row) => (row.entryPaddingBytes || 0) > 0).length,
        vertexCount: rows.reduce((sum, row) => sum + row.stripLength, 0),
        rows: rows.map((row) => {
            if (args.vertices) return row;
            const { vertices, ...withoutVertices } = row;
            return withoutVertices;
        }),
    };

    if (args.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
    }

    const { attrGroups, nodeGroups, regionGroups, pcLengthMismatchCount, pcPaddingRowCount } = summarize(rows);
    console.log(`MT5: ${path.resolve(args.file)}`);
    console.log(`texture ${textureIndex}: ${textures[textureIndex]}`);
    console.log(`${nodes.length} nodes, ${rows.length} matching strips, ${output.vertexCount} strip vertices`);
    console.log(`PC length-check mismatches: ${pcLengthMismatchCount} (padding rows: ${pcPaddingRowCount})`);
    console.log("");
    console.log("Atlas regions:");
    for (const [region, count] of regionGroups) {
        console.log(`  ${String(count).padStart(4, " ")}  ${region}`);
    }
    console.log("");
    console.log("Attribute groups:");
    for (const [key, count] of attrGroups) {
        console.log(`  ${String(count).padStart(4, " ")}  ${key}`);
    }
    console.log("");
    console.log("Nodes:");
    for (const [nodeOffset, groupRows] of nodeGroups) {
        const minU = Math.min(...groupRows.map((row) => row.uv?.minU ?? Infinity));
        const maxU = Math.max(...groupRows.map((row) => row.uv?.maxU ?? -Infinity));
        const minV = Math.min(...groupRows.map((row) => row.uv?.minV ?? Infinity));
        const maxV = Math.max(...groupRows.map((row) => row.uv?.maxV ?? -Infinity));
        const vertices = groupRows.reduce((sum, row) => sum + row.stripLength, 0);
        const attrs = [...new Set(groupRows.map((row) => row.attrHex || "none"))].join(",");
        console.log(`  ${nodeOffset}  strips=${String(groupRows.length).padStart(3, " ")} vertices=${String(vertices).padStart(4, " ")} uv=${range(minU, maxU)}/${range(minV, maxV)} attrs=${attrs}`);
    }

    if (args.limit > 0) {
        console.log("");
        console.log(`Rows (first ${Math.min(args.limit, rows.length)}):`);
        for (const row of rows.slice(0, args.limit)) {
            const uv = row.uv;
            console.log([
                formatHex(row.nodeOffset),
                formatHex(row.entryOffset),
                `type=${formatHex(row.type)}`,
                `entryLen=${row.entryLengthBytes}`,
                `pcLenOk=${row.entryLengthMatchesPcSkip}`,
                `pad=${row.entryPaddingBytes || 0}`,
                `len=${row.stripLengthRaw}`,
                `flip=${row.flipFirstTriangle}`,
                `uvh=${row.isUvHigh}`,
                `mu=${row.mirrorU}`,
                `mv=${row.mirrorV}`,
                `uvSize=${row.uvSize}`,
                uv ? `rawU=${range(uv.minRawU, uv.maxRawU, 0)}` : "rawU=n/a",
                uv ? `rawV=${range(uv.minRawV, uv.maxRawV, 0)}` : "rawV=n/a",
                uv ? `u=${range(uv.minU, uv.maxU)}` : "u=n/a",
                uv ? `v=${range(uv.minV, uv.maxV)}` : "v=n/a",
                `region=${row.atlasRegion}`,
                row.finalProjectCwAtlasUv ? `atlasU=${range(row.finalProjectCwAtlasUv.min[0], row.finalProjectCwAtlasUv.max[0])}` : "atlasU=n/a",
                row.finalProjectCwAtlasUv ? `atlasV=${range(row.finalProjectCwAtlasUv.min[1], row.finalProjectCwAtlasUv.max[1])}` : "atlasV=n/a",
                `pos=${range3(row.renderPos)}`,
                `norm=${row.renderNorm?.avg.map((value) => value.toFixed(2)).join(",") || "n/a"}`,
                `attr=${row.attrHex}`,
            ].join(" "));
        }
    }
}

main();
