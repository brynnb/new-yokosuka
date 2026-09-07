import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coverage = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-interaction-coverage.json",
  "utf8",
));

test("accounts for every final Dobuita placement without hiding fallbacks", () => {
  assert.equal(coverage.summary.placementCount, 154);
  assert.equal(coverage.placements.length, 154);
  assert.equal(coverage.summary.browserImplementedCount, 154);
  assert.equal(coverage.summary.unclassifiedCount, 0);
  assert.equal(
    coverage.summary.exactNativeSemanticsCount
      + coverage.summary.unresolvedPlacementCount,
    coverage.summary.placementCount,
  );
});

test("keeps unresolved native routes explicit", () => {
  assert.equal(coverage.summary.pairedNode7UnresolvedDoorCount, 0);
  assert.equal(coverage.summary.pairedNode7ResolvedDoorCount, 15);
  assert.equal(coverage.summary.gameplayFixtureFallbackCount, 0);
  assert.equal(coverage.summary.sourceNativeInteractionCount, 11);
  assert.equal(coverage.summary.dynamicTkoUnresolvedCount, 2);
  assert.equal(coverage.summary.dynamicTrafficUnresolvedCount, 3);
  assert.equal(coverage.summary.unresolvedPlacementCount, 19);
  assert.ok(coverage.unresolved.every(
    (placement) => placement.unresolved.length > 0,
  ));
  const traffic = coverage.unresolved.filter(
    (placement) => placement.role === "state-dependent-traffic-actor",
  );
  assert.deepEqual(
    traffic.map((placement) => placement.objectTag),
    ["BUS_", "CAR7", "BUSS"],
  );
  assert.ok(traffic.filter(
    (placement) => placement.objectTag !== "CAR7",
  ).every(
    (placement) => (
      placement.browserInteraction
        .startsWith("click to replay the exact AUTH AMOV route")
    ),
  ));
  assert.equal(
    traffic.find(
      (placement) => placement.objectTag === "CAR7",
    ).browserInteraction,
    "exact captured inactive pose below the map",
  );
});
