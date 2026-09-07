import assert from "node:assert/strict";
import test from "node:test";

import { extractNativeTexnPack } from "../tools/lib/NativeTexnPack.mjs";

test("TEXN extraction preserves the native texture ID and exact PVRT record", () => {
  const source = Buffer.alloc(40);
  source.write("TEXN", 4, "ascii");
  source.writeUInt32LE(32, 8);
  source.write("ABCDEFGH", 12, "ascii");
  source.write("PVRT", 24, "ascii");
  source.writeUInt32LE(0x12345678, 28);
  const pack = extractNativeTexnPack(source);
  assert.equal(pack.entries.length, 1);
  assert.deepEqual(pack.entries[0].sourceOffset, 4);
  assert.equal(pack.entries[0].id, "4142434445464748");
  assert.equal(pack.bytes.subarray(0, 8).toString("ascii"), "ABCDEFGH");
  assert.equal(pack.bytes.readUInt32LE(8), 12);
  assert.equal(pack.bytes.subarray(12, 16).toString("ascii"), "PVRT");
});
