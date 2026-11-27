import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { createViewerObjMaterials } from "../src/ViewerObjMaterials.js";

// Extract raw scanlines for the encoder's small, non-interlaced PNG fixtures.
// The browser integration test separately imports the PNG using createImageBitmap.
function scanlines(bytes, expectedColorType) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes[25], expectedColorType);
  const idat = [];
  for (let position = 8; position < bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + position).getUint32(0);
    if (String.fromCharCode(...bytes.subarray(position + 4, position + 8)) === "IDAT") {
      idat.push(bytes.subarray(position + 8, position + 8 + length));
    }
    position += length + 12;
  }
  return [...inflateSync(Buffer.concat(idat))];
}

test("opaque, masked and blended wrappers share color art and resolve independent opacity", async () => {
  const data = Uint8Array.of(29, 10, 18, 0, 20, 43, 63, 160);
  const internal = {_bufferView: data, width: 1, height: 2, format: 5, type: 0, invertY: false};
  function wrapper(resource) {
    return {hasAlpha: true, getInternalTexture: () => resource, getSize: () => ({width: 1, height: 2}),
      readPixels() { throw new Error("unexpected GPU read"); }};
  }
  const opaque = {diffuseTexture: wrapper(internal), transparencyMode: 0};
  const masked = {diffuseTexture: wrapper(internal), transparencyMode: 1, alphaCutOff: 0.5};
  const blended = {albedoTexture: wrapper({...internal, _bufferView: data.slice()}), transparencyMode: 2,
    useAlphaFromAlbedoTexture: true, albedoColor: {r: 1, g: 0.4, b: 0.3}, alpha: 0.75};
  const maskedBlend = {...blended, transparencyMode: 3, alphaCutOff: 0.5};
  const materials = new Map([[opaque, "opaque"], [masked, "masked"], [blended, "blended"],
    [maskedBlend, "maskedBlend"], [null, "default"]]);
  const progress = [];
  const {mtl, images} = await createViewerObjMaterials(materials, {onProgress: (...args) => progress.push(args)});
  assert.deepEqual(progress, [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  assert.match(mtl, /Kd 1 0\.4 0\.3\n/);
  assert.match(mtl, /^d 0\.75$/m);
  const colors = [...mtl.matchAll(/^map_Kd (.+)$/gm)].map(match => match[1]);
  const alphas = [...mtl.matchAll(/^map_d -imfchan m (.+)$/gm)].map(match => match[1]);
  assert.equal(colors.length, 4);
  assert.equal(new Set(colors).size, 1);
  assert.equal(alphas.length, 3);
  assert.equal(images.size, 4);
  assert.deepEqual(scanlines(images.get(colors[0]), 6), [0, 20, 43, 63, 160, 0, 29, 10, 18, 0]);
  assert.deepEqual(scanlines(images.get(alphas[0]), 4), [0, 255, 255, 0, 0, 0]);
  assert.deepEqual(scanlines(images.get(alphas[1]), 4), [0, 160, 160, 0, 0, 0]);
  assert.deepEqual(scanlines(images.get(alphas[2]), 4), [0, 160, 160, 0, 0, 0]);
  const single = await createViewerObjMaterials(materials, {includeImages: false});
  assert.equal(single.mtl, mtl);
  assert.equal(single.images.size, 0);
});

test("GPU readback respects its own bottom-up orientation and reads each resource once", async () => {
  const internal = {invertY: true};
  let reads = 0;
  const texture = {getSize: () => ({width: 1, height: 2}), getInternalTexture: () => internal,
    async readPixels() { reads++; return Float32Array.of(0, 1, 0, 1, 1, 0, 0, 1); }};
  const materials = new Map([[{diffuseTexture: texture}, "a"], [{diffuseTexture: {...texture}}, "b"]]);
  const {images} = await createViewerObjMaterials(materials);
  assert.equal(reads, 1);
  assert.deepEqual(scanlines([...images.values()][0], 6), [0, 255, 0, 0, 255, 0, 0, 255, 0, 255]);
});
