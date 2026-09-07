import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-predicate-routes.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("predicate corpus exposes exact coverage without hiding gaps", () => {
  assert.equal(evidence.summary.mapinfoCount, 64);
  assert.ok(evidence.summary.predicateRouteCount > 500);
  assert.ok(evidence.summary.fullyResolvedPredicateRouteCount > 0);
  assert.ok(evidence.summary.routeWithExactSpatialTriggerCount > 0);
  assert.ok(evidence.summary.functionStatusCounts["fixed-point-cyclic"] > 0);
  assert.ok(evidence.summary.functionStatusCounts["state-limit"] > 0);
  assert.equal(evidence.summary.functionStatusCounts["cyclic-cfg"], undefined);
});

test("verified Hato route preserves its compound native gate", () => {
  const [route] = evidence.verifiedAnchors;
  assert.equal(route.disc, 1);
  assert.equal(route.area, "D000");
  assert.equal(route.callFileOffset, "0x7ac72");
  assert.equal(route.containsOpaqueTerm, false);
  assert.equal(route.spatialTriggers[0].spatialRecordIndex, 5);
  assert.deepEqual(route.dialogueDescendants[0].actorTags, ["HATO"]);

  const encoded = JSON.stringify(route.predicate);
  assert.match(encoded, /"operationHex":"0x0051"/);
  assert.match(encoded, /"fieldOffset":"0x84"/);
  assert.match(encoded, /"fieldOffset":"0xcc"/);
});
