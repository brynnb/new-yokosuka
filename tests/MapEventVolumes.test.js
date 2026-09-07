import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/map-event-volumes.json",
  "utf8",
));

test("all-disc EVNT inventory retains exact callback geometry", () => {
  assert.equal(evidence.schema, "new-yokosuka-map-event-volumes-v3");
  assert.equal(evidence.summary.mapCount, 136);
  assert.equal(evidence.summary.exactKind5RecordCount, 116);
  assert.equal(evidence.summary.exactKind6RecordCount, 33);
  assert.equal(evidence.summary.nativeCallbackClassRecordCount, 98);
  assert.equal(evidence.nativeEvidence.kind5RecordByteLength, 36);
  for (const record of evidence.callbackClassVolumes) {
    assert.equal(record.eventClass, 4);
    assert.equal(record.nativeCallbackClass, true);
    assert.ok(record.browserShape.vertices.length >= 3);
  }
});

test("known town boundary volumes are present on every extracted disc", () => {
  const selectors = (area) => evidence.callbackClassVolumes
    .filter((record) => record.area === area)
    .map((record) => `${record.disc}:${record.eventId}`)
    .sort();
  assert.deepEqual(selectors("D000"), [
    "1:2", "1:3", "1:4", "1:5",
    "2:2", "2:3", "2:4", "2:5",
    "3:2", "3:3", "3:4", "3:5",
  ]);
  assert.deepEqual(selectors("JD00"), [
    "1:1", "1:2", "1:3",
    "2:1", "2:2", "2:3",
    "3:1", "3:2", "3:3",
  ]);
  assert.deepEqual(selectors("JU00"), ["1:1", "2:1", "3:1"]);
  assert.deepEqual(selectors("MFSY"), ["2:1", "3:1"]);
});

test("variable kind-6 polygons are decoded exactly", () => {
  for (const area of ["JOMO", "YDB1"]) {
    const maps = evidence.maps.filter(
      (item) => item.area === area && item.payloadByteLength > 0,
    );
    assert.ok(maps.length > 0);
    assert.ok(maps.every((item) => item.status.startsWith("exact")));
    assert.ok(maps.every((item) => item.records.some(
      (record) => record.kind === 6
        && record.pointCount >= 3
        && record.browserShape.vertices.length === record.pointCount,
    )));
  }
});
