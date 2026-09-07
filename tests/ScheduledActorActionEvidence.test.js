import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-action-evidence.json",
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));
const motions = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actor-motions.json",
  "utf8",
));

test("operation-0x30 action evidence joins exact source operations", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureCount, 476);
  assert.equal(evidence.summary.relevantCaptureCount, 249);
  assert.equal(evidence.summary.sourceOperationCount, 128);
  assert.equal(evidence.summary.sourceInstallOperationCount, 67);
  assert.equal(evidence.summary.sourceTeardownOperationCount, 61);
  assert.equal(evidence.summary.distinctSourceActionIdCount, 5);
  assert.equal(evidence.summary.sourceActorCodeCount, 27);
  assert.equal(evidence.summary.runtimeActorObservationCount, 5577);
  assert.equal(evidence.summary.nonzeroActionRequestObservationCount, 504);
  assert.equal(evidence.summary.queuedActionRequestObservationCount, 504);
  assert.equal(evidence.summary.nullControllerPointerObservationCount, 480);
  assert.equal(evidence.summary.residentControllerObservationCount, 24);
  assert.equal(
    evidence.summary.exactSourceOperationActionRequestObservationCount,
    504,
  );
  assert.equal(evidence.summary.unmatchedActionRequestObservationCount, 0);
  assert.equal(evidence.nativeEvidence.handlerAddress, "0x0c11f026");
  assert.equal(evidence.nativeEvidence.teardownAddress, "0x0c11efd2");
  assert.equal(
    evidence.nativeEvidence.controllerRequestAddress,
    "0x0c10d77c",
  );
  assert.equal(evidence.nativeEvidence.actorActionIdOffset, "0xf0");
  assert.equal(
    evidence.nativeEvidence.actorActionOperationPointerOffset,
    "0xec",
  );
  assert.equal(evidence.nativeEvidence.installedControllerMode, 7);
  assert.equal(
    evidence.nativeEvidence.controllerRequestInitializerAddress,
    "0x0c10d7f6",
  );
  assert.equal(
    evidence.nativeEvidence.registeredMotionLookupAddress,
    "0x0c092f14",
  );
  assert.match(
    evidence.nativeEvidence.requestDeliveryModel,
    /registered-motion command/,
  );
  for (const observation of evidence.observations) {
    assert.equal(
      observation.status,
      "exact-source-operation action-controller request",
    );
    assert.equal(observation.sourceMatchCount, 1);
    assert.equal(observation.sourceVariantPresent, true);
    assert.equal(observation.actionRequestFlag, 1);
    assert.equal(
      observation.controllerRecordAvailable,
      observation.controllerPointer !== "0x00000000",
    );
    if (!observation.controllerRecordAvailable) {
      assert.equal(observation.controllerState, null);
    }
    assert.equal(
      observation.actionControllerId,
      Number.parseInt(observation.actionControllerIdHex, 16),
    );
    assert.ok(observation.exactSourceOperation);
    assert.equal(
      observation.exactSourceOperation.nativeControllerMode,
      7,
    );
  }
});

