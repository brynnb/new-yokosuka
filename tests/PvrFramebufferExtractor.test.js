import assert from "node:assert/strict";
import test from "node:test";
import {
  decodePvrFramebuffer,
  encodeRgbPng,
} from "../tools/emulator/extract_pvr_framebuffer.mjs";

function map32(address) {
  return (
    (address & 3)
    | ((address & 0x3ffffc) * 2)
    | (((address & 0x400000) !== 0 ? 1 : 0) * 4)
  );
}

test("PVR framebuffer extractor follows native 32-bit VRAM bank mapping", () => {
  const registers = Buffer.alloc(0x8000);
  registers.writeUInt32LE(0x5, 0x44); // enabled RGB565
  registers.writeUInt32LE(0x100, 0x50);
  registers.writeUInt32LE(0x00000401, 0x5c); // 4x2, modulus 1
  registers.writeUInt32LE(0, 0xd0);
  const vram = Buffer.alloc(0x800000);
  const colors = [0xf800, 0x07e0, 0x001f, 0xffff, 0, 0xf800, 0x07e0, 0x001f];
  colors.forEach((color, index) => {
    vram.writeUInt16LE(color, map32(0x100 + index * 2));
  });
  const decoded = decodePvrFramebuffer(registers, vram);
  assert.deepEqual([decoded.width, decoded.height, decoded.depth], [4, 2, 1]);
  assert.deepEqual([...decoded.rgb.subarray(0, 12)], [
    248, 0, 0, 0, 252, 0, 0, 0, 248, 248, 252, 248,
  ]);
  assert.equal(encodeRgbPng(decoded).subarray(1, 4).toString("ascii"), "PNG");
});
