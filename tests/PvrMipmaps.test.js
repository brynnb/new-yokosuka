import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlphaAwareMipChain,
  scaleAlphaToCoverage,
} from "../src/PvrDecoder.js";

test("alpha-aware mipmaps halve dimensions down to one pixel", () => {
  const pixels = new Uint8Array(8 * 4 * 4).fill(255);
  const levels = buildAlphaAwareMipChain(pixels, 8, 4);

  assert.deepEqual(
    levels.map(({ width, height }) => [width, height]),
    [[8, 4], [4, 2], [2, 1], [1, 1]],
  );
});

test("alpha-aware mipmaps retain edge pixels for odd dimensions", () => {
  const pixels = new Uint8Array(3 * 5 * 4).fill(255);
  const levels = buildAlphaAwareMipChain(pixels, 3, 5);

  assert.deepEqual(
    levels.map(({ width, height }) => [width, height]),
    [[3, 5], [2, 3], [1, 2], [1, 1]],
  );
});

test("transparent neighbors do not darken visible colors in smaller mips", () => {
  const pixels = new Uint8Array([
    240, 80, 40, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const levels = buildAlphaAwareMipChain(pixels, 2, 2, {
    preserveCoverage: false,
  });

  assert.deepEqual([...levels[1].pixels], [240, 80, 40, 64]);
});

test("alpha scaling retains the requested visible fraction when possible", () => {
  const pixels = new Uint8Array([
    1, 1, 1, 50,
    1, 1, 1, 80,
    1, 1, 1, 120,
    1, 1, 1, 200,
  ]);

  scaleAlphaToCoverage(pixels, 0.5);

  const visible = [3, 7, 11, 15]
    .filter((offset) => pixels[offset] >= 128)
    .length;
  assert.equal(visible, 2);
});

test("alpha coverage prediction matches rounded uploaded bytes", () => {
  const pixels = new Uint8Array([
    1, 1, 1, 64,
    1, 1, 1, 112,
  ]);

  scaleAlphaToCoverage(pixels, 0.5);

  const visible = [3, 7]
    .filter((offset) => pixels[offset] >= 128)
    .length;
  assert.equal(visible, 1);
});
