import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

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
