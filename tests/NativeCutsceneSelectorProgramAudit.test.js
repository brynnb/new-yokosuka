import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const audit = JSON.parse(fs.readFileSync(
  "tools/evidence/native-cutscene-selector-program-audit.json",
  "utf8",
));

test("selector program audit exposes the exact remaining direct activities", () => {
  assert.equal(
    audit.schema,
    "new-yokosuka-native-cutscene-selector-program-audit-v1",
  );
  assert.deepEqual(audit.summary, {
    selectionCount: 58,
    programSelectionCount: 58,
    directActivitySelectionCount: 0,
    missingProgramCount: 0,
    blockedProgramSelectionCount: audit.programSelections.filter(
      item => item.unresolvedOperations.length > 0,
    ).length,
  });
  assert.equal(
    audit.programSelections.find(item => item.cutsceneId === "S1-DRAUTH-01").kind,
    "single-auth-activity-v1",
  );
  assert.equal(
    audit.directActivitySelections.some(item => item.cutsceneId === "S1-DRAUTH-01"),
    false,
  );
  assert.deepEqual(audit.directActivitySelections, []);
  assert.equal(new Set(audit.programSelections.map(item => item.cutsceneId)).size, 58);
});
