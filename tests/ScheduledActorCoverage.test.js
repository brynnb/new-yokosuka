import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-coverage.json",
  "utf8",
));

test("every catalogued disc area has an explicit source-backed status", () => {
  assert.equal(report.summary.catalogAreaCount, 139);
  assert.equal(report.areas.length, report.summary.catalogAreaCount);
  assert.equal(report.summary.partialOfflineAreaCount, 91);
  assert.equal(report.summary.noScheduledAreaSelectorCount, 48);
  assert.equal(report.summary.unresolvedAreaCount, 0);
  assert.equal(
    report.summary.partialOfflineAreaCount
      + report.summary.noScheduledAreaSelectorCount,
    report.summary.catalogAreaCount,
  );
  for (const area of report.areas) {
    assert.ok([1, 2, 3].includes(area.disc));
    assert.match(area.area, /^[A-Z0-9]{4}$/);
    assert.ok([
      "partially-decoded-scheduled-area",
      "no-scheduled-area-selector",
    ].includes(area.classification));
  }
});

test("negative schedule coverage comes from source, not an empty RAM capture", () => {
  for (const area of report.areas.filter(
    (candidate) => candidate.classification === "no-scheduled-area-selector",
  )) {
    assert.equal(area.completeSchedule, true);
    assert.equal(area.offlineScheduledProgramCount, 0);
    assert.match(area.status, /complete extracted cycle-program sources/);
  }
});
