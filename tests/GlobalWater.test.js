import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  applyGlobalWaterTimeOfDay,
  createGlobalWater,
  disposeGlobalWater,
  globalWaterLightingForBlend,
} from "../src/GlobalWater.js";

test("global water renders before later transparent character surfaces", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const water = createGlobalWater(scene);
    assert.equal(water.alphaIndex, 0);
    assert.ok(water.getTotalVertices() > 30_000);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("global water blends from bright day water to dark navy night water", () => {
  assert.deepEqual(globalWaterLightingForBlend({
    fromIndex: 0,
    toIndex: 0,
    progress: 0,
  }), {
    textureV: 0.5,
    lightStrength: 1,
    contactStrength: 0.38,
  });
  assert.deepEqual(globalWaterLightingForBlend({
    fromIndex: 3,
    toIndex: 3,
    progress: 0,
  }), {
    textureV: 0.875,
    lightStrength: 0.04,
    contactStrength: 0.18,
  });
  assert.deepEqual(globalWaterLightingForBlend({
    fromIndex: 0,
    toIndex: 1,
    progress: 0.5,
  }), {
    textureV: 0.5625,
    lightStrength: 0.775,
    contactStrength: 0.35,
  });
});

test("global water material receives the current lighting blend", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const water = createGlobalWater(scene);
    applyGlobalWaterTimeOfDay(water, {
      fromIndex: 2,
      toIndex: 3,
      progress: 0.5,
    });
    assert.ok(
      Math.abs(water.metadata.globalWaterLighting.textureV - 0.7775) < 1e-9,
    );
    assert.equal(water.metadata.globalWaterLighting.lightStrength, 0.11);
    assert.equal(water.metadata.globalWaterLighting.contactStrength, 0.21);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("global water owns and releases its scene depth pass", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.UniversalCamera(
    "waterTestCamera",
    BABYLON.Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  try {
    const water = createGlobalWater(scene);
    assert.equal(water.metadata.globalWaterHasDepthTexture, true);
    assert.equal(water.metadata.globalWaterOwnsDepthRenderer, true);
    disposeGlobalWater(water);
    assert.equal(scene._depthRenderer?.[camera.uniqueId], undefined);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
