import assert from "node:assert/strict";
import test from "node:test";
import {
  ForkliftCargoRuntime,
} from "../play/forklift/ForkliftCargoRuntime.js";

test("cargo runtime owns server state and world cleanup", () => {
  const applied = [];
  let disposed = false;
  const visualRoot = {};
  const runtime = new ForkliftCargoRuntime({
    scene: null,
    state: { currentMeshes: [visualRoot] },
    getWorld: () => ({ id: "ma00" }),
    getMultiplayerClient: () => null,
    quaternionFromNetworkState: () => null,
  });
  runtime.physics = {
    applyServerState(cargo) {
      applied.push(cargo.id);
      return true;
    },
    removeCargo: () => ({ visualRoot }),
    dispose() {
      disposed = true;
    },
  };

  runtime.applyServerState({ id: "cargo-before-snapshot", worldId: "ma00" });
  assert.deepEqual(applied, []);

  runtime.replaceServerSnapshot([
    { id: "cargo-1", worldId: "ma00" },
  ]);
  assert.deepEqual(applied, ["cargo-1"]);
  assert.equal(runtime.serverStates.get("cargo-1").worldId, "ma00");

  runtime.removeServerCargo("cargo-1");
  assert.equal(runtime.serverStates.has("cargo-1"), false);
  assert.equal(runtime.state.currentMeshes.includes(visualRoot), false);

  runtime.clearWorld();
  assert.equal(disposed, true);
  assert.equal(runtime.physics, null);
});

test("cargo snapshots remove server objects that no longer exist", () => {
  const removed = [];
  const runtime = new ForkliftCargoRuntime({
    scene: null,
    state: { currentMeshes: [] },
    getWorld: () => ({ id: "ma00" }),
    getMultiplayerClient: () => null,
    quaternionFromNetworkState: () => null,
  });
  runtime.physics = {
    applyServerState: () => true,
    removeCargo(id) {
      removed.push(id);
      return null;
    },
  };

  runtime.replaceServerSnapshot([
    { id: "cargo-1", worldId: "ma00" },
    { id: "cargo-2", worldId: "ma00" },
  ]);
  runtime.replaceServerSnapshot([
    { id: "cargo-2", worldId: "ma00" },
  ]);

  assert.deepEqual(removed, ["cargo-1"]);
  assert.deepEqual([...runtime.serverStates.keys()], ["cargo-2"]);
});
