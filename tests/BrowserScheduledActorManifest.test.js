import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  scheduledActorVariant,
  scheduledDescriptorState,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));
const assets = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actor-assets.json",
  "utf8",
));

test("browser schedule projection retains exact source identity", () => {
  assert.equal(manifest.summary.actorCodeCount, 225);
  assert.equal(manifest.summary.actorProgramVariantCount, 234);
  assert.equal(manifest.summary.mappedModelCount, 225);
  assert.equal(assets.summary.resolvedAssetCount, 226);
  for (const actor of manifest.actors) {
    assert.match(actor.actorCode, /^[A-Z0-9_]{4}$/);
    assert.match(actor.mappedModelCode, /^[A-Z0-9_]{3,5}$/);
    assert.match(actor.sourceProgramByteSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(actor.nativeDefaultMotionStateId));
    assert.equal(
      actor.nativeDefaultMotionEvidence.lifecycleResetAddress,
      "0x0c11ee08",
    );
  }
});

test("operation 0x09 restores the exact actor-definition default motion", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultMotionStateId: 0x80b5,
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        { operation: 3, browserPosition: [1, 0, 2], facingFixed: 0 },
        { operation: 2, motionStateId: 0x80bb },
        { operation: 9, actorStateValue: 0 },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 1, 41)),
    { D000: "dobuita" },
  );
  assert.equal(state.actorLifecycleControlState, 0);
  assert.equal(state.motionStateId, 0x80b5);
  assert.equal(state.motionBank, "mobj");
});

test("operation 0x09 value one preserves the active native motion", () => {
  const definition = {
    actorCode: "TEST",
    nativeDefaultMotionStateId: 0x80b5,
    nativeDefaultPathSpeedPerGameSecond: 1,
    journeys: [{
      startSecond: 100,
      operations: [
        { operation: 8, area: "D000" },
        { operation: 3, browserPosition: [1, 0, 2], facingFixed: 0 },
        { operation: 2, motionStateId: 0x80bb },
        { operation: 9, actorStateValue: 1 },
        { operation: 0 },
      ],
    }],
  };
  const state = scheduledDescriptorState(
    definition,
    new Date(Date.UTC(1986, 0, 1, 0, 1, 41)),
    { D000: "dobuita" },
  );
  assert.equal(state.actorLifecycleControlState, 1);
  assert.equal(state.motionStateId, 0x80bb);
});

test("generalized browser schedule expands only engine-proven paths", () => {
  assert.equal(manifest.summary.scheduleVariantCount, 431);
  assert.equal(manifest.summary.timetableEntryCount, 1283);
  assert.equal(manifest.summary.routeCount, 1620);
  assert.equal(manifest.summary.routePointCount, 40684);
  assert.equal(manifest.summary.selectedTimetableEntryCount, 771);
  assert.equal(manifest.summary.selectedRouteCount, 1178);
  assert.equal(manifest.summary.sourceOnlySelectionCount, 0);
  assert.equal(manifest.summary.linkedRouteTableCount, 2);
  assert.equal(manifest.summary.linkedRouteRootCount, 37);
  assert.equal(manifest.summary.linkedRoutePointCount, 513);
  assert.ok(manifest.summary.routeCount > 1_000);
  for (const actor of manifest.actors) {
    assert.ok(actor.scheduleVariants.some(
      (variant) => (
        variant.scheduleVariantId === actor.defaultScheduleVariantId
      ),
    ));
    for (const variant of actor.scheduleVariants) {
      for (const journey of variant.journeys) {
        for (const route of journey.routes) {
          assert.ok(route.points.length >= 2);
          assert.ok(route.points.every(
            (point) => point.length === 3 && point.every(Number.isFinite),
          ));
        }
      }
    }
  }
});

test("every browser operation-0x16 target resolves to an MCIR route root", () => {
  const roots = manifest.linkedRouteTables.flatMap((table) => table.roots);
  const linkedRoots = new Set(roots.map((root) => root.targetCode));
  assert.equal(roots.length, 37);
  assert.equal(linkedRoots.size, roots.length);
  assert.equal(
    roots.filter((root) => root.finalEndpointInvariantAcrossLeaves).length,
    35,
  );
  for (const actor of manifest.actors) {
    for (const targetCode of actor.linkedTargetCodes) {
      assert.ok(linkedRoots.has(targetCode), `${actor.actorCode}:${targetCode}`);
    }
  }
});

