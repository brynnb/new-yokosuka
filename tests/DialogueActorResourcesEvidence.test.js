import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  fs.readFileSync(
    new URL(
      "../tools/evidence/dialogue-actor-resources.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("actor dialogue resources follow the exact native package join", () => {
  const join = evidence.executableEvidence.provenJoin;
  assert.equal(join.actorPackageHandleOffset, "0x8c");
  assert.equal(join.resourceType, "BIN ");
  assert.equal(join.storedRuntimeActorOffset, "0x9c");
  assert.equal(evidence.summary.resourceCount, 262);
  assert.equal(evidence.summary.uniqueActorCodeCount, 257);
  assert.equal(
    evidence.summary.scheduledActorCodeWithConversationResourceCount,
    210,
  );
  assert.equal(evidence.summary.messageEntryCount, 28049);
  assert.equal(evidence.summary.uniqueVoiceIdCount, 22397);
  assert.equal(evidence.summary.voiceLocalCodeSuffixMismatchCount, 0);
  assert.equal(evidence.summary.participantFacingTargetResourceCount, 34);
  assert.equal(evidence.summary.participantFacingTargetCount, 65);
  assert.equal(
    evidence.summary.subtitleInventoryMatchedMessageEntryCount,
    26878,
  );
});

test("authored person identity remains distinct from resource actor code", () => {
  const jono = evidence.resources.find(({ actorCode }) => actorCode === "JONO");
  const mtri = evidence.resources.find(({ actorCode }) => actorCode === "MTRI");
  const akmi = evidence.resources.find(({ actorCode }) => actorCode === "AKMI");
  assert.equal(jono.authoredPersonIdentity, "YOPA");
  assert.equal(mtri.authoredPersonIdentity, "YOPA");
  assert.equal(akmi.authoredPersonIdentity, "AKMI");
  assert.deepEqual(akmi.participantFourccs, ["AKIR", "AKMI"]);
  assert.deepEqual(akmi.participantFacingTargets, []);
  const aksk = evidence.resources.find(({ actorCode }) => actorCode === "AKSK");
  assert.equal(aksk.participantFacingTargets.length, 3);
  assert.deepEqual(aksk.participantFacingTargets[0], [6, 1.5, 86]);
  assert.equal(akmi.messageCount, 190);
  assert.equal(akmi.messageExamples[0].voiceId, "F1015B001");
  assert.equal(akmi.messageExamples[0].localCode, "B001");
  assert.equal(
    akmi.messageExamples[0].sourceText,
    "明美「Oh, look who's here!」",
  );
  assert.match(
    evidence.evidenceBoundary.join(" "),
    /No display-name, model-name, proximity, schedule-time, or per-NPC heuristic/,
  );
});
