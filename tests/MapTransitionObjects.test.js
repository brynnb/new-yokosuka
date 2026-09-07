import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/map-transition-objects.json", "utf8"),
);

test("typed native door-controller records cover every source disc", () => {
  assert.equal(report.schema, "new-yokosuka-map-transition-objects-v1");
  assert.deepEqual(report.summary, {
    mapCount: 86,
    doorControllerRecordCount: 86,
    exactTransitionAssociatedRecordCount: 70,
    ambiguousOrUnroutedRecordCount: 16,
    failureCount: 0,
  });
  assert.deepEqual(
    [...new Set(report.maps.map((item) => item.source.disc))],
    [1, 2, 3],
  );
});

test("door destinations are joined through callbacks, never proximity", () => {
  const dcha = report.maps.find(
    (item) => item.source.disc === 1 && item.source.area === "DCHA",
  );
  const [door] = dcha.doorControllerRecords;
  assert.equal(door.name, "DOOR");
  assert.deepEqual(door.controllerIds, [
    "0x001202ab",
    "0x001302ab",
  ]);
  assert.deepEqual(door.nativeTransform.position, [
    0,
    0,
    -4.461100101470947,
  ]);
  assert.deepEqual(door.destination, {
    scene: 1,
    area: "D000",
    entry: 8,
  });
  assert.equal(
    door.transitionAssociation,
    "exactSingleOutgoingDestination",
  );
});

test("current-scene exit callbacks exclude unrelated story transitions", () => {
  const dbyo = report.maps.find(
    (item) => item.source.disc === 1 && item.source.area === "DBYO",
  );
  assert.deepEqual(dbyo.exactOutgoingDestinations, [
    { scene: 1, area: "D000", entry: 14 },
    { scene: 2, area: "JOMO", entry: 0 },
  ]);
  assert.deepEqual(dbyo.doorTransitionDestinations, [
    { scene: 1, area: "D000", entry: 14 },
  ]);
  assert.equal(
    dbyo.doorDestinationSelectionRule,
    "currentSceneOperation019c",
  );
});
