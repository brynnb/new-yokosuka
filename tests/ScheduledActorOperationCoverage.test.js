import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coverage = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-operation-coverage.json",
  "utf8",
));

function family(operation) {
  return coverage.operationFamilies.find(
    (candidate) => candidate.operation === operation,
  );
}

test("every browser scheduler operation family has an explicit audit status", () => {
  assert.ok(coverage.summary.operationOccurrenceCount > 17_000);
  assert.equal(coverage.summary.uncoveredFamilyCount, 0);
  assert.ok(coverage.operationFamilies.every(
    (candidate) => candidate.browserStatus !== "uncovered",
  ));
});

test("the audit keeps exact behavior separate from retained numeric state", () => {
  assert.equal(family(0x19).browserStatus, "exact");
  assert.equal(
    family(0x19).browserEffect,
    "direct motion-controller install/teardown",
  );
  assert.equal(family(0x30).browserStatus, "exact");
  assert.equal(
    family(0x30).browserEffect,
    "registered mode-7 action motion-controller install/teardown",
  );
  assert.equal(family(0x09).browserStatus, "exact");
  assert.equal(family(0x10).browserStatus, "exact");
  assert.equal(family(0x11).browserStatus, "exact");
  assert.equal(
    family(0x35).browserStatus,
    "exact",
  );
  assert.equal(
    family(0x35).browserEffect,
    "operation-1 route-completion motion override",
  );
  assert.equal(family(0x17).browserStatus, "partial");
});
