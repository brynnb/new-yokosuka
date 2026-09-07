import assert from "node:assert/strict";
import test from "node:test";

import manifest from "../play/data/jd00-runtime-placements.json" with {
  type: "json",
};

test("Sakuragaoka includes every authored static door", () => {
  const doors = manifest.placements.filter(
    (placement) => Number.isInteger(
      placement.runtime.staticDoorIndex,
    ),
  );
  assert.equal(manifest.placementCount, 62);
  assert.equal(manifest.placements.length, 62);
  assert.deepEqual(
    doors.map(
      (placement) => placement.runtime.staticDoorIndex,
    ),
    Array.from({ length: 55 }, (_, index) => index),
  );
  assert.ok(
    doors.every(
      (placement) => placement.model.startsWith("S1_JD00_DR"),
    ),
  );
});

test("Sakuragaoka transforms remain finite and source-backed", () => {
  for (const placement of manifest.placements) {
    assert.ok(placement.position.every(Number.isFinite));
    assert.ok(placement.rotationDegrees.every(Number.isFinite));
    assert.ok(
      placement.scale.every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    );
    assert.match(
      placement.runtime.placementSource,
      /^(?:mapinfo-static-door-table|settled-jd00-runtime-task)$/,
    );
  }
});

test("Sakuragaoka includes every modeled fixture in the settled capture", () => {
  const runtimeTags = manifest.placements
    .filter((placement) => (
      placement.runtime.placementSource === "settled-jd00-runtime-task"
    ))
    .map((placement) => placement.runtime.objectTag)
    .sort();
  assert.deepEqual(
    runtimeTags,
    ["BTEL", "DAMY", "GCH1", "GCH2", "TBOX", "VMG0", "VM_0"],
  );
});