test("browser operation 0x22 gates retain exact numeric motion evidence", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x22,
        ),
      ),
    ),
  );
  assert.equal(manifest.summary.variableMotionGateOperationCount, 53);
  assert.equal(manifest.summary.variableMotionCandidateRecordCount, 155);
  assert.equal(
    manifest.summary.deterministicVariableMotionStateOperationCount,
    8,
  );
  assert.equal(manifest.summary.randomVariableMotionStateOperationCount, 45);
  assert.equal(
    manifest.summary.exactActiveVariableMotionGateObservationCount,
    558,
  );
  assert.equal(operations.length, 53);
  assert.equal(
    operations.reduce(
      (count, operation) => count + operation.motionCandidateCount,
      0,
    ),
    155,
  );
  assert.equal(
    operations.filter(
      (operation) => (
        Number.isFinite(operation.descriptorActivationSecond)
        && Number.isFinite(operation.gateReleaseSecond)
      ),
    ).length,
    51,
  );
  for (const operation of operations) {
    assert.equal(
      operation.motionCandidates.length,
      operation.motionCandidateCount,
    );
    assert.equal(
      operation.variableMotionEvidence.runtimeEvidence,
      (
        "tools/evidence/"
        + "scheduled-actor-variable-motion-evidence.json"
      ),
    );
    assert.equal(
      operation.variableMotionEvidence.handlerAddress,
      "0x0c0f90f2",
    );
    assert.ok(operation.motionCandidates.every(
      (candidate) => Number.isInteger(candidate.motionStateId),
    ));
    if (Number.isInteger(operation.deterministicMotionStateId)) {
      assert.deepEqual(
        operation.uniqueMotionStateIds,
        [operation.deterministicMotionStateId],
      );
      assert.match(
        operation.variableMotionEvidence.selectionStatus,
        /RNG-independent/,
      );
    } else {
      assert.ok(operation.uniqueMotionStateIds.length > 1);
    }
    if (!Number.isFinite(operation.descriptorActivationSecond)) {
      assert.equal(operation.gateReleaseSecond, null);
      continue;
    }
    assert.equal(
      operation.gateReleaseSecond,
      operation.timeControlValue < 0
        ? (
          operation.descriptorActivationSecond
          - operation.timeControlValue
        )
        : Math.max(
          operation.descriptorActivationSecond,
          operation.timeControlValue,
        ),
    );
  }
});

test("browser operation 0x19 retains direct native motion requests", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x19,
        ).map((operation) => ({ actor, operation })),
      ),
    ),
  );
  assert.ok(operations.length > 100);
  assert.ok(operations.some(({ actor, operation }) => (
    actor.actorCode === "FUKU"
    && operation.motionStateControlWord === 33523
    && operation.motionStateId === -32013
  )));
  for (const { operation } of operations) {
    assert.equal(
      operation.motionRequestControlValues.length,
      4,
    );
    assert.equal(
      operation.motionRequestEvidence.handlerAddress,
      "0x0c11f804",
    );
    assert.equal(
      operation.motionRequestEvidence.controllerRequestAddress,
      "0x0c10d77c",
    );
    assert.equal(
      operation.motionStateControlWord === 0,
      operation.motionRequestEffect.startsWith("tear down"),
    );
  }
});

