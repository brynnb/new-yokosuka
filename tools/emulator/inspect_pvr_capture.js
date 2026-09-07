#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const captureRoot = path.join(repoRoot, "captures", "pvr");

function fail(message) {
    throw new Error(message);
}

function latestCapture() {
    if (!fs.existsSync(captureRoot)) {
        fail(`Capture directory does not exist: ${captureRoot}`);
    }
    const directories = fs.readdirSync(captureRoot)
        .map((name) => path.join(captureRoot, name))
        .filter((entry) => fs.statSync(entry).isDirectory())
        .sort();
    if (directories.length === 0) {
        fail(`No captures found under ${captureRoot}`);
    }
    return directories.at(-1);
}

function hashFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function requireFile(file, expectedSize) {
    if (!fs.existsSync(file)) {
        fail(`Missing capture file: ${file}`);
    }
    const size = fs.statSync(file).size;
    if (expectedSize !== undefined && size !== expectedSize) {
        fail(`${path.basename(file)} is ${size} bytes; expected ${expectedSize}`);
    }
    return { size, sha256: hashFile(file) };
}

function finitePair(pair) {
    return Array.isArray(pair)
        && pair.length === 2
        && pair.every((value) => value === null || Number.isFinite(value));
}

function inspect(captureDirectory) {
    const manifestPath = path.join(captureDirectory, "frame.json");
    const frame = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (frame.schema !== "flycast-pvr-frame-v2") {
        fail(`Unsupported capture schema: ${frame.schema}`);
    }

    const vertices = frame.vertices;
    const indices = frame.indices;
    if (!Array.isArray(vertices) || !Array.isArray(indices)) {
        fail("Manifest has no vertex/index arrays");
    }
    for (const [index, vertex] of vertices.entries()) {
        if (vertex.index !== index || !finitePair(vertex.uv) || !finitePair(vertex.uv1)) {
            fail(`Malformed vertex ${index}`);
        }
    }
    for (const [offset, index] of indices.entries()) {
        if (index !== 0xffffffff && (!Number.isInteger(index) || index < 0 || index >= vertices.length)) {
            fail(`Index ${offset} references invalid vertex ${index}`);
        }
    }

    const textureUsage = new Map();
    let polygonCount = 0;
    let texturedPolygonCount = 0;
    for (const [listName, polygons] of Object.entries(frame.polygonLists)) {
        for (const polygon of polygons) {
            polygonCount += 1;
            const end = polygon.firstIndex + polygon.indexCount;
            if (polygon.firstIndex < 0 || polygon.indexCount < 0 || end > indices.length) {
                fail(`${listName} polygon ${polygon.polygonIndex} has invalid index range`);
            }
            if (polygon.texture === null) {
                continue;
            }
            texturedPolygonCount += 1;

            const address = polygon.texture.vramAddress;
            let usage = textureUsage.get(address);
            if (usage === undefined) {
                usage = {
                    address,
                    width: polygon.texture.width,
                    height: polygon.texture.height,
                    pixelFormat: polygon.texture.pixelFormat,
                    polygons: 0,
                    referencedVertices: new Set(),
                    uvMin: [Infinity, Infinity],
                    uvMax: [-Infinity, -Infinity],
                    states: new Set(),
                };
                textureUsage.set(address, usage);
            }
            usage.polygons += 1;
            usage.states.add(
                `${polygon.pcw.toString(16)}:${polygon.isp.toString(16)}:`
                + `${polygon.tsp.toString(16)}:${polygon.tcw.toString(16)}`,
            );
            for (const vertexIndex of indices.slice(polygon.firstIndex, end)) {
                if (vertexIndex === 0xffffffff) {
                    continue;
                }
                usage.referencedVertices.add(vertexIndex);
                const uv = vertices[vertexIndex].uv;
                if (uv[0] !== null) {
                    usage.uvMin[0] = Math.min(usage.uvMin[0], uv[0]);
                    usage.uvMax[0] = Math.max(usage.uvMax[0], uv[0]);
                }
                if (uv[1] !== null) {
                    usage.uvMin[1] = Math.min(usage.uvMin[1], uv[1]);
                    usage.uvMax[1] = Math.max(usage.uvMax[1], uv[1]);
                }
            }
        }
    }

    const files = {
        manifest: requireFile(manifestPath),
        vram: requireFile(path.join(captureDirectory, "vram.bin"), frame.vramSize),
        pvrRegisters: requireFile(
            path.join(captureDirectory, "pvr-registers.bin"),
            frame.pvrRegisterSize,
        ),
        taCommands: frame.taCommandPasses.map((pass) => ({
            file: pass.file,
            ...requireFile(path.join(captureDirectory, pass.file), pass.size),
        })),
    };

    const textures = [...textureUsage.values()]
        .sort((a, b) => a.address - b.address)
        .map((usage) => ({
            address: usage.address,
            addressHex: `0x${usage.address.toString(16).padStart(6, "0")}`,
            dimensions: [usage.width, usage.height],
            pixelFormat: usage.pixelFormat,
            polygons: usage.polygons,
            referencedVertices: usage.referencedVertices.size,
            uvMin: usage.uvMin.map((value) => Number.isFinite(value) ? value : null),
            uvMax: usage.uvMax.map((value) => Number.isFinite(value) ? value : null),
            distinctRenderStates: usage.states.size,
        }));

    return {
        captureDirectory,
        frameCount: frame.frameCount,
        framebuffer: [frame.framebufferWidth, frame.framebufferHeight],
        vertices: vertices.length,
        indices: indices.length,
        primitiveRestarts: indices.filter((index) => index === 0xffffffff).length,
        polygons: polygonCount,
        texturedPolygons: texturedPolygonCount,
        uniqueTextures: textures.length,
        renderPasses: frame.renderPasses.length,
        sortedTriangles: frame.sortedTriangles.length,
        files,
        textures,
    };
}

try {
    const requested = process.argv[2];
    const captureDirectory = requested
        ? path.resolve(requested)
        : latestCapture();
    console.log(JSON.stringify(inspect(captureDirectory), null, 2));
} catch (error) {
    console.error(`PVR capture inspection failed: ${error.message}`);
    process.exitCode = 1;
}
