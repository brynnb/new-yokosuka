import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/player-portal-state-requirements.json",
    import.meta.url,
  ),
));

test("conditional portal branches retain every native state dependency", () => {
  assert.equal(report.summary.conditionalBranchCount, 11);
  assert.equal(report.summary.conditionalDoorSelectorCount, 3);
  assert.equal(report.summary.persistentFlagCount, 12);
  assert.equal(report.summary.nativePredicateCount, 2);
  assert.match(report.evidenceBoundary, /does not assign default flag values/);
});

test("every conditional branch remains tied to its native selector site", () => {
  for (const branch of report.branches) {
    assert.equal(branch.source.disc, 1);
    assert.equal(branch.source.area, "D000");
    assert.ok([26, 28, 35].includes(branch.source.doorSelector));
    assert.match(branch.source.selectorCompareFileOffset, /^0x[0-9a-f]+$/);
    assert.ok(branch.condition);
  }
});
