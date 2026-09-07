import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-subordinate-evidence.json",
  "utf8",
));

test("operation-0x16 live subordinate evidence uses exact source joins", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureHashCount, 476);
  assert.equal(evidence.summary.sourceOperation16OccurrenceCount, 116);
  assert.equal(evidence.summary.captureWithActiveOperation16Count, 249);
  assert.equal(
    evidence.summary.exactActiveOperation16ObservationCount,
    1376,
  );
  assert.equal(evidence.summary.actorRecordNotUniqueCount, 0);
  assert.equal(evidence.summary.sourceOperationPointerUnmatchedCount, 0);
  assert.equal(evidence.summary.sourceOperationPointerAmbiguousCount, 0);
  assert.equal(evidence.summary.exactSchedulerClockObservationCount, 1376);

  for (const observation of evidence.observations) {
    assert.equal(observation.actorCurrentOperation, 0x16);
    assert.equal(observation.sourcePointerExactMatch, true);
    assert.equal(observation.nextOperationEndExactMatch, true);
    assert.match(observation.actorCode, /^[A-Z0-9]{4}$/);
    assert.match(
      observation.sourceNormalizedByteSha256,
      /^[a-f0-9]{64}$/,
    );
    assert.match(observation.targetCode, /^[A-Z0-9]{4}$/);
    assert.ok(Number.isInteger(observation.operationOffsetFromProgramHeader));
    assert.ok(observation.operationOffsetFromProgramHeader >= 0);
    assert.equal(
      observation.schedulerClock.status,
      "exact-scheduler-clock-second",
    );
  }
});

test("live controller fields preserve exact observed subordinate phases", () => {
  assert.deepEqual(evidence.summary.controllerStateCounts, {
    1: 5,
    5: 1363,
    10: 8,
  });
  assert.deepEqual(evidence.summary.currentNestedOperationCounts, {
    0: 171,
    2: 8,
    7: 809,
    16: 1,
    17: 1,
    26: 373,
    33: 13,
  });
  assert.deepEqual(evidence.summary.subordinateCursorStatusCounts, {
    null: 5,
    "record-start": 1008,
    terminator: 363,
  });
  assert.deepEqual(evidence.summary.currentRecordStatusCounts, {
    "current-record-not-resolved": 13,
    "cursor-follows-current-record": 1192,
    "no-current-nested-operation": 171,
  });
  assert.equal(
    evidence.nativeEvidence.actorSubordinateCursorOffset,
    "0x1dc",
  );

  const sourceRecordPhases = evidence.observations.filter(
    (observation) => (
      observation.currentRecord.status
      === "cursor-follows-current-record"
    ),
  );
  assert.equal(sourceRecordPhases.length, 1192);
  for (const observation of sourceRecordPhases) {
    assert.equal(
      observation.currentRecord.operation,
      observation.currentNestedOperation,
    );
    assert.equal(
      observation.currentRecord.recordIndex,
      observation.subordinateIndex,
    );
  }
});

test("negative activation and nested waits remain separate clock domains", () => {
  assert.equal(evidence.summary.negativeActivationObservationCount, 176);
  const negative = evidence.observations.filter(
    (observation) => observation.sourceActivationSecond < 0,
  );
  for (const observation of negative) {
    assert.equal(
      observation.inferredInitializationSecond,
      observation.targetSecond + observation.sourceActivationSecond,
    );
    assert.equal(
      observation.initializationAgeSeconds,
      observation.schedulerClock.second
        - observation.inferredInitializationSecond,
    );
  }

  assert.equal(evidence.summary.currentWaitObservationCount, 809);
  const waits = evidence.observations.filter(
    (observation) => observation.currentNestedOperation === 0x07,
  );
  assert.ok(waits.some(
    (observation) => observation.waitDeadlineDeltaSeconds === 5,
  ));
  assert.ok(waits.some(
    (observation) => observation.waitDeadlineDeltaSeconds >= 3000,
  ));
  for (const observation of waits) {
    assert.equal(
      observation.currentRecord.status,
      "cursor-follows-current-record",
    );
    assert.equal(observation.currentRecord.operation, 0x07);
  }
  assert.match(
    evidence.nativeEvidence.descriptorGateRule,
    /journeyStartSecond \+ 300/,
  );
  assert.match(
    evidence.nativeEvidence.negativeTargetInitializationRule,
    /schedulerSecondAtInitialization/,
  );
});
