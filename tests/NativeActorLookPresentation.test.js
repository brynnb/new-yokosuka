import assert from "node:assert/strict";
import test from "node:test";
import { Matrix } from "@babylonjs/core";
import { applyNativeActorLookPresentation, restoreNativeActorLookPresentation } from "../play/characters/NativeActorLookPresentation.js";
import { resolveNativeAseqGazeTarget, validNativeAseqGazeTarget } from "../play/events/NativeAseqGazeTarget.js";

test("prop gaze resolves the live world position without treating props as actors", () => {
  let position = [3, 4, 5];
  const actors = { objectWorldPosition: tag => tag === "MALS" ? position : null };
  const target = { kind: "object-base", objectTag: "MALS", offset: [1, 2, 3] };
  assert.deepEqual(resolveNativeAseqGazeTarget(actors, target), [2, 6, 8]);
  position = [8, 9, 10];
  assert.deepEqual(resolveNativeAseqGazeTarget(actors, target), [7, 11, 13]);
  assert.equal(validNativeAseqGazeTarget(target, { objectTagSet: new Set(["MALS"]) }), true);
  assert.equal(validNativeAseqGazeTarget(target, { objectTagSet: new Set() }), false);
  position = null;
  assert.throws(() => resolveNativeAseqGazeTarget(actors, target), /MALS:base.*unavailable/);
});

test("look presentation changes only the native neck branch, never accumulates and restores", () => {
  const base = [Matrix.Identity().asArray(), Matrix.Translation(0.1, 0, 0).asArray(), Matrix.Translation(0, -1, 0).asArray()].map(value => Array.from(value));
  const routes = new Map([[-67, base[1]], [-65, base[2]]]);
  const model = {
    latestControllerFamily: { nodes: [{ type: 4, index: 0, children: [1] }, { type: 5, index: 1, children: [] }, { type: 18, index: 2, children: [] }] },
    latestControllerMatrices: base, latestRetargetedRoutes: routes,
    latestControllerRenderMatrixByKey: new Map([[-67, 1], [-65, 2]]), renderRoot: {},
    loader: { characterContentRoot: () => ({ computeWorldMatrix: () => Matrix.Identity() }), applyCharacterRigWorldMatrices: () => {} },
  };
  const state = {};
  for (let i = 0; i < 90; i++) applyNativeActorLookPresentation(model, [2, 1, -1], state);
  assert.notDeepEqual(model.latestRetargetedRoutes.get(-67), routes.get(-67));
  assert.deepEqual(model.latestRetargetedRoutes.get(-65), routes.get(-65));
  assert.equal(state.baseMatrices, base);
  assert.ok(Math.abs(state.vertical) <= Math.PI / 4 && Math.abs(state.horizontal) <= Math.PI / 4);
  for (let i = 0; i < 90; i++) applyNativeActorLookPresentation(model, null, state);
  assert.ok(Math.abs(state.vertical) < 1e-6 && Math.abs(state.horizontal) < 1e-6);
  restoreNativeActorLookPresentation(model, state);
  assert.equal(model.latestControllerMatrices, base);
  assert.deepEqual(model.latestRetargetedRoutes, routes);
});
