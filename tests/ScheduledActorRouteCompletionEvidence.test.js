import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  scheduledDescriptorState,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-route-completion-evidence.json",
  "utf8",
));

test("operation 0x35 has a complete native route-completion audit", () => {
  assert.equal(evidence.summary.operationCount, 46);
  assert.equal(evidence.summary.actorCodeCount, 14);
  assert.equal(evidence.summary.nonzeroOverrideOperationCount, 37);
  assert.equal(evidence.summary.zeroDefaultSelectionOperationCount, 9);
  assert.equal(evidence.summary.exactRegisteredOverrideOperationCount, 37);
  assert.equal(evidence.summary.unresolvedNonzeroOverrideOperationCount, 0);
  assert.equal(evidence.summary.boundRouteOperationCount, 47);
  assert.equal(evidence.summary.distinctOverrideMotionCount, 8);
  assert.equal(evidence.summary.exactDefaultIdleTableOperationCount, 9);
  assert.equal(evidence.summary.missingDefaultIdleTableOperationCount, 0);
  assert.equal(evidence.summary.prngIndependentDefaultIdleOperationCount, 1);
});

test("every nonzero route-completion override resolves exactly", () => {
  for (const operation of evidence.operations) {
    if (operation.routeCompletionMotionOverrideId === null) {
      assert.equal(
        operation.resolution.status,
        "native actor-definition default-idle selection",
      );
      assert.equal(operation.resolution.candidateCount, 4);
      assert.equal(operation.resolution.candidateMotionIds.length, 4);
      assert.equal(operation.resolution.candidates.length, 4);
      assert.equal(
        operation.resolution.tableStatus,
        "byte-stable exact native default-idle table",
      );
      continue;
    }
    assert.equal(
      operation.resolution.status,
      "exact registered route-completion motion",
    );
    assert.equal(operation.resolution.bank, "mobj");
    assert.ok(operation.resolution.sequenceName);
    assert.ok(operation.resolution.durationFrames > 0);
    assert.ok(Number.isInteger(
      operation.resolution.controllerFamilyIndex,
    ));
  }
});

test("browser traversal installs a PRNG-independent native default idle", () => {
  const definition = {
    actorCode: "RINS",
    nativeDefaultPathSpeedPerGameSecond: 1 / 30,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 0x35,
          routeCompletionMotionOverrideId: null,
          routeCompletionDefaultIdleCandidateMotionIds: [
            0x80b5,
            0x80b5,
            0x80b5,
            0x80b5,
          ],
          routeCompletionDefaultIdleUnanimousMotionId: 0x80b5,
        },
        {
          operation: 1,
          area: "D000",
          movementMode: "0x82ba",
          nativePathStepPerUpdate: 1 / 30,
          points: [[0, 0, 0], [1, 0, 0]],
        },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 0, 102)),
    { D000: "dobuita" },
  );
  assert.equal(state.moving, false);
  assert.equal(state.motionStateId, 0x80b5);
  assert.deepEqual(
    state.routeCompletionDefaultIdleCandidateMotionIds,
    [0x80b5, 0x80b5, 0x80b5, 0x80b5],
  );
});

test("native route-completion field flow is executable-backed", () => {
  assert.deepEqual(evidence.nativeEvidence, {
    descriptorDispatcherAddress: "0x0c119444",
    operation35WriteAddress: "0x0c1197de",
    operation35ActorOverrideOffset: "0x1c0",
    operationOneHandlerAddress: "0x0c11f948",
    operationOneSelectionAddress: "0x0c11f966",
    operationOneCompletionAddress: "0x0c11faba",
    actorCurrentMotionStateOffset: "0x06",
    actorRouteCompletionStateOffset: "0xf4",
    actorDefinitionDefaultIdleTableOffset: "0x7c",
    actorDefinitionDefaultIdleCandidateCount: 4,
    actorDefinitionDefaultIdleCandidateWordOffsets: [
      "0x7e",
      "0x80",
      "0x82",
      "0x84",
    ],
    actorDefinitionDefaultIdleSelectionRule:
      "candidate[processWideRandom15 % 4]",
    randomFunctionAddress: "0x0c1ce1f0",
    signedRemainderFunctionAddress: "0x0c1dc440",
  });
});

test("browser traversal installs a proven nonzero idle when its route ends", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultPathSpeedPerGameSecond: 1 / 30,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        {
          operation: 0x35,
          routeCompletionMotionOverrideId: 0x8299,
          routeCompletionSelectionStatus:
            "exact registered route-completion motion override",
        },
        {
          operation: 1,
          area: "D000",
          movementMode: "0x82ba",
          nativePathStepPerUpdate: 1 / 30,
          points: [[0, 0, 0], [3, 0, 0]],
        },
        { operation: 4 },
      ],
    }],
  };
  const at = (second) => scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 0, second)),
    { D000: "dobuita" },
  );
  assert.equal(at(102).moving, true);
  assert.equal(at(102).motionStateId, null);
  assert.equal(at(103).moving, false);
  assert.equal(at(103).motionStateId, 0x8299);
  assert.equal(at(103).motionBank, "mobj");
  assert.equal(at(104).operation, 4);
  assert.equal(at(104).motionStateId, 0x8299);
});
