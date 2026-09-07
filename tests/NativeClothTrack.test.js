import assert from "node:assert/strict";
import test from "node:test";

import { parseNativeClothTrack } from "../play/characters/NativeClothTrack.js";

function trackBuffer({ frames = 3, vertices = 2 } = {}) {
  const values = frames * vertices * 6;
  const recordBytes = 8 + vertices * 6 * 2;
  const buffer = new ArrayBuffer(40 + frames * recordBytes);
  const view = new DataView(buffer);
  "NYCLTH01".split("").forEach((value, index) => {
    view.setUint8(index, value.charCodeAt(0));
  });
  view.setUint16(8, 2, true);
  view.setUint16(10, 40, true);
  view.setUint32(12, frames, true);
  view.setUint32(16, vertices, true);
  view.setInt16(20, -70, true);
  view.setUint16(22, 1, true);
  view.setUint16(24, vertices, true);
  view.setUint16(26, 6, true);
  view.setUint32(28, 0x2052474d, true);
  view.setFloat32(32, 1 / 8192, true);
  const coordinates = [[2, 10], [6, 20], [4, 30]];
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = 40 + frame * recordBytes;
    view.setUint16(offset, coordinates[frame][0], true);
    view.setUint32(offset + 4, coordinates[frame][1], true);
    const samples = new Int16Array(buffer, offset + 8, vertices * 6);
    samples.forEach((_, index) => {
      samples[index] = frame * vertices * 6 + index - 5;
    });
  }
  return buffer;
}

test("native cloth tracks retain exact lattice identity and fixed-point frames", () => {
  const track = parseNativeClothTrack(trackBuffer());
  assert.equal(track.modelCode, "MGR");
  assert.equal(track.controlType, -70);
  assert.equal(track.vertexCount, 2);
  assert.equal(track.frameCount, 3);
  assert.equal(track.matches({ controlType: -70, vertexCount: 2 }), true);
  assert.equal(track.matches({ controlType: -70, vertexCount: 3 }), false);
  assert.deepEqual(
    Array.from(track.frameAt(2, 10)),
    Array.from({ length: 12 }, (_, index) => Math.fround((index - 5) / 8192)),
  );
  assert.equal(track.frameAt(1, 999), null);
  assert.deepEqual(track.frameAt(6, 999), track.frameAt(6, 20));
  assert.deepEqual(track.frameAt(4, 29), track.frameAt(6, 20));
  assert.deepEqual(track.frameAt(4, 999), track.frameAt(4, 30));
});

test("native cloth tracks reject truncated payloads", () => {
  const buffer = trackBuffer();
  assert.throws(
    () => parseNativeClothTrack(buffer.slice(0, -2)),
    /length/u,
  );
});
