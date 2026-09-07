import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/map-transition-catalog.json", "utf8"),
);

test("transition catalog covers all three extracted scenes", () => {
  assert.equal(report.schema, "new-yokosuka-map-transition-catalog-v3");
  assert.deepEqual(
    [...new Set(report.maps.map((item) => item.source.scene))].sort(),
    [1, 2, 3],
  );
  assert.equal(report.summary.mapInfoCount, report.maps.length);
  assert.equal(report.summary.mapInfoFailureCount, 0);
});

test("literal callers of dynamic transition helpers are recovered", () => {
  assert.ok(report.summary.resolvedLocalHelperCallCount > 0);
  const mfsy = report.maps.find(
    (item) => item.source.disc === 2 && item.source.area === "MFSY",
  );
  assert.deepEqual(
    mfsy.localHelperTransitions.map((item) => (
      `${item.destination.scene}:${item.destination.area}:`
        + item.destination.entry
    )),
    [
      "2:MKSG:0",
      "2:D000:0",
      "2:MKSG:0",
      "2:MS8S:0",
      "2:MKSG:0",
    ],
  );
});

test("every transition source retains an exact source hash", () => {
  for (const map of report.maps) {
    assert.match(map.sourceSha256, /^[0-9a-f]{64}$/);
  }
});

test("exact transition edges retain scene, area, and entry", () => {
  assert.ok(report.exactEdges.length > 0);
  for (const edge of report.exactEdges) {
    assert.equal(typeof edge.destination.scene, "number");
    assert.match(edge.destination.area, /^[A-Z0-9]{4}$/);
    assert.equal(typeof edge.destination.entry, "number");
  }
});
