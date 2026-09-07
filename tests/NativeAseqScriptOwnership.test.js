import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveNativeAseqCallOwnership,
  nativeAseqGeneratedFunctionBounds,
  nativeAseqGoverningActivityFrame,
  nativeAseqGoverningActivityRange,
} from "../tools/lib/NativeAseqScriptOwnership.mjs";

function writeFunctionPrologue(bytes, offset) {
  bytes.writeUInt16LE(0x2de6, offset);
  bytes.writeUInt16LE(0x4d22, offset + 2);
  bytes.writeUInt16LE(0x7de0, offset + 4);
  bytes.writeUInt16LE(0x6ed3, offset + 6);
}

function writeFrameBlock(bytes, offset, frame, blockEnd) {
  bytes.writeUInt16LE(0x54e0, offset);
  bytes.writeUInt16LE(0xe500 | frame, offset + 2);
  bytes.writeUInt16LE(0x3450, offset + 4);
  bytes.writeUInt16LE(0x344a, offset + 6);
  bytes.writeUInt16LE(0x6043, offset + 8);
  bytes.writeUInt16LE(0x8800, offset + 10);
  bytes.writeUInt16LE(0x8b02, offset + 12);
  bytes.writeUInt16LE(0xd108, offset + 14);
  bytes.writeUInt16LE(0x0123, offset + 16);
  bytes.writeUInt16LE(0x0009, offset + 18);
  bytes.writeUInt32LE(blockEnd - (offset + 20), 0x60);
}

function fixture() {
  const bytes = Buffer.alloc(0xc0);
  writeFunctionPrologue(bytes, 0x20);
  writeFrameBlock(bytes, 0x30, 5, 0x60);
  writeFunctionPrologue(bytes, 0x70); // unrelated generated room function
  writeFunctionPrologue(bytes, 0x80);
  return bytes;
}

test("native ASEQ call ownership derives track and frame from SH-4 boundaries", () => {
  const bytes = fixture();
  assert.deepEqual(
    deriveNativeAseqCallOwnership({
      bytes,
      trackFunctions: [
        { trackIndex: 15, functionOffset: 0x80 },
        { trackIndex: 20, functionOffset: 0x20 },
      ],
      callFileOffset: 0x50,
    }),
    {
      trackIndex: 20,
      frame: 5,
      functionOffset: 0x20,
      functionEndOffset: 0x70,
    },
  );
  assert.equal(nativeAseqGoverningActivityFrame(bytes, 0x20, 0x50), 5);
  assert.deepEqual(nativeAseqGeneratedFunctionBounds(bytes, 0x20), {
    functionOffset: 0x20,
    functionEndOffset: 0x70,
  });
});

test("native ASEQ ownership derives strict callback frame ranges", () => {
  const bytes = Buffer.alloc(0xc0);
  writeFunctionPrologue(bytes, 0x20);
  const offset = 0x30;
  bytes.writeUInt16LE(0xe044, offset);
  bytes.writeUInt16LE(0x04ee, offset + 2);
  bytes.writeUInt16LE(0xd50b, offset + 4);
  bytes.writeUInt16LE(0x3457, offset + 6);
  bytes.writeUInt16LE(0x344a, offset + 8);
  bytes.writeUInt16LE(0xe044, offset + 10);
  bytes.writeUInt16LE(0x05ee, offset + 12);
  bytes.writeUInt16LE(0xd60b, offset + 14);
  bytes.writeUInt16LE(0x3657, offset + 16);
  bytes.writeUInt16LE(0x355a, offset + 18);
  bytes.writeUInt16LE(0x2459, offset + 20);
  bytes.writeUInt16LE(0x6043, offset + 22);
  bytes.writeUInt16LE(0x8800, offset + 24);
  bytes.writeUInt16LE(0x8b02, offset + 26);
  bytes.writeUInt16LE(0xd10d, offset + 28);
  bytes.writeUInt16LE(0x0123, offset + 30);
  bytes.writeUInt32LE(10, 0x64);
  bytes.writeUInt32LE(20, 0x6c);
  bytes.writeUInt32LE(0x70 - (offset + 34), 0x84);
  assert.deepEqual(nativeAseqGoverningActivityRange(bytes, 0x20, 0x54), {
    firstFrame: 11,
    lastFrame: 19,
  });
});

test("native ASEQ ownership does not cross an unrelated function boundary", () => {
  assert.throws(
    () => deriveNativeAseqCallOwnership({
      bytes: fixture(),
      trackFunctions: [
        { trackIndex: 20, functionOffset: 0x20 },
        { trackIndex: 15, functionOffset: 0x80 },
      ],
      callFileOffset: 0x74,
    }),
    /expected one ASEQ track owner; found 0/,
  );
});

test("native ASEQ ownership rejects duplicate function declarations", () => {
  assert.throws(
    () => deriveNativeAseqCallOwnership({
      bytes: fixture(),
      trackFunctions: [
        { trackIndex: 20, functionOffset: 0x20 },
        { trackIndex: 15, functionOffset: 0x20 },
      ],
      callFileOffset: 0x50,
    }),
    /function 0x20 has duplicate tracks/,
  );
});
