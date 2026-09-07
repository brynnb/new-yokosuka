import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-mcir-occupancy-evidence.json",
  "utf8",
));

test("MCIR occupancy evidence scans unique captures structurally", () => {
  assert.equal(evidence.summary.inventoryCaptureCount, 499);
  assert.equal(evidence.summary.uniqueCaptureHashCount, 476);
  assert.equal(evidence.summary.uniqueCapturesWithMcirCount, 476);
  assert.equal(evidence.summary.runtimeGraphObservationCount, 488);
  assert.equal(evidence.summary.occupiedLeafObservationCount, 1417);
  assert.equal(evidence.summary.distinctActorTargetBindingCount, 41);
  assert.equal(evidence.summary.deterministicObservedLeafBindingCount, 36);
  assert.equal(evidence.summary.multiLeafObservedBindingCount, 5);
  assert.equal(evidence.summary.occupancyCohortCount, 24);
  assert.equal(evidence.summary.cohortBindingCount, 174);
  assert.equal(evidence.summary.deterministicCohortBindingCount, 174);
  assert.equal(evidence.summary.multiLeafCohortBindingCount, 0);
  assert.equal(evidence.summary.areaProgramVariantBindingCount, 125);
  assert.equal(
    evidence.summary.deterministicAreaProgramVariantBindingCount,
    122,
  );
  assert.equal(evidence.summary.multiLeafAreaProgramVariantBindingCount, 3);
  assert.equal(
    evidence.summary.exactActiveOperation16OwnerObservationCount,
    1368,
  );
  assert.equal(
    evidence.summary.ambiguousActiveOperation16OwnerObservationCount,
    0,
  );
  assert.equal(
    evidence.summary.unmatchedActiveOperation16OwnerObservationCount,
    49,
  );
  assert.equal(evidence.summary.exactFinalReselectionObservationCount, 1368);
  assert.equal(evidence.summary.unmatchedFinalReselectionObservationCount, 0);
  assert.equal(evidence.summary.activeOperationProgramBindingCount, 123);
  assert.equal(
    evidence.summary.deterministicActiveOperationProgramBindingCount,
    120,
  );
  assert.equal(
    evidence.summary.multiLeafActiveOperationProgramBindingCount,
    3,
  );
  assert.equal(
    evidence.summary.deterministicFinalReselectionProgramBindingCount,
    120,
  );
  assert.equal(
    evidence.summary.multiLeafFinalReselectionProgramBindingCount,
    3,
  );
  assert.equal(evidence.summary.activeOperationBindingCount, 45);
  assert.equal(
    evidence.summary.deterministicActiveOperationBindingCount,
    40,
  );
  assert.equal(evidence.summary.multiLeafActiveOperationBindingCount, 5);
  assert.equal(
    evidence.summary.deterministicFinalReselectionBindingCount,
    40,
  );
  assert.equal(evidence.summary.multiLeafFinalReselectionBindingCount, 5);
  assert.equal(
    evidence.handlerEvidence.operation16InitializationAddress,
    "0x0c126cca",
  );
  assert.equal(
    evidence.handlerEvidence.operation16PositionAddress,
    "0x0c126ec2",
  );
  assert.equal(evidence.handlerEvidence.actorCurrentOperationOffset, "0x04");
  assert.equal(
    evidence.handlerEvidence.actorNextOperationPointerOffset,
    "0x64",
  );
  assert.equal(evidence.handlerEvidence.leafOccupantCodeOffset, "0x10");
  assert.equal(evidence.handlerEvidence.groupPredicateResult, 1);
  assert.equal(
    evidence.handlerEvidence.freeLeafSelectionRule,
    "first unoccupied leaf in serialized root/group/leaf order",
  );
});

