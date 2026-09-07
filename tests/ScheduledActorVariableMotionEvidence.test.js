import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidencePath = (
  "tools/evidence/scheduled-actor-variable-motion-evidence.json"
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

test("operation 0x22 source motion arrays have exact owned boundaries", () => {
  assert.equal(evidence.summary.sourceOperationCount, 53);
  assert.equal(evidence.summary.sourceActorCodeCount, 19);
  assert.equal(evidence.summary.sourceRelativeDurationOperationCount, 27);
  assert.equal(evidence.summary.sourceAbsoluteTargetOperationCount, 26);
  assert.equal(evidence.summary.distinctSourceCandidateArrayCount, 53);
  assert.equal(evidence.summary.sourceMotionCandidateRecordCount, 155);
  assert.equal(evidence.summary.sourceUnanimousMotionStateOperationCount, 8);
  assert.equal(evidence.summary.sourceRandomMotionStateOperationCount, 45);
  assert.equal(evidence.summary.exactSourceCandidateArrayCount, 53);

  for (const operation of evidence.sourceOperations) {
    assert.equal(
      operation.motionCandidateDecodeStatus,
      "exact owned sentinel-terminated 16-byte candidate array",
    );
    assert.equal(
      operation.motionCandidates.length,
      operation.motionCandidateCount,
    );
    assert.ok(operation.motionCandidateCount >= 1);
    assert.ok(operation.motionCandidateCount <= 5);
    assert.equal(operation.motionCandidateTerminator.value, "0xffffffff");
    assert.deepEqual(
      operation.uniqueMotionStateIds,
      [...new Set(operation.motionCandidates.map(
        (candidate) => candidate.motionStateId,
      ))].sort((left, right) => left - right),
    );
    if (operation.uniqueMotionStateIds.length === 1) {
      assert.equal(
        operation.deterministicMotionStateId,
        operation.uniqueMotionStateIds[0],
      );
      assert.match(
        operation.motionStateSelectionStatus,
        /RNG-independent/,
      );
    } else {
      assert.equal(operation.deterministicMotionStateId, null);
      assert.match(operation.motionStateSelectionStatus, /random/);
    }
    for (const [index, candidate] of operation.motionCandidates.entries()) {
      assert.equal(candidate.recordIndex, index);
      assert.equal(candidate.byteLength, 16);
      assert.equal(candidate.rawBytes.length, 32);
      assert.ok(Number.isInteger(candidate.motionStateId));
      assert.ok(Number.isFinite(candidate.motionControlFloat));
      assert.match(candidate.motionWord, /^0x[0-9a-f]{8}$/);
      assert.match(candidate.motionControlFlags, /^0x[0-9a-f]{8}$/);
    }
  }
});

test("active operation 0x22 actors join exact source candidates", () => {
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.relevantCaptureCount, 249);
  assert.equal(evidence.summary.runtimeActorObservationCount, 2474);
  assert.equal(evidence.summary.activeRuntimeObservationCount, 558);
  assert.equal(
    evidence.summary.exactActiveSourceOperationObservationCount,
    558,
  );
  assert.equal(evidence.summary.unmatchedActiveRuntimeObservationCount, 0);
  assert.equal(evidence.summary.exactCandidateCountObservationCount, 558);
  assert.equal(
    evidence.summary
      .selectedIndexWithinSourceCandidatesObservationCount,
    558,
  );
  assert.equal(evidence.summary.exactSelectedMotionObservationCount, 558);
  assert.equal(evidence.summary.exactTargetTimeRuleObservationCount, 558);
  assert.equal(evidence.summary.activeBeforeTargetObservationCount, 556);
  assert.equal(evidence.summary.activeAtOrAfterTargetObservationCount, 2);
  assert.equal(evidence.summary.actorResolutionErrorCount, 5);

  for (const observation of evidence.activeObservations) {
    assert.equal(observation.sourceMatchCount, 1);
    assert.equal(observation.candidateCountMatchesSource, true);
    assert.equal(observation.selectedIndexWithinSourceCandidates, true);
    assert.equal(observation.selectedMotionMatchesSourceCandidate, true);
    assert.equal(observation.targetTimeMatchesSourceRule, true);
    assert.equal(
      observation.selectedMotionStateId,
      observation.exactSourceOperation.selectedCandidate.motionStateId,
    );
  }
});

test("operation 0x22 native field offsets are executable-backed", () => {
  assert.deepEqual(evidence.nativeEvidence, {
    extensionDispatcherAddress: "0x0c0f5b28",
    handlerAddress: "0x0c0f90f2",
    initializerAddress: "0x0c0f8f48",
    updateAddress: "0x0c0f8f8c",
    actorCurrentOperationOffset: "0x04",
    actorMotionStateOffset: "0x06",
    actorOperationPointerOffset: "0xac",
    actorTargetSecondOffset: "0xcc",
    actorSelectedIndexOffset: "0xd0",
    actorCandidateCountOffset: "0xd4",
    candidateStrideBytes: 16,
    candidateSentinel: "0xffffffff",
    relativeTargetRule: "invocationClockSecond - timeControlValue",
    absoluteTargetRule: "timeControlValue",
    initialSelectedCandidateIndex: 0,
    subsequentSelectionRule: (
      "(currentIndex + 1 + random15 % "
      + "(current.selectionAdvanceControl + 1)) % candidateCount"
    ),
    selectionAdvanceControlCandidateOffset: "0x0c",
    randomCallLiteralAddress: "0x0c0f9120",
    signedRemainderCallLiteralAddress: "0x0c0f9124",
    signedRemainderFunctionAddress: "0x0c1dc440",
    randomFunctionAddress: "0x0c1ce1f0",
    randomSeedAddress: "0x0c2a1d58",
    randomInitialSeed: 1,
    randomRecurrence: (
      "seed = (seed * 0x41c64e6d + 0x00003039) modulo 2^32"
    ),
    randomOutputRule: "(seed >>> 16) & 0x7fff",
    randomSharedProcessWide: true,
  });
});
