import assert from "node:assert/strict";
import test from "node:test";
import { PlacementRuntime } from "../play/world/PlacementRuntime.js";

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
