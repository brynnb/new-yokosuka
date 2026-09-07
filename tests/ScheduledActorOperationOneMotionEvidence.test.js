import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-operation-one-motion-evidence.json",
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actor-motions.json",
  "utf8",
));

test("all operation-0x01 route states resolve through native banks", () => {
  assert.equal(evidence.summary.distinctMotionStateCount, 25);
  assert.equal(evidence.summary.occurrenceCount, 1620);
  assert.equal(evidence.summary.actorCodeCount, 171);
  assert.equal(evidence.summary.exactRegisteredMotionStateCount, 25);
  assert.equal(evidence.summary.unresolvedMotionStateCount, 0);
  assert.deepEqual(
    evidence.summary.controllerFamilyIndices,
    [0, 3, 4, 7, 8, 10, 12, 13, 15, 16, 18, 19],
  );
  assert.match(
    evidence.evidenceBoundary,
    /copies the descriptor halfword.*verbatim/s,
  );
  assert.match(
    evidence.evidenceBoundary,
    /No native entry\/loop\/exit lookup occurs/,
  );
  for (const mode of evidence.modes) {
    assert.equal(mode.status, "exact registered native route motion");
    assert.ok(mode.sequenceName);
    assert.ok(mode.durationFrames > 0);
    assert.equal(
      manifest.movementProfiles[
        mode.motionStateIdHex.replace(/^0x0+/, "0x")
      ].name,
      mode.sequenceName,
    );
  }
});

test("nonhuman and formerly omitted states use their authored sequences", () => {
  const byId = new Map(evidence.modes.map(
    (mode) => [mode.motionStateIdHex, mode],
  ));
  assert.deepEqual(
    [
      "0x8016",
      "0x803c",
      "0x80d5",
      "0x80d6",
      "0x82c6",
    ].map((id) => [
      id,
      byId.get(id).sequenceName,
      byId.get(id).controllerFamilyIndex,
    ]),
    [
      ["0x8016", "CAT_CAT_WALK_LP", 16],
      ["0x803c", "DOG_DOG_WALK_LP", 18],
      ["0x80d5", "LLY_EX_WALK_FAST_LP", 10],
      ["0x80d6", "LLY_SKIP_WALK_LP", 10],
      ["0x82c6", "SIN_KIMONO_WALK_LP_F", 15],
    ],
  );
  assert.equal(evidence.summary.nonhumanMotionStateCount, 2);
  assert.equal(Object.keys(manifest.movementProfiles).length, 25);
  assert.deepEqual(manifest.requestedNames.mbas, []);
});
