import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/map-warp-inventory.json", "utf8"),
);

test("joins native transition volumes to exact callback destinations", () => {
  assert.equal(report.schema, "new-yokosuka-map-warp-inventory-v1");
  assert.equal(report.summary.nativeVolumeCount, 24);
  assert.equal(report.summary.resolvedNativeVolumeCount, 24);
  assert.equal(report.summary.unresolvedNativeVolumeCount, 0);
  assert.equal(report.summary.unclassifiedCallbackEventCount, 74);
  // Four transition targets expose neither typed Entry records nor an
  // unambiguous serialized AKIR default-player placement. The route itself is
  // still exact, but the destination placement remains deliberately unset.
  assert.equal(report.summary.nativeRouteMissingEntryPlacementCount, 4);
});

test("all three town boundaries retain the authored destination entry", () => {
  for (const disc of [1, 2, 3]) {
    const jd = report.nativeTransitionVolumes
      .filter((item) => item.disc === disc && item.area === "JD00")
      .sort((a, b) => a.eventId - b.eventId);
    assert.deepEqual(
      jd.map((item) => [
        item.eventId,
        item.routes[0].destination.area,
        item.routes[0].destination.entry,
      ]),
      [
        [1, "JU00", 0],
        [2, "D000", 1],
        [3, "D000", 11],
      ],
    );
    assert.ok(jd.every((item) => item.routes[0].destination.entryPlacement));
  }
});

test("Dobuita native volumes resolve arcade and bus/harbor exits", () => {
  for (const disc of [1, 3]) {
    const d000 = report.nativeTransitionVolumes.filter(
      (item) => item.disc === disc && item.area === "D000",
    );
    assert.equal(
      d000.find((item) => item.eventId === 4).routes[0].destination.area,
      "DGCT",
    );
    assert.equal(
      d000.find((item) => item.eventId === 5).routes[0].destination.area,
      "DCBN",
    );
  }
});

test("MFSY remains unclassified rather than being guessed as a warp", () => {
  assert.deepEqual(
    report.unclassifiedCallbackEvents
      .filter((item) => item.area === "MFSY")
      .map(
      (item) => [item.disc, item.area, item.eventId],
    ),
    [
      [2, "MFSY", 1],
      [3, "MFSY", 1],
    ],
  );
});

test("JOMO polygons remain geometry-only without operation-0x0001 callbacks", () => {
  const jomo = report.unclassifiedCallbackEvents.filter(
    (item) => item.area === "JOMO",
  );
  assert.equal(jomo.length, 72);
  assert.ok(jomo.some(
    (item) => item.kind === 6 && item.browserShape.vertices.length === 5,
  ));
});

test("D000 door destinations use native scene and entry argument order", () => {
  assert.equal(report.summary.resolvedD000DirectDoorCount, 18);
  assert.equal(report.summary.resolvedD000ConditionalDoorCount, 3);
  for (const door of report.d000DoorTransitions.direct) {
    assert.equal(door.destination.scene, 1);
    assert.equal(door.destination.entry, 0);
  }
  assert.equal(
    report.d000DoorTransitions.direct.find(
      (door) => door.destination.area === "DCHA",
    ).destination.entryPlacement.sourceKind,
    "CHRS Character AKIR",
  );
  assert.equal(
    report.d000DoorTransitions.direct.find(
      (door) => door.destination.area === "DKTY",
    ).destination.entryPlacement.sourceKind,
    "CHRS Character AKIR",
  );
});