test("active operation owners retain exact source-operation identity", () => {
  const bindings = evidence.graphs.flatMap(
    (graph) => graph.activeOperationProgramBindings,
  );
  assert.equal(bindings.length, 123);
  for (const binding of bindings) {
    assert.match(binding.occupantActorCode, /^[A-Z0-9]{4}$/);
    assert.match(binding.targetCode, /^[A-Z0-9]{4}$/);
    assert.match(binding.normalizedProgramByteSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(binding.operationOffsetFromProgramHeader));
    assert.ok(binding.operationOffsetFromProgramHeader >= 0);
    assert.ok(binding.operationAddresses.length > 0);
    assert.ok(binding.scheduleTables.length > 0);
    assert.ok(binding.leafObservations.length > 0);
    assert.ok(binding.finalReselectionObservations.length > 0);
    for (const observation of binding.leafObservations) {
      assert.ok(observation.observationCount > 0);
    }
  }
  const activeOwners = evidence.graphs.flatMap(
    (graph) => graph.bindings.flatMap(
      (binding) => binding.leafObservations.flatMap(
        (observation) => observation.activeOperation16Owners || [],
      ),
    ),
  );
  assert.equal(
    activeOwners.reduce(
      (count, owner) => count + owner.observationCount,
      0,
    ),
    1368,
  );
  for (const owner of activeOwners) {
    assert.match(owner.normalizedProgramByteSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(owner.operationOffsetFromProgramHeader));
    assert.ok(owner.operationOffsetFromProgramHeader >= 0);
    assert.ok(owner.observationCount > 0);
    assert.ok(owner.captureHashCount > 0);
    assert.ok(Number.isInteger(owner.finalReselectedLeafIndex));
  }
});

test("final handler replay preserves waiting and reselected leaves separately", () => {
  const bindings = evidence.graphs.flatMap(
    (graph) => graph.activeOperationBindings.map((binding) => ({
      graph,
      binding,
    })),
  );
  const changed = bindings.filter(({ binding }) => (
    binding.leafObservations.length === 1
    && binding.finalReselectionObservations.length === 1
    && binding.leafObservations[0].leafIndex
      !== binding.finalReselectionObservations[0].leafIndex
  ));
  assert.deepEqual(
    changed.map(({ binding }) => [
      binding.occupantActorCode,
      binding.targetCode,
      binding.operationOffsetFromProgramHeader,
      binding.leafObservations[0].leafIndex,
      binding.finalReselectionObservations[0].leafIndex,
    ]).sort(),
    [
      ["MIKI", "DPIZ", 4564, 30, 28],
      ["YOSI", "MKYU", 2744, 19, 18],
    ],
  );
});

test("every runtime leaf has one offline root and an exact finite position", () => {
  for (const graph of evidence.graphs) {
    assert.ok(graph.runtimeObservationCount > 0);
    for (const binding of graph.bindings) {
      assert.match(binding.targetCode, /^[A-Z0-9]{4}$/);
      assert.match(binding.occupantActorCode, /^[A-Z0-9]{4}$/);
      assert.equal(
        binding.observedLeafCount,
        binding.leafObservations.length,
      );
      for (const observation of binding.leafObservations) {
        assert.ok(observation.observationCount > 0);
        assert.ok(observation.captureHashCount > 0);
        assert.ok(observation.runtimePosition.every(Number.isFinite));
        assert.deepEqual(
          observation.browserPosition,
          [
            -observation.runtimePosition[0],
            observation.runtimePosition[1],
            observation.runtimePosition[2],
          ],
        );
        assert.ok(observation.secondRouteEndpoint.every(Number.isFinite));
      }
    }
  }
});

test("multi-leaf observations remain explicit instead of being collapsed", () => {
  const multiLeaf = evidence.graphs.flatMap(
    (graph) => graph.bindings.filter(
      (binding) => !binding.deterministicObservedLeaf,
    ),
  );
  assert.deepEqual(
    multiLeaf.map(
      (binding) => `${binding.occupantActorCode}:${binding.targetCode}`,
    ).sort(),
    [
      "ECHO:BYO2",
      "MTRI:BYO2",
      "SATO:MAJ1",
      "YJIH:DGCT",
      "YOHI:MAJ1",
    ],
  );
  assert.ok(multiLeaf.every((binding) => binding.observedLeafCount > 1));
});

