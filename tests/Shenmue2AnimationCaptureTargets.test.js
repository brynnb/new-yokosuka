import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const coverage = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-animation-coverage.json",
  import.meta.url,
), "utf8"));
const targets = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-animation-capture-targets.json",
  import.meta.url,
), "utf8"));

test("S2 missing animation families have evidence-bounded capture targets", () => {
  assert.equal(
    targets.schema,
    "new-yokosuka-shenmue2-animation-capture-targets-v1",
  );
  assert.equal(targets.summary.missingRestProfileCount, 6);
  assert.equal(targets.summary.directSourceTargetCount, 4);
  assert.equal(targets.summary.areaResourceTargetCount, 1);
  assert.equal(targets.summary.unresolvedNativeLocationCount, 1);
  assert.deepEqual(
    targets.targets.map(({ restProfile, modelCode, actorCodes }) => ({
      restProfile, modelCode, actorCodes,
    })),
    coverage.missingNativeProfileCaptureTargets.map(({
      restProfile, modelCode, actorCodes,
    }) => ({ restProfile, modelCode, actorCodes })),
  );
});

test("S2 capture targets retain source provenance without claiming activation", () => {
  const byProfile = new Map(targets.targets.map((target) => [
    target.restProfile, target,
  ]));
  assert.deepEqual(
    [...byProfile].filter(([, target]) => (
      target.acquisitionStatus === "native-location-unresolved"
    )).map(([profile]) => profile),
    ["CHA"],
  );
  assert.equal(byProfile.has("BBY"), false);
  assert.equal(byProfile.has("MEI"), false);
  assert.equal(byProfile.has("SYE"), false);
  assert.equal(byProfile.has("WON"), false);
  assert.equal(byProfile.get("HGN").sourceCandidates[0].source,
    "scene/03/npc/NPC_Q300.BIN");
  assert.ok(targets.targets.every((target) => target.sourceCandidates.every(
    (candidate) => candidate.sourceSha256 && candidate.firstOffsets.length,
  )));
  assert.match(targets.evidenceBoundary.join(" "), /does not prove/i);
  assert.match(targets.evidenceBoundary.join(" "), /synchronized Dreamcast RAM/i);
});
