import assert from "node:assert/strict";
import test from "node:test";

import {
  interpolateClearColors,
  interpolateLightingPresets,
} from "../src/LightingInterpolation.js";
import {
  clearColorForPreset,
  skyTextureForPreset,
} from "../src/lighting.js";

test("lighting interpolation preserves endpoints and blends every field", () => {
  const day = {
    intensity: 1,
    color: [1, 0.8, 0.6],
  };
  const night = {
    intensity: 0.2,
    color: [0.1, 0.2, 0.5],
  };
  assert.deepEqual(interpolateLightingPresets(day, night, 0), day);
  assert.deepEqual(interpolateLightingPresets(day, night, 1), night);
  assert.deepEqual(interpolateLightingPresets(day, night, 0.5), {
    intensity: 0.6,
    color: [0.55, 0.5, 0.55],
  });
});

test("clear colors blend without changing alpha unexpectedly", () => {
  assert.deepEqual(
    interpolateClearColors([0.4, 0.6, 0.9, 1], [0.8, 0.4, 0.2, 1], 0.5),
    [0.6000000000000001, 0.5, 0.55, 1],
  );
});

test("winter daytime uses the asset viewer's grey sky treatment", () => {
  assert.equal(skyTextureForPreset(0, 0), "/textures/sky/air00.png");
  assert.equal(skyTextureForPreset(0, 1), "/textures/sky/air07.png");
  assert.deepEqual(clearColorForPreset(0, 0), [0.4, 0.6, 0.9, 1]);
  assert.deepEqual(clearColorForPreset(0, 1), [0.5, 0.55, 0.65, 1]);
});