test("browser operation 0x18 uses proven target subtype release rules", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x18,
        ),
      ),
    ),
  );
  assert.equal(manifest.summary.linkedInteractionOperationCount, 15);
  assert.equal(manifest.summary.linkedInteractionTargetBindingCount, 9);
  assert.equal(
    manifest.summary.exactActiveLinkedInteractionObservationCount,
    1573,
  );
  assert.equal(
    manifest.summary.validLinkedInteractionTargetBindingObservationCount,
    1569,
  );
  assert.equal(
    manifest.summary
      .transientInvalidLinkedInteractionTargetBindingObservationCount,
    4,
  );
  assert.equal(operations.length, 15);
  for (const operation of operations) {
    const binding =
      operation.linkedInteractionEvidence.targetBinding;
    assert.ok(binding);
    assert.ok(Number.isFinite(operation.descriptorActivationSecond));
    assert.ok(Number.isFinite(operation.targetSecond));
    assert.ok(Number.isFinite(operation.gateReleaseSecond));
    assert.equal(operation.interactionMotionStateIds.length, 3);
    assert.equal(operation.interactionControlValues.length, 4);
    assert.equal(
      operation.targetSecond,
      operation.timeControlValue <= 0
        ? (
          operation.descriptorActivationSecond
          - operation.timeControlValue
        )
        : operation.timeControlValue,
    );
    const start = binding.activeWindowStartSecond;
    const end = binding.activeWindowEndSecond;
    if (binding.targetSubtype === 1) {
      let expected = Math.max(
        operation.descriptorActivationSecond,
        operation.targetSecond,
      );
      if (expected >= start && expected < end) expected = end;
      assert.equal(operation.gateReleaseSecond, expected);
      continue;
    }
    assert.equal(binding.targetSubtype, 3);
    const expected = (
      operation.descriptorActivationSecond < start
      || operation.descriptorActivationSecond > end
      || operation.targetSecond < operation.descriptorActivationSecond
    )
      ? operation.descriptorActivationSecond
      : Math.min(operation.targetSecond, end) + 1;
    assert.equal(operation.gateReleaseSecond, expected);
  }
});

test("allocation-independent MCIR endpoints cover every invariant root", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x16,
        ),
      ),
    ),
  );
  const independent = operations.filter(
    (operation) => (
      operation.linkedPlacement?.status?.startsWith(
        "allocation-independent ",
      )
    ),
  );
  assert.equal(independent.length, 115);
  assert.equal(
    manifest.summary.allocationIndependentSingleLeafLinkedPlacementCount,
    38,
  );
  assert.equal(
    manifest.summary
      .allocationIndependentSharedEndpointLinkedPlacementCount,
    77,
  );
  for (const operation of independent) {
    assert.equal(
      operation.linkedPlacement.selectorFunctionAddress,
      "0x0c1274a4",
    );
    assert.equal(operation.linkedPlacement.selectorFunctionResult, 1);
    assert.ok(operation.linkedPlacement.allocationIndependenceEvidence);
    assert.ok(operation.linkedPlacement.possibleLeafIndices.length > 0);
    assert.match(
      operation.linkedPlacement.finalRuntimeEndpointWordHex,
      /^[a-f0-9]{24}$/,
    );
    assert.ok(operation.linkedPlacement.position.every(Number.isFinite));
    const root = manifest.linkedRouteTables.flatMap(
      (table) => table.roots,
    ).find((candidate) => candidate.targetCode === operation.targetCode);
    assert.ok(root);
    assert.equal(root.finalEndpointInvariantAcrossLeaves, true);
    assert.deepEqual(root.finalEndpoint, operation.linkedPlacement.position);
    assert.deepEqual(
      root.finalEndpointLeafIndices,
      operation.linkedPlacement.possibleLeafIndices,
    );
    for (const leaf of root.groups.flatMap((group) => group.leaves)) {
      assert.deepEqual(
        leaf.secondRoute.points.at(-1),
        operation.linkedPlacement.position,
      );
    }
  }
});

