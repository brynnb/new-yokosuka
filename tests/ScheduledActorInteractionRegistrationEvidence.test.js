import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-interaction-registration-evidence.json",
  "utf8",
));
const browserManifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));

test("operation 0x17 source registrations retain exact interaction payloads", () => {
  assert.equal(evidence.summary.sourceOperationCount, 333);
  assert.equal(evidence.summary.sourceActorCodeCount, 78);
  assert.equal(evidence.summary.sourceTargetCodeCount, 25);
  assert.equal(evidence.summary.sourceRelativeDurationOperationCount, 258);
  assert.equal(evidence.summary.sourceAbsoluteTargetOperationCount, 75);
  assert.equal(evidence.summary.sourceZeroTimeOperationCount, 0);
  assert.deepEqual(evidence.summary.sourceInteractionModeCounts, {
    "1": 66,
    "2": 62,
    "3": 105,
    "4": 4,
    "5": 56,
    "6": 1,
    "10": 6,
    "-3": 17,
    "-1": 16,
  });
  for (const operation of evidence.sourceOperations) {
    assert.match(operation.targetCode, /^[A-Z0-9]{4}$/);
    assert.equal(operation.runtimePosition.length, 3);
    assert.ok(operation.runtimePosition.every(Number.isFinite));
    assert.equal(operation.controlValues.length, 7);
    assert.ok(operation.controlValues.every(Number.isInteger));
    assert.equal(
      operation.interactionModeSigned,
      operation.interactionMode > 0x7fffffff
        ? operation.interactionMode - 0x100000000
        : operation.interactionMode,
    );
  }
});

test("active operation 0x17 actors join their exact registrations", () => {
  assert.equal(evidence.summary.uniqueCaptureCount, 552);
  assert.equal(evidence.summary.relevantCaptureCount, 325);
  assert.equal(evidence.summary.runtimeActorObservationCount, 17768);
  assert.equal(evidence.summary.activeRuntimeObservationCount, 783);
  assert.equal(
    evidence.summary.exactActiveSourceOperationObservationCount,
    783,
  );
  assert.equal(evidence.summary.unmatchedActiveRuntimeObservationCount, 0);
  assert.equal(evidence.summary.exactRegistrationPointerObservationCount, 783);
  assert.equal(evidence.summary.exactTargetRegistryCodeObservationCount, 783);
  assert.deepEqual(evidence.summary.activeTargetSubtypeCounts, {
    "0": 127,
    "1": 654,
    "3": 2,
  });
  assert.equal(evidence.summary.actorResolutionErrorCount, 57);
  for (const observation of evidence.activeObservations) {
    assert.equal(observation.sourceMatchCount, 1);
    assert.equal(observation.registrationPointerMatchesOperation, true);
    assert.equal(observation.targetRegistryCodeMatchesSource, true);
    assert.equal(
      observation.targetRegistryCode,
      observation.exactSourceOperation.targetCode,
    );
    assert.ok([0, 1, 3].includes(observation.registeredTargetSubtype));
  }
});

test("native operation 0x17 lifecycle distinguishes registration and activation", () => {
  assert.equal(evidence.nativeEvidence.recordByteLength, 0x38);
  assert.equal(evidence.nativeEvidence.widthHandlerAddress, "0x0c0f9566");
  assert.equal(evidence.nativeEvidence.initializerAddress, "0x0c0f956a");
  assert.equal(evidence.nativeEvidence.updateAddress, "0x0c0f9630");
  assert.equal(
    evidence.nativeEvidence.descriptorHandlerAddress,
    "0x0c0f96d0",
  );
  assert.equal(
    evidence.nativeEvidence.activePredicateAddress,
    "0x0c0f987c",
  );
  assert.equal(
    evidence.nativeEvidence.descriptorBehavior,
    "set continuation flag and advance synchronously",
  );
  assert.equal(evidence.nativeEvidence.actorRegistrationPointerOffset, "0xa4");
  assert.equal(evidence.nativeEvidence.actorOperationPointerOffset, "0xd8");
  assert.deepEqual(evidence.nativeEvidence.subtypeInitializers, {
    "0": "0x0c0f7bda",
    "1": "0x0c0f8464",
    "3": "0x0c0f5d5e",
  });
});

test("browser schedules expose all synchronous interaction registrations", () => {
  const operations = browserManifest.actors.flatMap(
    (actor) => actor.scheduleVariants,
  ).flatMap(
    (variant) => variant.journeys,
  ).flatMap(
    (journey) => journey.operations,
  ).filter(
    (operation) => operation.operation === 0x17,
  );
  assert.equal(
    browserManifest.summary.interactionRegistrationOperationCount,
    333,
  );
  assert.equal(
    browserManifest.summary.interactionRegistrationActorCodeCount,
    78,
  );
  assert.equal(
    browserManifest.summary
      .exactActiveInteractionRegistrationObservationCount,
    783,
  );
  assert.equal(
    browserManifest.summary
      .exactActiveInteractionRegistrationPointerObservationCount,
    783,
  );
  assert.equal(operations.length, 333);
  for (const operation of operations) {
    assert.match(operation.targetCode, /^[A-Z0-9]{4}$/);
    assert.ok(Number.isInteger(operation.interactionModeSigned));
    assert.ok(Number.isFinite(operation.descriptorRegistrationSecond));
    assert.equal(operation.runtimePosition.length, 3);
    assert.equal(operation.browserPosition.length, 3);
    assert.equal(operation.controlValues.length, 7);
    assert.equal(
      operation.interactionRegistrationEvidence.descriptorBehavior,
      "synchronous registration; externally activated",
    );
    assert.equal(
      operation.descriptorRegistrationSecond,
      operation.descriptorActivationSecond,
    );
  }
});
