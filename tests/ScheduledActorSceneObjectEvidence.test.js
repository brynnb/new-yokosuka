import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { scheduledDescriptorState } from "../tools/lib/ScheduledActorOfflineRuntime.js";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-scene-object-evidence.json",
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));

test("operation 0x2a has exact linked scene-object transition semantics", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.relevantCaptureCount, 249);
  assert.equal(evidence.summary.sourceOperationCount, 41);
  assert.equal(evidence.summary.sourceActorCodeCount, 19);
  assert.equal(evidence.summary.distinctSceneObjectCodeCount, 16);
  assert.equal(evidence.summary.sourceControlZeroCount, 21);
  assert.equal(evidence.summary.sourceControlOneCount, 20);
  assert.equal(evidence.summary.invalidSourceControlCount, 0);
  assert.equal(evidence.summary.runtimeActorObservationCount, 3566);
  assert.equal(evidence.summary.activeRuntimeObservationCount, 4);
  assert.equal(
    evidence.summary.exactActiveSourceOperationObservationCount,
    4,
  );
  assert.equal(evidence.summary.unmatchedActiveRuntimeObservationCount, 0);
  assert.equal(evidence.summary.actorResolutionErrorCount, 0);
  assert.equal(evidence.nativeEvidence.handlerAddress, "0x0c0f9efa");
  assert.equal(
    evidence.nativeEvidence.sceneObjectStateHandlerAddress,
    "0x0c0f9c90",
  );
  assert.equal(evidence.nativeEvidence.actorObjectCodeOffset, "0xc8");
  assert.equal(evidence.nativeEvidence.actorControlOffset, "0xd4");
  assert.equal(
    evidence.nativeEvidence.transitionModeRule,
    "sceneObjectControlValue + 4",
  );
});

test("every active runtime transition joins one exact source operation", () => {
  assert.equal(evidence.activeObservations.length, 4);
  for (const observation of evidence.activeObservations) {
    assert.equal(observation.sourceMatchCount, 1);
    assert.equal(
      observation.status,
      "exact active source operation-0x2a scene-object transition",
    );
    assert.ok(observation.exactSourceOperation);
    assert.equal(
      observation.sceneObjectCode,
      observation.exactSourceOperation.sceneObjectCode,
    );
    assert.equal(
      observation.sceneObjectControlValue,
      observation.exactSourceOperation.sceneObjectControlValue,
    );
    assert.equal(
      observation.sceneObjectTransitionMode,
      observation.sceneObjectControlValue + 4,
    );
  }
  assert.deepEqual(
    [...new Set(evidence.activeObservations.map(
      (observation) => observation.sceneObjectCode,
    ))].sort(),
    ["BS14", "BS16"],
  );
});

test("browser schedules retain all transitions and numeric interaction payloads", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x2a,
        ),
      ),
    ),
  );
  assert.equal(operations.length, 41);
  assert.ok(operations.every(
    (operation) => operation.sceneObjectTransitionMode
      === operation.sceneObjectControlValue + 4,
  ));
  assert.ok(operations.every(
    (operation) => (
      operation.interactionBrowserPosition.length === 3
      && operation.interactionBrowserPosition.every(Number.isFinite)
      && operation.interactionControlFloats.length === 2
      && operation.interactionControlFloats.every(Number.isFinite)
    ),
  ));
  assert.ok(operations.every(
    (operation) => (
      operation.sceneObjectTransitionEvidence.runtimeEvidence
      === "tools/evidence/scheduled-actor-scene-object-evidence.json"
    ),
  ));
  assert.match(
    operations[0].sceneObjectTransitionEvidence.interactionPayloadStatus,
    /higher-level interaction meaning unresolved/,
  );
});

test("browser state preserves a transition across later timetable entries", () => {
  const definition = {
    actorCode: "TEST",
    defaultArea: "D000",
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [
      {
        startSecond: 100,
        operations: [
          {
            operation: 3,
            browserPosition: [1, 2, 3],
            facingFixed: 0,
          },
          {
            operation: 0x2a,
            descriptorActivationSecond: 100,
            sceneObjectCode: "BS01",
            sceneObjectControlValue: 0,
            sceneObjectTransitionMode: 4,
            interactionBrowserPosition: [4, 5, 6],
            interactionFacingFixed: 7,
            interactionControlFloats: [1, 0],
          },
          { operation: 0 },
        ],
      },
      {
        startSecond: 200,
        operations: [
          {
            operation: 3,
            browserPosition: [1, 2, 3],
            facingFixed: 0,
          },
          { operation: 0 },
        ],
      },
      {
        startSecond: 300,
        operations: [
          {
            operation: 3,
            browserPosition: [1, 2, 3],
            facingFixed: 0,
          },
          {
            operation: 0x2a,
            descriptorActivationSecond: 300,
            sceneObjectCode: "BS01",
            sceneObjectControlValue: 1,
            sceneObjectTransitionMode: 5,
            interactionBrowserPosition: [7, 8, 9],
            interactionFacingFixed: 10,
            interactionControlFloats: [1, 0],
          },
          { operation: 0 },
        ],
      },
    ],
  };
  const at250 = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2026, 0, 1, 0, 4, 10)),
    { D000: "dobuita" },
  );
  assert.deepEqual(at250.sceneObjectTransition, {
    sceneObjectCode: "BS01",
    sceneObjectControlValue: 0,
    sceneObjectTransitionMode: 4,
    interactionBrowserPosition: [4, 5, 6],
    interactionFacingFixed: 7,
    interactionControlFloats: [1, 0],
  });
  const at300 = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(2026, 0, 1, 0, 5, 0)),
    { D000: "dobuita" },
  );
  assert.equal(at300.sceneObjectTransition.sceneObjectControlValue, 1);
  assert.equal(at300.sceneObjectTransition.sceneObjectTransitionMode, 5);
});
