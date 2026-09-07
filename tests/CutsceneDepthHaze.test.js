import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  createCutsceneDepthHaze,
  normalizeCutsceneDepthHaze,
} from "../play/cutscenes/CutsceneDepthHaze.js";

const OPTIONS = Object.freeze({
  startDistance: 5,
  endDistance: 800,
  foregroundEndDistance: 90,
  foregroundOpacity: 0.4,
  maximumOpacity: 0.85,
  color: [0.62, 0.36, 0.22],
});

test("cutscene haze owns a distant depth post-process and releases it", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "camera",
    BABYLON.Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  try {
    const haze = createCutsceneDepthHaze({ scene, camera, options: OPTIONS });
    assert.equal(scene.fogMode, BABYLON.Scene.FOGMODE_NONE);
    assert.equal(camera._postProcesses.includes(haze.postProcess), true);
    assert.equal(haze.depthMode, 0);
    assert.equal(haze.ownsDepthRenderer, true);
    assert.equal(haze.depthRenderer.forceDepthWriteTransparentMeshes, true);
    haze.dispose();
    assert.equal(camera._postProcesses.includes(haze.postProcess), false);
    assert.equal(scene._depthRenderer?.[camera.uniqueId], undefined);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("cutscene haze validates its distance envelope", () => {
  assert.deepEqual(normalizeCutsceneDepthHaze(OPTIONS), OPTIONS);
  assert.throws(
    () => normalizeCutsceneDepthHaze({ ...OPTIONS, endDistance: 4 }),
    /end distance must exceed its start/,
  );
  assert.throws(
    () => normalizeCutsceneDepthHaze({ ...OPTIONS, maximumOpacity: 2 }),
    /maximum opacity must be between 0 and 1/,
  );
  assert.throws(
    () => normalizeCutsceneDepthHaze({ ...OPTIONS, foregroundEndDistance: 4 }),
    /foreground end must be within its distance envelope/,
  );
});

test("cutscene haze restores a shared depth renderer's transparent policy", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.FreeCamera(
    "camera",
    BABYLON.Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  try {
    const shared = scene.enableDepthRenderer(
      camera,
      false,
      true,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      true,
    );
    shared.forceDepthWriteTransparentMeshes = false;
    const haze = createCutsceneDepthHaze({ scene, camera, options: OPTIONS });
    assert.equal(haze.ownsDepthRenderer, false);
    assert.equal(shared.forceDepthWriteTransparentMeshes, true);
    haze.dispose();
    assert.equal(shared.forceDepthWriteTransparentMeshes, false);
    scene.disableDepthRenderer(camera);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
