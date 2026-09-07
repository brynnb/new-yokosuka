#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { PvrDecoder } from "../../src/PvrDecoder.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CAPTURE = "captures/pvr/20260722-223647-frame-27245";
const DEFAULT_PVR = "public/wudecon-obj/ryo/tex_5f4a414b5f424ba6.pvr";
const HEAD_TEXTURE_HEX = "a64b425f4b414a5f";
const EXPECTED_RGBA_SHA256 = "aa57162ab39aee0d9114ea8e373c11947bd7f4e0851ce3119dfc735f31ba81f0";

const captureDir = path.resolve(repoRoot, process.argv[2] || DEFAULT_CAPTURE);
const pvrPath = path.resolve(repoRoot, process.argv[3] || DEFAULT_PVR);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function exactArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function decodeTsp(full) {
    return {
        texV: full & 7,
        texU: (full >>> 3) & 7,
        filterMode: (full >>> 13) & 3,
        clampV: Boolean((full >>> 15) & 1),
        clampU: Boolean((full >>> 16) & 1),
        flipV: Boolean((full >>> 17) & 1),
        flipU: Boolean((full >>> 18) & 1),
        ignoreTextureAlpha: Boolean((full >>> 19) & 1),
        useAlpha: Boolean((full >>> 20) & 1),
    };
}

const pvrBytes = fs.readFileSync(pvrPath);
const decoded = new PvrDecoder(exactArrayBuffer(pvrBytes)).decodePixels();
assert(decoded, "PVR decoder returned no pixels");
assert(decoded.width === 256 && decoded.height === 128, "Expected a 256x128 Ryo atlas");
assert(decoded.colorFormat === 0, "Expected ARGB1555 color format");
assert(decoded.dataFormat === 0x0d, "Expected TWIDDLED_RECT data format");
assert(
    PvrDecoder.twiddledSourceIndex(1, 0, 256, 128, true) === 2,
    "TWIDDLED_RECT must place X in the high/odd Morton bits",
);
assert(
    PvrDecoder.twiddledSourceIndex(0, 1, 256, 128, true) === 1,
    "TWIDDLED_RECT must place Y in the low/even Morton bits",
);
const decodedRgbaSha256 = sha256(decoded.pixelData);
assert(
    decodedRgbaSha256 === EXPECTED_RGBA_SHA256,
    "Decoded atlas pixels do not match the independently verified RGBA layout",
);

// PVRT is 8 bytes, followed by its 8-byte pixel-format/dimension header.
const payloadLength = decoded.width * decoded.height * 2;
const pvrPayload = pvrBytes.subarray(16, 16 + payloadLength);
assert(pvrPayload.length === payloadLength, "PVR payload is truncated");

const vram = fs.readFileSync(path.join(captureDir, "vram.bin"));
const vramAddress = vram.indexOf(pvrPayload);
assert(vramAddress >= 0, "Extracted Ryo atlas payload was not found in captured VRAM");
const runtimePayload = vram.subarray(vramAddress, vramAddress + payloadLength);
assert(runtimePayload.equals(pvrPayload), "Runtime and extracted atlas bytes differ");

const frame = JSON.parse(fs.readFileSync(path.join(captureDir, "frame.json"), "utf8"));
const matching = [];
for (const [list, polygons] of Object.entries(frame.polygonLists)) {
    for (const polygon of polygons) {
        if (polygon.texture?.vramAddress === vramAddress) {
            matching.push({ list, polygon });
        }
    }
}
assert(matching.length > 0, "Capture has the atlas in VRAM but no draw using it");

const states = new Map();
let referencedVertices = 0;
let onScreenVertices = 0;
for (const { list, polygon } of matching) {
    const tsp = decodeTsp(polygon.tsp);
    const key = `${list}:${polygon.pcw}:${polygon.isp}:${polygon.tsp}:${polygon.tcw}`;
    const state = states.get(key) || {
        list,
        pcw: polygon.pcw,
        isp: polygon.isp,
        tspRaw: polygon.tsp,
        tcw: polygon.tcw,
        tsp,
        polygons: 0,
        referencedVertices: 0,
    };
    state.polygons++;
    for (const index of frame.indices.slice(
        polygon.firstIndex,
        polygon.firstIndex + polygon.indexCount,
    )) {
        if (index === 0xffffffff) continue;
        const vertex = frame.vertices[index];
        if (!vertex) continue;
        referencedVertices++;
        state.referencedVertices++;
        const [x, y] = vertex.position;
        if (x >= 0 && x <= frame.framebufferWidth && y >= 0 && y <= frame.framebufferHeight) {
            onScreenVertices++;
        }
    }
    states.set(key, state);
}

const runtimeStates = [...states.values()];
assert(runtimeStates.every((state) => state.tsp.clampU && state.tsp.clampV),
    "Captured Ryo atlas draw does not consistently clamp U and V");
assert(runtimeStates.every((state) => !state.tsp.flipU && !state.tsp.flipV),
    "Captured Ryo atlas unexpectedly uses a sampler flip");

const loader = new Mt5Loader(null);
loader.textureIds.set(6, Uint8Array.from(Buffer.from(HEAD_TEXTURE_HEX, "hex")));
const mapped = loader.mapUV(
    { u: 0.25, v: 0.75, mirrorU: false, mirrorV: false },
    6,
    { addr: 0xd648 },
    "face",
);
assert(mapped[0] === 0.25 && mapped[1] === 0.75,
    `Default loader changed native Ryo atlas UVs to ${mapped.join(",")}`);
assert(loader.addressModeForTexture(6) === "clamp",
    "Default loader did not select clamp-to-edge for the Ryo atlas");
assert(loader.alphaModeForTexture(6, { hasAlpha: true }) === "alphatest",
    "Default loader did not preserve ARGB1555 alpha testing");

console.log(JSON.stringify({
    schema: "ryo-head-runtime-verification-v1",
    captureDir,
    pvrPath,
    extractedTexture: {
        dimensions: [decoded.width, decoded.height],
        colorFormat: "ARGB1555",
        dataFormat: "TWIDDLED_RECT",
        payloadBytes: pvrPayload.length,
        payloadSha256: sha256(pvrPayload),
        decodedRgbaSha256,
    },
    runtime: {
        vramAddress,
        vramAddressHex: `0x${vramAddress.toString(16)}`,
        byteExact: runtimePayload.equals(pvrPayload),
        polygons: matching.length,
        referencedVertices,
        onScreenVertices,
        onScreenRatio: referencedVertices ? onScreenVertices / referencedVertices : 0,
        states: runtimeStates,
    },
    browserContract: {
        nativeUv: mapped,
        addressMode: loader.addressModeForTexture(6),
        alphaMode: loader.alphaModeForTexture(6, { hasAlpha: true }),
    },
}, null, 2));
