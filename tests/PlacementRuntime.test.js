import assert from "node:assert/strict";
import test from "node:test";
import { PlacementRuntime } from "../play/world/PlacementRuntime.js";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";
import placements from "../play/data/d000-runtime-placements.json" with { type: "json" };

test("exploration keeps the harbor bus enabled and routable without revealing its cutscene driver", async (t) => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  t.mock.method(Mt5Loader.prototype, "load", async () => {
    const root = new BABYLON.TransformNode("placed", scene);
    BABYLON.MeshBuilder.CreateBox("geometry", {}, scene).parent = root;
    return [root];
  });
  const state = { currentMeshes: [] };
  const runtime = new PlacementRuntime({
    scene, state,
    setMetadata(root, key, value) { root.metadata = { ...root.metadata, [key]: value }; },
    inspectableInteractions: { registerAmbient() {} },
  });
  t.mock.method(runtime, "readModelAssets", async () => ({ modelBuffer: new ArrayBuffer(0), texturePack: null }));
  for (const tag of ["BUS_", "BUSS"]) {
    const placement = placements.placements.find(p => p.runtime?.objectTag === tag);
    await runtime.loadModelGroup({ model: placement.model, modelPlacements: [placement], worldId: "dobuita", placedRoots: [], placementAuditRecords: [] });
  }
  const [bus, driver] = state.currentMeshes;
  assert.equal(bus.isEnabled(), true);
  assert.equal(bus.metadata.interactiveMapTransition.transition.destination.worldId, "mfsy");
  assert.deepEqual(bus.position.asArray(), [-50.346893, 0, 5.975222]);
  assert.equal(driver.isEnabled(), false);
});

test("placement behavior registration delegates to the owning subsystem", () => {
  const calls = [];
  const runtime = new PlacementRuntime({
    scene: null,
    state: { currentMeshes: [] },
    bundledModels: {},
    bundledTextures: {},
    fetchArrayBuffer: async () => null,
    setMetadata() {},
    drawerInteractions: {
      register: (...args) => calls.push(["drawer", ...args]),
    },
    doorInteractions: {
      registerHinged: (...args) => calls.push(["hinged", ...args]),
      registerPairedSlidingPanel() {},
      registerSliding() {},
      registerExteriorTransition() {},
      registerD000() {},
      registerSwing() {},
    },
    clockInteractions: { register() {} },
    inspectableInteractions: { register() {}, registerAmbient() {} },
    vendingInteractions: {
      register: (...args) => calls.push(["vending", ...args]),
    },
    authMovementRuntime: { register: async () => {} },
    preparePlacedRoots: async () => {},
  });
  const root = {};
  const placement = { runtime: { objectTag: "door" } };
  const result = runtime.registerBehavior(root, placement, {
    kind: "hinged-door",
  });

  assert.equal(result, 1);
  assert.deepEqual(calls, [["hinged", root, placement]]);
  assert.equal(
    runtime.registerBehavior(root, placement, { kind: "none" }),
    null,
  );
  runtime.registerBehavior(
    root,
    placement,
    { kind: "vending-machine" },
    "dobuita",
  );
  assert.deepEqual(calls.at(-1), [
    "vending",
    root,
    placement,
    "dobuita",
  ]);
});
