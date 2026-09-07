import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTexturePackIndex,
  normalizeTextureCoordinateMode,
  textureCoordinateForSource,
} from "../src/Mt5TexturePolicy.js";

test("MT5 texture policy normalizes aliases and maps viewer coordinates", () => {
  assert.equal(normalizeTextureCoordinateMode("source_flip_u"), "pc-flipu");
  assert.deepEqual(textureCoordinateForSource("viewer", 0.25, 0.75), [
    0.75,
    0.25,
  ]);
});

test("MT5 texture pack index records length-prefixed entries", () => {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 4, true);
  const index = buildTexturePackIndex(buffer);
  assert.deepEqual(index.get("1_2"), { offset: 12, length: 4 });
});
