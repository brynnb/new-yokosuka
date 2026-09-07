import assert from "node:assert/strict";
import test from "node:test";

import {
    parseRuntimeControlRecording,
    parseRuntimeMatrixRecording,
    RYO_YK_RENDER_MATRIX_ROUTES,
} from "../src/RuntimeMatrixRecording.js";

test("parses captured SH-4 matrix words without changing their float bits", () => {
    const identity = [
        "3f800000", "00000000", "00000000", "00000000",
        "00000000", "3f800000", "00000000", "00000000",
        "00000000", "00000000", "3f800000", "00000000",
        "3fc00000", "c0000000", "40600000", "3f800000",
    ];
    const header = [
        "frame", "phase", "dpadButtons",
        ...identity.map((_, index) => `m00_${String(index).padStart(2, "0")}`),
    ];
    const recording = parseRuntimeMatrixRecording([
        "# schema=test",
        header.join(","),
        ["7", "step", "1", ...identity].join(","),
    ].join("\n"));

    assert.equal(recording.matrixCount, 1);
    assert.equal(recording.frames[0].frame, 7);
    assert.equal(recording.frames[0].phase, "step");
    assert.deepEqual(recording.frames[0].matrices[0].slice(12, 15), [1.5, -2, 3.5]);
});

test("exposes the conflict-free 13-entry Ryo render routing", () => {
    assert.equal(RYO_YK_RENDER_MATRIX_ROUTES.length, 13);
    assert.equal(new Map(RYO_YK_RENDER_MATRIX_ROUTES).get(-0x43), 22);
    assert.equal(
        new Set(RYO_YK_RENDER_MATRIX_ROUTES.map(([renderKey]) => renderKey)).size,
        RYO_YK_RENDER_MATRIX_ROUTES.length,
    );
});

test("decodes little-endian runtime control words", () => {
    const bytes = Buffer.alloc(72);
    bytes.writeUInt8(0x13, 0);
    bytes.writeUInt8(2, 1);
    bytes.writeUInt8(1, 2);
    bytes.writeInt16LE(-16384, 10);
    bytes.writeInt16LE(8192, 12);
    bytes.writeFloatLE(1.5, 16);
    bytes.writeFloatLE(-2, 20);
    bytes.writeFloatLE(3.5, 24);
    bytes.writeFloatLE(0.75, 64);
    const words = Array.from({ length: 18 }, (_, index) => (
        bytes.readUInt32LE(index * 4).toString(16).padStart(8, "0")
    ));
    const header = [
        "frame", "phase", "dpadButtons",
        ...words.map((_, index) => `c00_${String(index).padStart(2, "0")}`),
    ];
    const recording = parseRuntimeControlRecording([
        "# schema=test",
        header.join(","),
        ["2", "idle", "0", ...words].join(","),
    ].join("\n"));

    assert.equal(recording.controlCount, 1);
    assert.equal(recording.frames[0].controls[0].type, 0x13);
    assert.deepEqual(
        recording.frames[0].controls[0].rotationRaw,
        [-16384, 8192, 0],
    );
    assert.deepEqual(
        recording.frames[0].controls[0].position,
        [1.5, -2, 3.5],
    );
    assert.equal(recording.frames[0].controls[0].translationScale, 0.75);
});
