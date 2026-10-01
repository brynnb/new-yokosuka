import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Color3, DirectionalLight, HemisphericLight, NullEngine, Scene, Vector3 } from "@babylonjs/core";

import {
  createNativeAseqMapLayerRuntime,
} from "../play/events/NativeAseqMapLayerRuntime.js";

const inventory = JSON.parse(fs.readFileSync(new URL(
  "../play/assets/introduction/op00/asset-inventory.generated.json",
  import.meta.url,
)));
const manifest = JSON.parse(fs.readFileSync(new URL(
  "../play/assets/introduction/op00/manifest.json",
  import.meta.url,
)));

function fakeRoot(filename, enabled = true) {
  return {
    _filename: filename,
    metadata: null,
    enabled,
    worldMatrixUpdates: 0,
    isEnabled() { return this.enabled; },
    isDisposed() { return false; },
    setEnabled(value) { this.enabled = value; },
    computeWorldMatrix() { this.worldMatrixUpdates += 1; },
  };
}

test("stage lighting and environment leases restore on completion, cancellation and replay", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
    const fill = new HemisphericLight("fill", Vector3.Up(), scene);
    const original = Color3.FromArray([0.1, 0.2, 0.3]);
    scene.ambientColor = original;
    sun.intensity = 0.5;
    fill.intensity = 0.4;
    const leases = [];
    const runtime = createNativeAseqMapLayerRuntime({ scene,
      acquireActivityLighting: index => {
        leases.push(`lighting:${index}`);
        return () => leases.push("release-lighting");
      },
      acquireEnvironmentIsolation: () => {
        leases.push("environment");
        return () => leases.push("release-environment");
      },
    });
    const root = fakeRoot("dojo");
    runtime.load([root]);
    for (let replay = 0; replay < 2; replay++) {
      runtime.applyActivity({ activityId: "storm", browserMapVisibility: [],
        browserIsolatedEnvironment: true, browserLightingPresetIndex: 3 });
      assert.equal(root.enabled, true); // Isolate weather, not the exterior map.
      runtime.applyLightingCue({ ambientColor: [0.22, 0.22, 0.22], directionalIntensity: 1 });
      runtime.applyLightingCue({ ambientColor: [0.3, 0.3, 0.3], directionalIntensity: 8.7 });
      assert.equal(sun.intensity, 4.35);
      assert.ok(Math.abs(fill.intensity - 0.4 * 0.3 / 0.22) < 1e-9);
      assert.throws(() => runtime.applyLightingCue({ ambientColor: [NaN, 0, 0], directionalIntensity: 1 }), /invalid/);
      if (replay === 0) runtime.applyActivity({ activityId: "mail", browserMapVisibility: [] });
      else runtime.end();
      assert.deepEqual(scene.ambientColor, original);
      assert.equal(sun.intensity, 0.5);
      assert.equal(fill.intensity, 0.4);
      runtime.end(); // Idempotent cleanup must not release twice.
    }
    assert.equal(leases.filter(value => value === "release-lighting").length, 2);
    assert.equal(leases.filter(value => value === "release-environment").length, 2);
  } finally { scene.dispose(); engine.dispose(); }
});

test("OP00 browser cutaway hides only OMADO and restores its world root", () => {
  const runtime = createNativeAseqMapLayerRuntime({
    definitions: inventory.mapVisibilityModels,
  });
  const roots = [
    fakeRoot("S1_OP00_JIMENHAL.MT5"),
    ...inventory.mapVisibilityModels.map(
      value => fakeRoot(value.browserFilename),
    ),
  ];
  assert.equal(runtime.load(roots), 1);

  assert.equal(runtime.applyActivity(manifest.activities[0]), true);
  assert.deepEqual(roots.map(root => root.enabled), [true, false]);

  assert.equal(runtime.applyActivity(manifest.activities[21]), true);
  assert.deepEqual(roots.map(root => root.enabled), [true, false]);
  assert.equal(roots[1].metadata.nativeAseqMapVisibilityModel, "OMADO");

  assert.equal(runtime.end(), true);
  assert.deepEqual(roots.map(root => root.enabled), [true, true]);
  assert.equal(roots[0].worldMatrixUpdates, 0);
  assert.ok(roots[1].worldMatrixUpdates > 0);
});

test("OP00 browser cutaway fails closed when its exact root is missing", () => {
  const runtime = createNativeAseqMapLayerRuntime({
    definitions: inventory.mapVisibilityModels,
  });
  assert.throws(
    () => runtime.load([]),
    /expected one S1_OP00_OMADO\.MT5; found 0/,
  );
});

test("map geometry masks hide one exact node and restore it on clear", () => {
  const geometry = {
    enabled: true,
    worldMatrixUpdates: 0,
    isEnabled() { return this.enabled; },
    setEnabled(value) { this.enabled = value; },
    computeWorldMatrix() { this.worldMatrixUpdates += 1; },
    isDisposed() { return false; },
  };
  const maskRoot = fakeRoot("S1_TEST_MAP03.MT5");
  maskRoot._mt5Nodes = [{
    addr: 0xd10,
    mesh: geometry,
  }];
  const layerRoot = fakeRoot("S1_TEST_MAP01.MT5");
  const runtime = createNativeAseqMapLayerRuntime({
    definitions: [{ nativeName: "MAP01", browserFilename: layerRoot._filename }],
    geometryMasks: [{
      browserFilename: maskRoot._filename,
      nodeAddress: 0xd10,
    }],
  });

  assert.equal(runtime.load([layerRoot, maskRoot]), 1);
  assert.equal(geometry.enabled, false);
  assert.equal(geometry.worldMatrixUpdates, 1);

  runtime.clear();
  assert.equal(geometry.enabled, true);
  assert.equal(geometry.worldMatrixUpdates, 2);
});

test("isolated shots share one environment lease and release it on waking, cancellation, and replay", () => {
  let acquired = 0;
  let released = 0;
  const runtime = createNativeAseqMapLayerRuntime({
    acquireEnvironmentIsolation: () => { acquired++; return () => released++; },
  });
  const root = fakeRoot("resident-room");
  runtime.load([root]);
  const dream = { activityId: "dream", browserMapVisibility: [], browserIsolatedStage: true };
  const waking = { activityId: "waking", browserMapVisibility: [] };
  for (let replay = 0; replay < 2; replay++) {
    runtime.applyActivity(dream);
    runtime.applyActivity({ ...dream, activityId: "next-dream-shot" });
    assert.equal(acquired, replay * 2 + 1);
    assert.equal(released, replay * 2);
    runtime.applyActivity(waking);
    assert.equal(released, replay * 2 + 1);
    assert.equal(root.enabled, true);
    runtime.applyActivity(dream);
    runtime.end();
    runtime.clear();
    assert.equal(released, replay * 2 + 2);
    assert.equal(root.enabled, true);
  }
});
