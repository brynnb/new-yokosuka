import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/interior-door-model-audit.json", "utf8"),
);

test("every resolved storefront exit has authored moving door geometry", () => {
  assert.equal(report.schema, "new-yokosuka-interior-door-model-audit-v1");
  assert.deepEqual(report.summary, {
    transitionCount: 12,
    resolvedModelCount: 12,
    verifiedModelCount: 12,
    unresolvedModelCount: 0,
    failureCount: 0,
  });
  for (const model of report.models) {
    assert.equal(model.status, "verified");
    assert.ok(model.renderKeys.includes(12));
    assert.match(model.sha256, /^[0-9a-f]{64}$/);
  }
});
