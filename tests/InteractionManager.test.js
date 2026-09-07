import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import { InteractionManager } from "../play/interactions/InteractionManager.js";

function runtime(entries = []) {
  return {
    entries,
    cleared: 0,
    updated: [],
    clear() { this.cleared++; },
    update(delta) { this.updated.push(delta); },
  };
}

test("interaction manager owns lifecycle and distant auto-close", () => {
  const drawer = {
    openedByPlayer: true,
    state: "open",
    elapsed: 7,
    root: { getAbsolutePosition: () => new BABYLON.Vector3(6, 0, 0) },
  };
  const drawers = runtime([drawer]);
  const doors = runtime();
  const clocks = runtime();
  const inspectables = runtime();
  const vending = runtime();
  const authMovement = runtime();
  const manager = new InteractionManager({
    drawers,
    doors,
    clocks,
    inspectables,
    vending,
    authMovement,
    getActorPosition: () => BABYLON.Vector3.Zero(),
    autoCloseDistance: 5,
  });

  manager.update(0.25);
  assert.equal(drawer.state, "closing");
  assert.equal(drawer.elapsed, 0);
  assert.deepEqual(drawers.updated, [0.25]);
  assert.deepEqual(doors.updated, [0.25]);
  manager.clear();
  assert.equal(drawers.cleared, 1);
  assert.equal(vending.cleared, 1);
  assert.equal(authMovement.cleared, 1);
});
