import assert from "node:assert/strict";
import test from "node:test";

import manifest from "../play/data/ju00-runtime-placements.json" with {
  type: "json",
};

test("retains every captured Yamanose prop and authored static door record", () => {
  assert.equal(manifest.area, "JU00");
  assert.equal(manifest.placements.length, 26);
  assert.equal(
    manifest.placements.filter(
      (placement) => placement.runtime.placementSource === "runtime-task",
    ).length,
    7,
  );
  assert.equal(
    manifest.placements.filter(
      (placement) => (
        placement.runtime.placementSource === "mapinfo-static-door-table"
      ),
    ).length,
    19,
  );
  assert.ok(manifest.placements.some(
    (placement) => (
      placement.model === "S1_JU00_KC1_M.MT5"
      && placement.runtime.objectTag === "CATM"
    ),
  ));
  for (const model of [
    "S1_JU00_DR15_019.MT5",
    "S1_JU00_DR15_022.MT5",
    "S1_JU00_DR15_023.MT5",
  ]) {
    assert.ok(manifest.placements.some((placement) => placement.model === model));
  }
});

test("marks the captured residence gate as Yamanose's transition door", () => {
  const gate = manifest.placements.find(
    (placement) => placement.runtime.staticDoorIndex === 18,
  );
  assert.equal(gate.model, "S1_JU00_DR29_000.MT5");
  assert.equal(gate.runtime.objectTag, "dor0");
  assert.deepEqual(gate.position, [53.360699, 7.8159, 100.2145]);
});
