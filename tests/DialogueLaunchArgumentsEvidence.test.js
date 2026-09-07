import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-launch-arguments.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("native wrapper arguments are recovered without inferred ownership", () => {
  assert.equal(evidence.summary.mapCount, 64);
  assert.equal(evidence.summary.candidateLaunchCount, 1293);
  assert.ok(evidence.summary.launchWithAllChildArgumentsExactCount > 0);
  assert.ok(
    evidence.summary.launchWithAnyExactUpstreamContextArgumentCount > 0,
  );
  assert.equal(evidence.summary.exactFourCharacterArgumentCounts.TEL0, 3);
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /does not yet assert whether that argument names the clicked object/i,
  );
});