test("default schedules use only exact-operation observed shared MCIR leaves", () => {
  const placements = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => (
            operation.operation === 0x16
            && operation.linkedPlacement?.status
              === "capture-proven deterministic exact-operation MCIR leaf"
          ),
        ).map((operation) => ({
          actor,
          variant,
          journey,
          operation,
        })),
      ),
    ),
  );
  assert.equal(placements.length, 2);
  for (const { actor, variant, operation } of placements) {
    assert.equal(
      variant.scheduleVariantId,
      actor.defaultScheduleVariantId,
    );
    assert.equal(
      operation.linkedPlacement.occupancyEvidence,
      "tools/evidence/scheduled-actor-mcir-occupancy-evidence.json",
    );
    assert.ok(operation.linkedPlacement.observationCount > 0);
    assert.ok(operation.linkedPlacement.captureHashCount > 0);
    assert.ok(Number.isInteger(
      operation.linkedPlacement.operationOffsetFromProgramHeader,
    ));
    assert.ok(
      operation.linkedPlacement.operationOffsetFromProgramHeader >= 0,
    );
    assert.match(
      operation.linkedPlacement.sourceProgramByteSha256,
      /^[a-f0-9]{64}$/,
    );
    assert.ok(operation.linkedPlacement.observedOperationAddresses.length > 0);
    assert.ok(operation.linkedPlacement.finalReselectionEvidence);
    assert.ok(operation.linkedPlacement.waitingLeafIndices.length > 0);
    assert.ok(operation.linkedPlacement.position.every(Number.isFinite));
  }
  assert.deepEqual(
    placements.map(({ actor, journey, operation }) => [
      actor.actorCode,
      journey.startTime,
      operation.targetCode,
      operation.linkedPlacement.waitingLeafIndices,
      operation.linkedPlacement.leafIndex,
    ]).sort(),
    [
      ["ITOH", "15:50:00", "FBEA", [3], 3],
      ["SKRD", "15:50:00", "FBEA", [2], 2],
    ],
  );
});

test("source-wide timing proves TATM takes the first empty FBEA leaf", () => {
  const placements = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => (
            operation.operation === 0x16
            && operation.linkedPlacement?.status
              === (
                "source-wide exclusive first claim on zero-initialized "
                + "MCIR root"
              )
          ),
        ).map((operation) => ({ actor, journey, operation })),
      ),
    ),
  );
  assert.equal(placements.length, 1);
  assert.equal(
    manifest.summary.sourceWideExclusiveFirstClaimLinkedPlacementCount,
    1,
  );
  const [{ actor, journey, operation }] = placements;
  assert.equal(actor.actorCode, "TATM");
  assert.equal(journey.startTime, "10:40:00");
  assert.equal(operation.targetCode, "FBEA");
  assert.equal(operation.linkedPlacement.sourceProgramVariantCount, 265);
  assert.equal(operation.linkedPlacement.targetClaimantOperationCount, 3);
  assert.equal(operation.linkedPlacement.journeyStartSecond, 38400);
  assert.ok(
    operation.linkedPlacement.claimReadySecond > 39587
    && operation.linkedPlacement.claimReadySecond < 39588,
  );
  assert.equal(operation.linkedPlacement.releaseSecond, 44100);
  assert.equal(operation.linkedPlacement.nextClaimantStartSecond, 57000);
  assert.equal(operation.linkedPlacement.leafIndex, 2);
  assert.equal(
    operation.linkedPlacement.finalRuntimeEndpointWordHex,
    "c1b98bc2000000001f25b142",
  );
  assert.deepEqual(
    operation.linkedPlacement.position,
    [69.86280059814453, 0, 88.57250213623047],
  );
  assert.equal(
    operation.linkedPlacement.graphOccupancyResetAddress,
    "0x0c126232",
  );
  assert.equal(
    operation.linkedPlacement.claimInitializationHandlerAddress,
    "0x0c126cca",
  );
  const root = manifest.linkedRouteTables.flatMap(
    (table) => table.roots,
  ).find((candidate) => candidate.targetCode === "FBEA");
  assert.equal(root.allLeavesInitiallyUnoccupied, true);
  assert.equal(root.groups.flatMap((group) => group.leaves)[0].leafIndex, 2);
});

test("map/program/operation evidence resolves additional shared MCIR leaves", () => {
  const placements = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => (
            operation.operation === 0x16
            && operation.linkedPlacement?.status
              === "capture-proven deterministic map/program MCIR leaf"
          ),
        ).map((operation) => ({ actor, journey, operation })),
      ),
    ),
  );
  assert.equal(placements.length, 0);
  assert.equal(manifest.summary.linkedPlacementOperationCount, 118);
  assert.equal(
    manifest.summary.captureProvenExactOperationLinkedPlacementCount,
    2,
  );
  assert.equal(
    manifest.summary.captureProvenAreaProgramLinkedPlacementCount,
    0,
  );
  for (const { actor, journey, operation } of placements) {
    assert.equal(
      operation.linkedPlacement.sourceProgramByteSha256,
      actor.sourceProgramByteSha256,
    );
    assert.ok(operation.linkedPlacement.likelyAreas.every(
      (area) => journey.areas.includes(area),
    ));
    assert.ok(operation.linkedPlacement.observationCount > 0);
    assert.ok(operation.linkedPlacement.captureHashCount > 0);
    assert.ok(Number.isInteger(
      operation.linkedPlacement.operationOffsetFromProgramHeader,
    ));
    assert.ok(
      operation.linkedPlacement.operationOffsetFromProgramHeader >= 0,
    );
    assert.ok(operation.linkedPlacement.finalReselectionEvidence);
    assert.ok(operation.linkedPlacement.waitingLeafIndices.length > 0);
    assert.ok(operation.linkedPlacement.position.every(Number.isFinite));
  }
});

