import assert from "node:assert/strict";
import test from "node:test";

import { NativeMapRenderPreparationState } from "../play/world/NativeMapRenderPreparationState.js";

function mapRoot(filename, material) {
  const child = {
    material,
    resyncCount: 0,
    _resyncLightSources() { this.resyncCount += 1; },
    isDisposed: () => false,
  };
  return {
    _filename: filename,
    material,
    resyncCount: 0,
    _resyncLightSources() { this.resyncCount += 1; },
    getDescendants: () => [child],
    isDisposed: () => false,
    child,
  };
}

function material() {
  return {
    dirtyFlags: [],
    unfreezeCount: 0,
    markAsDirty(flag) { this.dirtyFlags.push(flag); },
    unfreeze() { this.unfreezeCount += 1; },
  };
}

test("MAP preparation refreshes only exact native MAP layers", () => {
  const shared = material();
  const base = mapRoot("D000_MAP.MT5", shared);
  const layer = mapRoot("D000_MAP02.MT5", shared);
  const unrelated = mapRoot("D000_OBJ.MT5", material());
  const state = new NativeMapRenderPreparationState({ lightDirtyFlag: 7 });
  assert.deepEqual(
    state.load({ prefix: "D000" }, [base, layer, unrelated]),
    [0, 2],
  );

  assert.deepEqual(state.apply({ selector: 2, mode: 0 }), {
    selector: 2,
    mode: 0,
    layers: [2],
    materialCount: 1,
  });
  assert.equal(state.preparedLayers.has(2), false);
  assert.deepEqual(shared.dirtyFlags, [7]);
  assert.equal(layer.resyncCount, 1);
  assert.equal(layer.child.resyncCount, 1);

  state.apply({ selector: -1, mode: 1 });
  assert.deepEqual([...state.preparedLayers].sort(), [0, 2]);
  assert.deepEqual(shared.dirtyFlags, [7, 7]);
  assert.equal(unrelated.material.dirtyFlags.length, 0);
});

test("MAP preparation rollback restores state and refreshes touched materials", () => {
  const mapMaterial = material();
  const state = new NativeMapRenderPreparationState({ lightDirtyFlag: 3 });
  state.load({ prefix: "D000" }, [mapRoot("D000_MAP.MT5", mapMaterial)]);
  const token = state.beginTransaction();
  state.apply({ selector: -1, mode: 0 });
  assert.equal(state.preparedLayers.has(0), false);
  assert.equal(state.rollbackTransaction(token), true);
  assert.equal(state.preparedLayers.has(0), true);
  assert.deepEqual(mapMaterial.dirtyFlags, [3, 3]);
});
