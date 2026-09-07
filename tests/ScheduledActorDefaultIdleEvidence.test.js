import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-default-idle-evidence.json",
  "utf8",
));

test("native resident actors expose byte-stable default-idle tables", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.validRegistryCaptureCount, 476);
  assert.equal(evidence.summary.invalidRegistryCaptureCount, 0);
  assert.equal(evidence.summary.residentRecordObservationCount, 38780);
  assert.equal(evidence.summary.actorCodeCount, 249);
  assert.equal(evidence.summary.byteStableActorCodeCount, 249);
  assert.equal(evidence.summary.varyingActorCodeCount, 0);
  assert.equal(evidence.summary.exactRegisteredDefaultMotionCount, 226);
  assert.equal(evidence.summary.zeroDefaultMotionCount, 23);
  assert.equal(evidence.summary.unresolvedNonzeroDefaultMotionCount, 0);
  assert.equal(evidence.summary.exactRegisteredCandidateCount, 904);
  assert.equal(evidence.summary.zeroCandidateCount, 92);
  assert.equal(evidence.summary.unresolvedNonzeroCandidateCount, 0);
});

test("every actor definition has exactly one observed candidate table", () => {
  for (const actor of evidence.actors) {
    assert.equal(
      actor.status,
      "byte-stable exact native default-idle table",
    );
    assert.equal(actor.distinctCandidateTableCount, 1);
    assert.ok(Number.isInteger(actor.exactDefaultMotionStateId));
    assert.ok([
      "exact registered M_MOBJ motion",
      "zero/unassigned native motion state",
    ].includes(actor.exactDefaultMotion.status));
    assert.equal(actor.exactCandidateMotionIds.length, 4);
    assert.equal(actor.candidateVariants.length, 1);
    assert.equal(actor.candidateVariants[0].candidates.length, 4);
    assert.ok(actor.observationCount > 0);
    for (const candidate of actor.candidateVariants[0].candidates) {
      assert.ok([
        "exact registered M_MOBJ motion",
        "zero/unassigned native motion state",
      ].includes(candidate.status));
    }
  }
});

test("operation-0x09 default motion is separate from random route idles", () => {
  const actor = evidence.actors.find(
    (candidate) => candidate.actorCode === "AKMI",
  );
  assert.equal(actor.exactDefaultMotionStateId, 0x8202);
  assert.equal(actor.exactDefaultMotion.sequenceName, "SYP_TATI_LP_F");
  assert.equal(
    evidence.nativeEvidence.operation09LifecycleResetAddress,
    "0x0c11ee08",
  );
  assert.equal(
    evidence.nativeEvidence.actorDefinitionDefaultMotionOffset,
    "0x7c",
  );
});

test("operation-0x35 default actors join their authored idle domains", () => {
  const expected = {
    ECHO: [0x8144, 0x8150, 0x8150, 0x8144],
    GRKN: [0x80bb, 0x8150, 0x80b4, 0x80bb],
    JONO: [0x8144, 0x8150, 0x8150, 0x8144],
    MIKI: [0x8204, 0x81b8, 0x82e0, 0x82df],
    RINS: [0x80b5, 0x80b5, 0x80b5, 0x80b5],
    YOPA: [0x80bb, 0x8150, 0x80b4, 0x80bb],
    YUMM: [0x8204, 0x81b8, 0x82e0, 0x82df],
  };
  for (const [actorCode, candidateMotionIds] of Object.entries(expected)) {
    const actor = evidence.actors.find(
      (candidate) => candidate.actorCode === actorCode,
    );
    assert.deepEqual(actor.exactCandidateMotionIds, candidateMotionIds);
  }
});
