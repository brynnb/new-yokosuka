import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/exact-door-model-audit.json", "utf8"),
);

test("every canonical exact door has production moving geometry", () => {
  assert.equal(report.schema, "new-yokosuka-exact-door-model-audit-v1");
  assert.deepEqual(report.summary, {
    transitionCount: 25,
    verifiedModelCount: 25,
    genericMovingNodeCount: 24,
    motionClassUnresolvedCount: 1,
    failureCount: 0,
  });
  for (const model of report.models) {
    assert.equal(model.status, "verified");
    assert.match(model.sha256, /^[0-9a-f]{64}$/);
  }
  const unresolved = report.models.filter(
    (model) => !model.genericMovingNodePresent,
  );
  assert.deepEqual(unresolved.map((model) => model.area), ["MKYU"]);
});
