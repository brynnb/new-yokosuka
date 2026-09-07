import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../tools/evidence/enemy-battle-manifest.json" with {
  type: "json",
};

test("enemy battle evidence decodes all Disc 3 MFBT enemy programs", () => {
  assert.equal(manifest.totals.files, 20);
  assert.ok(manifest.totals.dispatchEntries > 100);
  assert.ok(manifest.totals.confirmedDispatchTargets >= 40);
  assert.ok(manifest.totals.motionCandidates > 100);
});

test("enemy dispatch offsets resolve to self-identifying code labels", () => {
  const zako = manifest.files.find((file) => file.file === "EN_ZAKO1.BIN");
  assert.ok(zako);
  assert.deepEqual(zako.header.sectionOffsets, [
    "0x00000014",
    "0x0000025c",
    "0x00000364",
    "0x00000532",
  ]);
  assert.equal(zako.dispatch.entries[0].key, "0x000001");
  assert.equal(zako.dispatch.entries[0].target, "0x00000040");
  assert.equal(zako.dispatch.entries[0].targetHasMatchingLabel, true);
});