test("all five action IDs resolve through the authored M_MOBJ motion registry", () => {
  assert.deepEqual(
    evidence.actionIdBindings.map((binding) => ({
      id: binding.actionControllerIdHex,
      actors: binding.actorCodes,
      observations: binding.observationCount,
    })),
    [
      {
        id: "0x000080fb",
        actors: ["MTRI", "SGRH", "YSKT"],
        observations: 24,
      },
      {
        id: "0x0000815e",
        actors: ["MTUR", "TAEN", "YOB2"],
        observations: 458,
      },
      {
        id: "0x0000818e",
        actors: ["MYKN"],
        observations: 2,
      },
      {
        id: "0x000081c3",
        actors: ["MSTA"],
        observations: 15,
      },
      {
        id: "0x00008247",
        actors: ["KYSN", "SATO", "TATM"],
        observations: 5,
      },
    ],
  );
  assert.match(evidence.evidenceBoundary, /registered motion request/);
  const actionMotions = new Map(
    motions.stateNames.mobj.map((motion) => [motion.motionId, motion.name]),
  );
  assert.deepEqual(
    evidence.actionIdBindings.map((binding) => (
      actionMotions.get(binding.actionControllerId)
    )),
    [
      "OTH_KASA_UDE_MONOMOTI_LP_F",
      "PNW_KASA_UDE_MONOMOTI_LP_F",
      "SIN_KASA_UDE_MONOMOTI_LP_F",
      "SYP_KASA_UDE_MONOMOTI_LP_F",
      "YKI_KASA_UDE_MONOMOTI_LP_F",
    ],
  );
  const resident = evidence.observations.filter(
    (observation) => observation.controllerRecordAvailable,
  );
  assert.equal(resident.filter(
    (observation) => observation.controllerState.stateWord === 0,
  ).length, 1);
  assert.equal(resident.filter(
    (observation) => observation.controllerState.stateWord === 0x8176,
  ).length, 19);
  assert.equal(resident.filter(
    (observation) => observation.controllerState.stateWord === 0x8177,
  ).length, 4);
  assert.deepEqual(
    [...new Set(resident.map(
      (observation) => observation.controllerState.stateWord,
    ))].sort((left, right) => left - right),
    [0, 0x8176, 0x8177],
  );
});

test("browser schedules retain every exact action request and teardown", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x30,
        ),
      ),
    ),
  );
  assert.equal(operations.length, 128);
  assert.ok(manifest.generatedFrom.includes(
    "tools/evidence/scheduled-actor-action-evidence.json",
  ));
  assert.equal(manifest.summary.actionControllerOperationCount, 128);
  assert.equal(manifest.summary.actionControllerInstallOperationCount, 67);
  assert.equal(manifest.summary.actionControllerTeardownOperationCount, 61);
  assert.equal(manifest.summary.distinctActionControllerIdCount, 5);
  assert.equal(
    manifest.summary.captureProvenActionControllerRequestObservationCount,
    504,
  );
  assert.equal(
    operations.filter((operation) => operation.actionControllerId !== 0)
      .length,
    67,
  );
  assert.equal(
    operations.filter((operation) => operation.actionControllerId === 0)
      .length,
    61,
  );
  assert.deepEqual(
    [...new Set(operations
      .map((operation) => operation.actionControllerId)
      .filter(Boolean))].sort((left, right) => left - right),
    [0x80fb, 0x815e, 0x818e, 0x81c3, 0x8247],
  );
  for (const operation of operations) {
    assert.equal(operation.actionControlValues.length, 2);
    assert.equal(
      operation.actionRequestOperand,
      operation.actionControllerId === 0 ? 0 : 1,
    );
    assert.equal(operation.actionReservedOperand, 0);
    assert.match(
      operation.actionResolutionBoundary,
      /registered motion-bank lookup/,
    );
    assert.equal(
      operation.actionControllerMode,
      operation.actionControllerId === 0 ? null : 7,
    );
    assert.equal(
      operation.actionControllerEvidence.handlerAddress,
      "0x0c11f026",
    );
    assert.equal(
      operation.actionControllerEvidence.runtimeEvidence,
      "tools/evidence/scheduled-actor-action-evidence.json",
    );
    assert.equal(
      operation.actionControllerEvidence.runtimeObservationCount,
      operation.actionControllerId === 0
        ? 0
        : evidence.actionIdBindings.find(
          (binding) => (
            binding.actionControllerId === operation.actionControllerId
          ),
        ).observationCount,
    );
    assert.equal(
      operation.actionControllerEvidence
        .runtimeResidentControllerObservationCount,
      operation.actionControllerId === 0
        ? 0
        : evidence.actionIdBindings.find(
          (binding) => (
            binding.actionControllerId === operation.actionControllerId
          ),
        ).residentControllerObservationCount,
    );
    assert.match(
      operation.actionControllerEffect,
      operation.actionControllerId === 0 ? /tear down/ : /install/,
    );
  }
});
