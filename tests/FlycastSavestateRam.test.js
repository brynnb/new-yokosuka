import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import {
  decompressFlycastState,
  locateDreamcastRam,
} from "../tools/emulator/extract_flycast_savestate_ram.mjs";

function syntheticState(payload) {
  const header = Buffer.alloc(24);
  header.write("FLYSAVE1", 0, "ascii");
  header.writeUInt32LE(854, 16);
  const rzip = Buffer.alloc(20);
  Buffer.from([0x23, 0x52, 0x5a, 0x49, 0x50, 0x76, 0x01, 0x23]).copy(rzip);
  rzip.writeUInt32LE(0x100000, 8);
  rzip.writeBigUInt64LE(BigInt(payload.length), 12);
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += 0x100000) {
    const compressed = zlib.deflateSync(payload.subarray(offset, offset + 0x100000));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(compressed.length);
    chunks.push(length, compressed);
  }
  return Buffer.concat([header, rzip, ...chunks]);
}

test("Flycast RZIP states decompress every declared chunk", () => {
  const payload = Buffer.alloc(0x210000);
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] = (index * 37 + 11) & 0xff;
  }
  const result = decompressFlycastState(syntheticState(payload));
  assert.deepEqual(result.payload, payload);
  assert.equal(result.chunkCount, 3);
});

test("Flycast state RAM location requires multiple static Disc windows", () => {
  const reference = Buffer.alloc(0x1000000, 0xff);
  for (const offset of [0x1000, 0x11000, 0x21000, 0x31000]) {
    for (let index = 0; index < 256; index += 1) {
      reference[offset + index] = (offset / 0x1000 + index * 17) & 0xff;
    }
  }
  const liveRam = Buffer.from(reference);
  liveRam.fill(0x42, 0x800000, 0x810000);
  const prefix = Buffer.alloc(12345, 0x33);
  const payload = Buffer.concat([prefix, liveRam, Buffer.alloc(5000)]);
  const located = locateDreamcastRam(payload, reference);
  assert.equal(located.offset, prefix.length);
  assert.deepEqual(located.ram, liveRam);
  assert.ok(located.staticWindowMatchCount >= 4);
});
