import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  advanceSecondaryRouteController,
  createSecondaryRouteController,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/data/scheduled-actors.json",
  "utf8",
));
const audit = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-runtime-audit.json",
  "utf8",
));

test("runtime audit covers every mapped actor instance and selector variant", () => {
  assert.equal(audit.summary.actorCodeCount, manifest.summary.actorCodeCount);
  assert.equal(
    audit.summary.actorInstanceCount,
    manifest.summary.actorProgramVariantCount,
  );
  assert.equal(
    audit.summary.scheduleVariantCount,
    manifest.summary.scheduleVariantCount,
  );
  assert.equal(
    audit.summary.timetableEntryCount,
    manifest.summary.timetableEntryCount,
  );
  assert.deepEqual(
    audit.actors.map((actor) => actor.instanceId).sort(),
    manifest.actors.map((actor) => actor.instanceId).sort(),
  );
  for (const actor of audit.actors) {
    const source = manifest.actors.find(
      (candidate) => candidate.instanceId === actor.instanceId,
    );
    assert.deepEqual(
      actor.variants.map((variant) => variant.scheduleVariantId).sort(),
      source.scheduleVariants.map(
        (variant) => variant.scheduleVariantId,
      ).sort(),
    );
  }
});

test("every sampled runtime state is finite or has an evidence-backed owner", () => {
  assert.equal(audit.summary.variantsWithInvalidRuntimeState, 0);
  assert.equal(audit.summary.linkedPlacementOperationCount, 118);
  assert.equal(audit.summary.exactLinkedPlacementCount, 118);
  assert.equal(
    audit.summary.allocationIndependentSingleLeafLinkedPlacementCount,
    38,
  );
  assert.equal(
    audit.summary.allocationIndependentSharedEndpointLinkedPlacementCount,
    77,
  );
  assert.equal(
    audit.summary.sourceWideExclusiveFirstClaimLinkedPlacementCount,
    1,
  );
  assert.equal(
    audit.summary.captureProvenExactOperationLinkedPlacementCount,
    2,
  );
  assert.equal(
    audit.summary.captureProvenAreaProgramLinkedPlacementCount,
    0,
  );
  assert.equal(
    audit.summary.unresolvedSharedAllocationLinkedPlacementCount,
    0,
  );
  assert.deepEqual(audit.summary.unresolvedLinkedPlacementReasonCounts, {});
  const allowedReasons = new Set([
    "native-empty-timetable",
    "descriptor-has-no-actor-world-position-operation",
    "operation-16-gate-superseded-by-next-journey",
    "secondary-object-controller-without-direct-actor-transform",
    "shared-MCIR-leaf-allocation-not-simulated",
  ]);
  for (const actor of audit.actors) {
    for (const variant of actor.variants) {
      assert.ok(variant.sampleCount >= 289);
      if (variant.finiteStateSampleCount > 0) {
        assert.equal(variant.unresolvedReason, null);
      } else {
        assert.ok(
          allowedReasons.has(variant.unresolvedReason),
          `${actor.instanceId}/${variant.scheduleVariantId}: `
          + `${variant.unresolvedReason}`,
        );
      }
    }
  }
});

test("dynamic forklift attachments use finite map-residency controllers", () => {
  const noStateActors = audit.actors.filter(
    (actor) => !actor.hasFiniteRuntimeState,
  );
  assert.deepEqual(noStateActors, []);
  assert.equal(
    audit.summary.variantsUsingMapResidencySecondaryRouteController,
    24,
  );
  assert.equal(audit.summary.actorInstancesWithFiniteRuntimeState, 234);
  assert.equal(audit.summary.actorInstancesWithoutFiniteRuntimeState, 0);

  const dynamic = audit.actors.filter(
    (actor) => ["FLD6", "FLDB", "FLDE", "FLDG"].includes(actor.actorCode),
  );
  assert.equal(dynamic.length, 4);
  for (const actor of dynamic) {
    assert.deepEqual(actor.sourceContexts, ["MFSY"]);
    assert.ok(actor.variants.some(
      (variant) => (
        variant.residencyControllerSampleCount > 0
        && variant.finiteStateSampleCount > 0
        && variant.unresolvedReason === null
      ),
    ));
  }
});

test("shared forklift routes remain synchronized across timetable starts", () => {
  const gameDate = new Date(Date.UTC(2000, 0, 1, 12, 1, 37));
  const controllers = ["FLD8", "FLDB", "FLDG"].map((actorCode) => {
    const actor = manifest.actors.find(
      (candidate) => candidate.actorCode === actorCode,
    );
    assert.ok(actor);
    const variant = actor.scheduleVariants.find(
      (candidate) => (
        candidate.scheduleVariantId === actor.defaultScheduleVariantId
      ),
    );
    assert.ok(variant);
    const controller = createSecondaryRouteController(
      { ...actor, journeys: variant.journeys },
      gameDate,
      manifest.areaWorlds,
    );
    assert.ok(controller);
    return advanceSecondaryRouteController(controller, 1800);
  });
  for (const controller of controllers) {
    assert.ok(controller);
    assert.equal(controller.updateCount, 1800);
    assert.ok(controller.position.every(Number.isFinite));
    assert.ok(Number.isFinite(controller.rootYaw));
  }
  assert.deepEqual(controllers[0].position, controllers[1].position);
  assert.deepEqual(controllers[1].position, controllers[2].position);
  assert.equal(controllers[0].targetIndex, controllers[1].targetIndex);
  assert.equal(controllers[1].targetIndex, controllers[2].targetIndex);
});