test("map-residency cohorts preserve deterministic shared-leaf choices", () => {
  const cohortBindings = evidence.graphs.flatMap(
    (graph) => graph.occupancyCohorts.flatMap((cohort) => {
      assert.match(
        cohort.scheduledProgramSetSha256,
        /^[a-f0-9]{64}$/,
      );
      assert.ok(Number.isInteger(cohort.likelyDisc));
      assert.match(cohort.likelyArea, /^[A-Z0-9]{4}$/);
      assert.ok(cohort.captureHashCount > 0);
      assert.ok(Array.isArray(cohort.sourceProgramVariants));
      for (const variant of cohort.sourceProgramVariants) {
        assert.match(variant.actorCode, /^[A-Z0-9]{4}$/);
        assert.ok(variant.normalizedProgramByteSha256s.length > 0);
        assert.ok(variant.normalizedProgramByteSha256s.every(
          (hash) => /^[a-f0-9]{64}$/.test(hash),
        ));
      }
      return cohort.bindings.map((binding) => ({ cohort, binding }));
    }),
  );
  assert.equal(cohortBindings.length, 174);
  assert.ok(cohortBindings.every(
    ({ binding }) => (
      binding.deterministicObservedLeaf
      && binding.observedLeafCount === 1
    ),
  ));

  const varyingBindings = new Set(
    evidence.graphs.flatMap(
      (graph) => graph.bindings.filter(
        (binding) => !binding.deterministicObservedLeaf,
      ).map(
        (binding) => `${binding.occupantActorCode}:${binding.targetCode}`,
      ),
    ),
  );
  const cohortChoices = new Map();
  for (const { cohort, binding } of cohortBindings) {
    const key = `${binding.occupantActorCode}:${binding.targetCode}`;
    if (!varyingBindings.has(key)) continue;
    if (!cohortChoices.has(key)) cohortChoices.set(key, new Set());
    cohortChoices.get(key).add(binding.leafObservations[0].leafIndex);
    assert.ok(cohort.captureHashes.every(
      (hash) => /^[a-f0-9]{64}$/.test(hash),
    ));
  }
  assert.deepEqual(
    [...cohortChoices].map(
      ([key, leaves]) => [key, [...leaves].sort((a, b) => a - b)],
    ).sort(),
    [
      ["ECHO:BYO2", [10, 12]],
      ["MTRI:BYO2", [10, 12]],
      ["SATO:MAJ1", [25, 26]],
      ["YJIH:DGCT", [21, 22]],
      ["YOHI:MAJ1", [25, 26]],
    ],
  );
});

test("map/program joins preserve story-state disagreements", () => {
  const bindings = evidence.graphs.flatMap(
    (graph) => graph.areaProgramVariantBindings.map(
      (binding) => ({ graph, binding }),
    ),
  );
  assert.equal(bindings.length, 125);
  for (const { graph, binding } of bindings) {
    assert.match(graph.linkedRouteTableId, /^MCIR:[a-f0-9]{64}$/);
    assert.match(binding.likelyArea, /^[A-Z0-9]{4}$/);
    assert.match(binding.normalizedProgramByteSha256, /^[a-f0-9]{64}$/);
    assert.ok(binding.cohortCount > 0);
    assert.ok(binding.scheduledProgramSetSha256s.length > 0);
    assert.ok(binding.leafObservations.length > 0);
  }
  assert.deepEqual(
    bindings.filter(
      ({ binding }) => !binding.deterministicObservedLeaf,
    ).map(({ binding }) => [
      binding.likelyArea,
      binding.occupantActorCode,
      binding.targetCode,
      binding.leafObservations.map((observation) => observation.leafIndex),
    ]).sort(),
    [
      ["JHD0", "SATO", "MAJ1", [25, 26]],
      ["JHD0", "YJIH", "DGCT", [21, 22]],
      ["JHD0", "YOHI", "MAJ1", [25, 26]],
    ],
  );
});