test("capture-proven operation-0x16 waiting leaves remain separate from final endpoints", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => (
            operation.operation === 0x16 && operation.waitingPlacement
          ),
        ).map((operation) => ({ actor, operation })),
      ),
    ),
  );
  assert.equal(operations.length, 34);
  assert.equal(
    manifest.summary.deterministicWaitingPlacementOperationCount,
    34,
  );
  assert.equal(
    manifest.summary.deterministicExactOperationWaitingPlacementCount,
    32,
  );
  assert.equal(
    manifest.summary.deterministicMapProgramWaitingPlacementCount,
    2,
  );
  assert.equal(manifest.summary.subordinateRuntimeObservationCount, 1376);
  assert.equal(manifest.summary.exactSubordinateSourcePointerJoinCount, 1376);
  assert.ok(manifest.generatedFrom.includes(
    "tools/evidence/scheduled-actor-subordinate-evidence.json",
  ));
  for (const { operation } of operations) {
    assert.ok(operation.linkedPlacement);
    assert.ok(operation.waitingPlacement.position.every(Number.isFinite));
    assert.ok(Number.isInteger(
      operation.waitingPlacement.transformControlWord,
    ));
    assert.ok(operation.waitingPlacement.observationCount > 0);
    assert.ok(operation.waitingPlacement.captureHashCount > 0);
    assert.equal(
      operation.waitingPlacement.subordinateRuntimeEvidence,
      "tools/evidence/scheduled-actor-subordinate-evidence.json",
    );
    assert.equal(
      operation.subordinateRuntimeEvidence.subordinateCursorOffset,
      "0x1dc",
    );
    assert.notDeepEqual(
      operation.waitingPlacement.position,
      operation.linkedPlacement.position,
    );
  }
});

test("every unresolved shared MCIR placement names its evidence gap", () => {
  const unresolved = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => (
            operation.operation === 0x16 && !operation.linkedPlacement
          ),
        ),
      ),
    ),
  );
  assert.equal(unresolved.length, 0);
  assert.equal(manifest.summary.unresolvedLinkedPlacementOperationCount, 0);
  assert.deepEqual(manifest.summary.unresolvedLinkedPlacementReasonCounts, {});
  for (const operation of unresolved) {
    assert.equal(
      operation.linkedPlacementUnresolved.status,
      "unresolved shared MCIR leaf",
    );
    assert.equal(
      operation.linkedPlacementUnresolved.occupancyEvidence,
      "tools/evidence/scheduled-actor-mcir-occupancy-evidence.json",
    );
    assert.ok(Array.isArray(
      operation.linkedPlacementUnresolved.observedLeafIndices,
    ));
    assert.ok(Array.isArray(
      operation.linkedPlacementUnresolved.observedMapProgramCandidates,
    ));
  }
});

