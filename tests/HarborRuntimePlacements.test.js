import assert from "node:assert/strict";
import test from "node:test";

import mfsy from "../play/data/mfsy-runtime-placements.json" with {
  type: "json",
};
import mksg from "../play/data/mksg-runtime-placements.json" with {
  type: "json",
};
import ms08 from "../play/data/ms08-runtime-placements.json" with {
  type: "json",
};

function assertFinitePlacements(manifest) {
  for (const placement of manifest.placements) {
    assert.ok(placement.position.every(Number.isFinite));
    assert.ok(placement.rotationDegrees.every(Number.isFinite));
    assert.ok(
      placement.scale.every(
        (value) => Number.isFinite(value) && value > 0,
      ),
    );
  }
}

test("New Yokosuka Harbor combines live props and all static doors", () => {
  assert.equal(mfsy.area, "MFSY");
  assert.equal(mfsy.placements.length, 49);
  assert.equal(
    mfsy.placements.filter(
      (placement) => placement.runtime.placementSource === "runtime-task",
    ).length,
    22,
  );
  assert.deepEqual(
    mfsy.placements
      .filter(
        (placement) => (
          placement.runtime.placementSource === "mapinfo-static-door-table"
        ),
      )
      .map((placement) => placement.runtime.staticDoorIndex),
    Array.from({ length: 27 }, (_, index) => index),
  );
  assert.ok(mfsy.placements.some(
    (placement) => placement.runtime.objectTag === "TOMD",
  ));
  assertFinitePlacements(mfsy);
});

test("Old Warehouse District retains props but not frozen guard actors", () => {
  assert.equal(mksg.area, "MKSG");
  assert.equal(mksg.placements.length, 19);
  assert.ok(mksg.placements.some(
    (placement) => placement.runtime.objectTag === "TEL_",
  ));
  assert.ok(mksg.placements.some(
    (placement) => placement.runtime.objectTag === "HAKO",
  ));
  assert.ok(!mksg.placements.some(
    (placement) => /^KEB|^LIG/.test(placement.runtime.objectTag || ""),
  ));
  const doors = mksg.placements.filter(
    (placement) => placement.runtime.placementSource === "runtime-hmdl-instance",
  );
  assert.equal(doors.length, 10);
  assert.deepEqual(
    doors.map((placement) => placement.runtime.runtimeDoorIndex),
    Array.from({ length: 10 }, (_, index) => index),
  );
  assert.ok(doors.some((placement) => (
    placement.runtime.objectTag === "dor8"
    && placement.model === "S2_MKSG_DR02_021.MT5"
    && Math.abs(placement.position[0] - 66.60260009765625) < 1e-9
    && Math.abs(placement.position[2] + 4.110569953918457) < 1e-9
  )));
  assertFinitePlacements(mksg);
});

test("Old Warehouse No. 8 retains its exact MAPINFO entrance door", () => {
  assert.equal(ms08.area, "MS08");
  assert.equal(ms08.placements.length, 1);
  assert.deepEqual(ms08.placements[0], {
    id: "static-door-0",
    model: "S2_MS08_DR02_021.MT5",
    position: [27.059999465942383, 0, -1.7999999523162842],
    rotationDegrees: [0, 90, 0],
    scale: [1, 1, 1],
    runtime: {
      objectTag: "dor0",
      staticDoorIndex: 0,
      staticDoorType: 2,
      staticSourceOffset: "0x2b0bc",
      placementSource: "mapinfo-door-record",
    },
  });
  assertFinitePlacements(ms08);
});
