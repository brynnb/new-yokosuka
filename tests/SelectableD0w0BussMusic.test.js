import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/selectable-d0w0-buss-music.json", "utf8",
));

test("D0W0 and BUSS music policy follows exact owner boundaries", () => {
  assert.deepEqual(evidence.summary, {
    selectorEntryCount: 16,
    explicitBgmCount: 0,
    ambientRoomInheritanceCount: 12,
    authoredSilenceCount: 4,
  });
  assert.deepEqual(
    evidence.variants.filter(value => value.resource === "D0W0").map(value => value.classification),
    Array(12).fill("ambient-room-inheritance"),
  );
  assert.deepEqual(
    evidence.variants.filter(value => value.resource === "BUSS").map(value => value.classification),
    Array(4).fill("authored-silence"),
  );
  assert.equal(evidence.ownerEvidence.d0w0.ownerSoundCalls.length, 0);
  assert.ok(evidence.ownerEvidence.d0w0.roomAudioCalls.every(
    value => ["a83f0000", "a0040000"].includes(value.commandHex),
  ));
  assert.ok(evidence.ownerEvidence.buss.ownerSoundCalls.every(
    value => value.commandHex === "a00a0000",
  ));
  assert.equal(evidence.ownerEvidence.buss.postArrivalRoomResume.roomAudioCall, "0x8dc32");
});

test("no unproven package BGM was added to D0W0 or BUSS", () => {
  const packages = fs.readFileSync("play/cutscenes/nativeCutscenePackages.js", "utf8");
  for (const packageId of ["d0w0", "buss"]) {
    const start = packages.indexOf(`id: "${packageId}"`);
    const end = packages.indexOf("\n  Object.freeze({", start + 1);
    const definition = packages.slice(start, end < 0 ? packages.length : end);
    assert.ok(start >= 0);
    assert.doesNotMatch(definition, /music:\s*Object\.freeze/);
  }
});