test("routed secondary attachments retain every proven XZ path", () => {
  const operations = manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => journey.operations.filter(
          (operation) => operation.operation === 0x1c,
        ),
      ),
    ),
  );
  assert.equal(operations.length, 114);
  assert.equal(manifest.summary.secondaryObjectRouteCount, 114);
  assert.equal(manifest.summary.secondaryObjectRoutePointCount, 12871);
  assert.equal(manifest.summary.distinctSecondaryObjectRouteArrayCount, 42);
  assert.equal(manifest.summary.positiveSecondaryObjectRouteCount, 49);
  assert.equal(manifest.summary.negativeSecondaryObjectRouteCount, 65);
  assert.equal(manifest.summary.resolvedSecondaryObjectRouteStepCount, 114);
  for (const operation of operations) {
    assert.equal(
      operation.attachmentRouteEvidence.initializationHandlerAddress,
      "0x0c128a2e",
    );
    assert.equal(
      operation.attachmentRouteEvidence.actorObjectSynchronizationAddress,
      "0x0c12ac2e",
    );
    assert.ok(operation.resolvedPathStepPerUpdate > 0);
    assert.equal(
      operation.attachmentRouteEvidence.resolvedPathStepStatus,
      "engine-proven finite path step",
    );
    if (operation.pathControlFloat === -20) {
      assert.match(operation.secondaryObjectCode, /^FK0[12]$/);
      assert.equal(
        operation.resolvedPathStepPerUpdate,
        0.18518516421318054,
      );
      assert.equal(
        operation.attachmentRouteEvidence.negativePathControlSelectorAddress,
        "0x0c12ab92",
      );
    }
    assert.equal(
      operation.secondaryRoute.points.length,
      operation.pointCount,
    );
    assert.ok(operation.secondaryRoute.points.every(
      (point) => (
        point.length === 3
        && point.every(Number.isFinite)
        && point[1] === 0
      ),
    ));
  }
});

test("native empty timetables remove actors for the matching story state", () => {
  const ngsm = manifest.actors.find((actor) => actor.actorCode === "NGSM");
  assert.ok(ngsm);
  const absent = scheduledActorVariant(
    ngsm,
    new Date(Date.UTC(1986, 11, 3)),
    { storyFlags: [20] },
  );
  assert.deepEqual(absent.selectorIndices, [4]);
  assert.deepEqual(absent.journeys, []);
  assert.equal(scheduledDescriptorState(
    { ...ngsm, journeys: absent.journeys },
    new Date(Date.UTC(1986, 11, 3, 12)),
    manifest.areaWorlds,
  ), null);
});

test("CATB 10:13 remains byte-for-byte coordinate compatible", () => {
  const actor = manifest.actors.find((candidate) => (
    candidate.actorCode === "CATB"
  ));
  const selected = actor.scheduleVariants.find((candidate) => (
    candidate.scheduleVariantId === actor.defaultScheduleVariantId
  ));
  const journey = selected.journeys.find((candidate) => (
    candidate.startSecond === 36780
  ));
  const route = journey.routes.find((candidate) => (
    candidate.area === "JU00" && candidate.subtype === "0x8016"
  ));
  assert.equal(route.points.length, 39);
  assert.deepEqual(route.points[0], [
    45.56789779663086,
    7,
    98.13996887207031,
  ]);
});

test("program variants cannot duplicate an actor in one browser world", () => {
  const actorCodes = new Set(manifest.actors.map((actor) => actor.actorCode));
  for (const actorCode of actorCodes) {
    const variants = manifest.actors.filter(
      (candidate) => candidate.actorCode === actorCode,
    );
    for (let left = 0; left < variants.length; left++) {
      for (let right = left + 1; right < variants.length; right++) {
        const rightWorlds = new Set(variants[right].playbackWorldIds);
        assert.deepEqual(
          variants[left].playbackWorldIds.filter(
            (world) => rightWorlds.has(world),
          ),
          [],
          actorCode,
        );
      }
    }
  }
});

test("every selected actor timeline remains finite across a full game day", () => {
  for (const actor of manifest.actors) {
    const selected = actor.scheduleVariants.find(
      (candidate) => (
        candidate.scheduleVariantId === actor.defaultScheduleVariantId
      ),
    );
    const definition = { ...actor, journeys: selected.journeys };
    for (let second = 0; second < 86400; second += 300) {
      const state = scheduledDescriptorState(
        definition,
        new Date(Date.UTC(2000, 0, 1, 0, 0, second)),
        manifest.areaWorlds,
      );
      if (!state) continue;
      assert.ok(
        state.position.every(Number.isFinite),
        `${actor.instanceId} at ${second}`,
      );
      assert.ok(
        state.rootYaw == null || Number.isFinite(state.rootYaw),
        `${actor.instanceId} heading at ${second}`,
      );
      assert.equal(
        state.worldId,
        manifest.areaWorlds[state.area] || null,
        `${actor.instanceId} area at ${second}`,
      );
    }
  }
});
