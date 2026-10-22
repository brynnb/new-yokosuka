import assert from "node:assert/strict";
import test from "node:test";
import { adjacentCombatTarget } from "../src/CombatTargetSelection.js";

test("target cycling follows projected horizontal order, wraps, and ignores defeated/behind-camera targets", () => {
  const candidates = [
    { id: "right", screenX: 0.8, visible: true },
    { id: "left", screenX: 0.1, visible: true },
    { id: "center", screenX: 0.5, visible: true },
    { id: "dead", screenX: 0.6, visible: true, defeated: true },
    { id: "behind", screenX: 0.7, visible: false },
  ];
  assert.equal(adjacentCombatTarget(candidates, "center", "right"), "right");
  assert.equal(adjacentCombatTarget(candidates, "center", "left"), "left");
  assert.equal(adjacentCombatTarget(candidates, "right", "right"), "left");
  assert.equal(adjacentCombatTarget(candidates, "left", "left"), "right");
  assert.equal(adjacentCombatTarget([], "center", "right"), "center");
  assert.equal(adjacentCombatTarget(candidates, "behind", "right"), "left");
  const reversed = candidates.map(entry => ({ ...entry, screenX: 1 - entry.screenX }));
  assert.equal(adjacentCombatTarget(reversed, "center", "right"), "left");
  assert.equal(adjacentCombatTarget([candidates[0]], "right", "right"), "right");
});
