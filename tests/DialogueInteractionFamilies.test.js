import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-interaction-families.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("all recovered dialogue functions have a structural family", () => {
  assert.equal(evidence.summary.candidateCount, 1285);
  assert.equal(evidence.summary.classifiedCandidateCount, 1278);
  assert.equal(evidence.summary.missingFunctionCount, 7);
  assert.equal(evidence.summary.familyCount, 276);
});

test("family evidence does not promote missing trigger ownership", () => {
  assert.equal(
    evidence.summary.branchExclusiveTriggerCandidateCount,
    1,
  );
  assert.ok(evidence.summary.recurringFamilyCount > 0);
  assert.ok(evidence.summary.candidateInRecurringFamilyCount > 0);
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /does not fill the still-missing trigger boundary|not a playable-dialogue catalog/i,
  );
});
