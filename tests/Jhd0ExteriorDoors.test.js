import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../play/data/jhd0-runtime-placements.json" with {
  type: "json",
};
import { WORLDS } from "../play/config/worlds.js";

function placement(model) {
  return manifest.placements.find((candidate) => candidate.model === model);
}

test("includes both Hazuki exterior transition doors", () => {
  const houseDoor = placement("S1_JHD0_DR15_016.MT5");
  assert.deepEqual(houseDoor.position, [3.24, 0, 0]);
  assert.equal(houseDoor.runtime.objectTag, "dor0");

  const gateDoor = placement("S1_JHD0_DR29_000.MT5");
  assert.deepEqual(gateDoor.position, [1, 0.21, 10.9]);
  assert.equal(gateDoor.runtime.objectTag, "dor1");
  assert.equal(gateDoor.runtime.taskAddress, "0x8c790120");
});

test("does not instantiate uninitialized Hazuki objects at the world origin", () => {
  assert.equal(
    WORLDS.exterior.placements.some(
      (candidate) => candidate.position.every((value) => value === 0),
    ),
    false,
  );
  assert.equal(WORLDS.exterior.placements.length, 25);
});
