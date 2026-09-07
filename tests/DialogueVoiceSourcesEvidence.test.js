import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-voice-sources.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("actor dialogue voice sources are content verified across discs", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-dialogue-voice-source-evidence-v1",
  );
  assert.equal(evidence.summary.actorVoiceIdCount, 22_397);
  assert.equal(evidence.summary.matchedVoiceIdCount, 21_322);
  assert.equal(evidence.summary.unmatchedVoiceIdCount, 1_075);
  assert.equal(evidence.summary.unreachableUnmatchedVoiceIdCount, 13);
  assert.equal(
    evidence.summary.unlocalizedResourceUnmatchedVoiceIdCount,
    1_062,
  );
  assert.equal(evidence.summary.actionableUnmatchedVoiceIdCount, 0);
  assert.equal(evidence.unlocalizedResources.length, 18);
  assert.deepEqual(
    evidence.unreachableUnmatchedVoices.map(({ voiceId }) => voiceId),
    [
      "F1070B001",
      "F1070B002",
      "F1070B003",
      "F1070B004",
      "F1070B005",
      "F1070B006",
      "F1070B007",
      "F1216B001",
      "F1216B002",
      "F1216B003",
      "F1216B004",
      "F1216B005",
      "F1216B006",
    ],
  );
  assert.equal(evidence.summary.duplicateSourceOccurrenceCount, 7_433);
  assert.equal(evidence.summary.contentVariantVoiceIdCount, 0);
  assert.equal(evidence.contentVariants.length, 0);
  assert.equal(
    evidence.summary.contentAddressedNativeByteLength,
    336_453_472,
  );
});
