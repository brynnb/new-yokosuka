import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-actor-entry-routes.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("actor entry routes reproduce the verified native selector", () => {
  assert.equal(evidence.summary.resourceCount, 262);
  assert.equal(evidence.summary.uniqueActorCodeCount, 257);
  assert.ok(evidence.summary.graphNodeCount > 40_000);
  assert.ok(evidence.summary.entryMarkerCount > 1_000);
  assert.ok(evidence.summary.uniqueExpressionCount > 200);
  assert.deepEqual(
    Object.keys(evidence.summary.terminationCounts),
    ["nativeNullReturn"],
  );
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /does not linearly reinterpret embedded entry bodies/,
  );
});

test("BOB entry routing converges under four expression results", () => {
  const bob = evidence.examples.find(({ actorCode }) => actorCode === "BOB_");
  assert.equal(bob.routingStartOffset, "0x68");
  assert.equal(bob.routingEndOffsetExclusive, "0xe4");
  assert.equal(bob.entryMarkerCount, 1);
  assert.equal(bob.entryStateVariantCount, 4);
  assert.equal(bob.entries[0].markerOffset, "0x8f");
  assert.equal(bob.entries[0].bodyOffset, "0x91");
  assert.equal(bob.entries[0].bodyByteLength, 77);
});
