import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-linked-interaction-evidence.json",
  "utf8",
));

test("operation 0x18 source records retain exact timed interaction payloads", () => {
  assert.equal(evidence.summary.sourceOperationCount, 15);
  assert.equal(evidence.summary.sourceActorCodeCount, 10);
  assert.equal(evidence.summary.sourceTargetCodeCount, 9);
  assert.equal(evidence.summary.sourceRelativeDurationOperationCount, 1);
  assert.equal(evidence.summary.sourceAbsoluteTargetOperationCount, 14);
  for (const operation of evidence.sourceOperations) {
    assert.match(operation.targetCode, /^[A-Z0-9]{4}$/);
    assert.equal(operation.interactionMotionStateIds.length, 3);
    assert.equal(operation.interactionControlValues.length, 4);
    assert.ok(operation.interactionMotionStateIds.every(Number.isInteger));
    if (operation.targetTimeMode === "relative duration") {
      assert.ok(operation.timeControlValue <= 0);
      assert.equal(
        operation.relativeDurationSeconds,
        -operation.timeControlValue,
      );
    } else {
      assert.ok(operation.timeControlValue > 0);
      assert.equal(
        operation.absoluteTargetSecond,
        operation.timeControlValue,
      );
    }
  }
});

test("active operation 0x18 actors join exact source and target records", () => {
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.relevantCaptureCount, 249);
  assert.equal(evidence.summary.runtimeActorObservationCount, 2147);
  assert.equal(evidence.summary.activeRuntimeObservationCount, 1573);
  assert.equal(
    evidence.summary.exactActiveSourceOperationObservationCount,
    1573,
  );
  assert.equal(evidence.summary.unmatchedActiveRuntimeObservationCount, 0);
  assert.equal(evidence.summary.validTargetBindingObservationCount, 1569);
  assert.equal(
    evidence.summary.transientInvalidTargetBindingObservationCount,
    4,
  );
  assert.equal(evidence.summary.exactTargetTimeRuleObservationCount, 1573);
  assert.equal(evidence.summary.subtypeOneTargetBindingObservationCount, 1118);
  assert.equal(
    evidence.summary.subtypeThreeTargetBindingObservationCount,
    451,
  );
  assert.equal(evidence.summary.actorResolutionErrorCount, 0);
  for (const observation of evidence.activeObservations) {
    assert.equal(observation.sourceMatchCount, 1);
    assert.equal(observation.targetTimeMatchesSourceRule, true);
    assert.equal(
      observation.targetRegistryCode,
      observation.exactSourceOperation.targetCode,
    );
    if (!observation.targetBindingValid) continue;
    assert.equal(
      observation.registeredTargetSubtype,
      observation.targetObjectSubtype,
    );
    assert.ok([1, 3].includes(observation.targetObjectSubtype));
    assert.ok(
      observation.targetWindowStartSecond
        < observation.targetWindowEndSecond,
    );
  }
});

test("operation 0x18 target subtype/window bindings are unanimous", () => {
  assert.equal(evidence.targetBindings.length, 9);
  assert.deepEqual(
    evidence.targetBindings.map((binding) => binding.targetCode),
    [
      "DBEN",
      "FANY",
      "MBEN",
      "NIKU",
      "PANN",
      "SPRT",
      "UOKT",
      "YAKU",
      "YAO1",
    ],
  );
  assert.equal(
    evidence.targetBindings.reduce(
      (count, binding) => count + binding.observationCount,
      0,
    ),
    1569,
  );
  assert.deepEqual(
    Object.fromEntries(evidence.targetBindings.map(
      (binding) => [binding.targetCode, binding.targetSubtype],
    )),
    {
      DBEN: 3,
      FANY: 3,
      MBEN: 3,
      NIKU: 1,
      PANN: 1,
      SPRT: 1,
      UOKT: 1,
      YAKU: 1,
      YAO1: 1,
    },
  );
  assert.equal(evidence.nativeEvidence.handlerAddress, "0x0c0f9812");
  assert.equal(
    evidence.nativeEvidence.subtypeOneHandlerAddress,
    "0x0c0f8ec0",
  );
  assert.equal(
    evidence.nativeEvidence.subtypeThreeHandlerAddress,
    "0x0c0f6b38",
  );
  assert.equal(
    evidence.nativeEvidence.actorOperationPointerOffset,
    "0xd8",
  );
});
