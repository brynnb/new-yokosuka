import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { stepSecondaryRoute } from "../tools/lib/ScheduledActorOfflineRuntime.js";

const evidence = JSON.parse(fs.readFileSync(
  "tools/evidence/scheduled-actor-attachment-evidence.json",
  "utf8",
));
const sourcePath = "tools/evidence/scheduled-actors.json";
const sourceAvailable = fs.existsSync(sourcePath);
const source = sourceAvailable
  ? JSON.parse(fs.readFileSync(sourcePath, "utf8"))
  : null;

test("runtime attachment evidence is derived structurally across captures", () => {
  assert.equal(
    evidence.handlerEvidence.descriptorDispatchPointerAddress,
    "0x0c11979c",
  );
  assert.equal(
    evidence.handlerEvidence.descriptorDispatchTargetAddress,
    "0x0c12b9a0",
  );
  assert.equal(evidence.handlerEvidence.actorAttachmentPointerOffset, "0x98");
  assert.equal(evidence.summary.operation24ActorCodeCount, 29);
  assert.equal(evidence.summary.relevantCaptureCount, 249);
  assert.equal(evidence.summary.runtimeActorObservationCount, 2469);
  assert.equal(evidence.summary.exactSchedulerClockCaptureCount, 249);
  assert.equal(
    evidence.handlerEvidence.schedulerClockFunctionAddress,
    "0x0c114856",
  );
  assert.match(
    evidence.handlerEvidence.schedulerClockDiscovery,
    /unique reviewed 1ST_READ literal signature/,
  );
});

test("reviewed forklift captures retain exact scheduler clock seconds", () => {
  const byPath = new Map(evidence.captures.map(
    (capture) => [capture.path, capture],
  ));
  assert.equal(
    byPath.get(
      "captures/pvr/20260726-001534-frame-163030/ram.bin",
    ).schedulerClock.second,
    8 * 3600 + 48 * 60 + 50,
  );
  assert.equal(
    byPath.get(
      "captures/pvr/20260726-010220-frame-37505/ram.bin",
    ).schedulerClock.second,
    12 * 3600 + 1 * 60 + 37,
  );
});

test("every owner-matched active attachment mirrors actor placement exactly", () => {
  assert.equal(evidence.summary.activeAttachmentObservationCount, 284);
  assert.equal(evidence.summary.bitExactActiveAttachmentCount, 284);
  assert.equal(evidence.summary.mismatchCount, 0);
  assert.equal(evidence.summary.staleOrReusedAttachmentPointerCount, 5);

  const exact = evidence.captures.flatMap(
    (capture) => capture.actors.filter(
      (actor) => actor.status === "bit-exact-active-attachment",
    ),
  );
  assert.equal(exact.length, 284);
  for (const actor of exact) {
    assert.equal(actor.attachmentOwnsActor, true);
    assert.equal(actor.attachedActorCode, actor.actorCode);
    assert.equal(actor.actorPositionMatchesObject, true);
    assert.equal(actor.actorFacingMatchesObject, true);
    assert.deepEqual(actor.actorRuntimePosition, actor.objectRuntimePosition);
    assert.equal(actor.actorFacingFixed, actor.objectFacingFixed);
  }
});

test("forklift controllers are among the proven linked actor/object records", () => {
  for (const actorCode of ["FLD6", "FLDB", "FLDE", "FLDG"]) {
    assert.ok(
      evidence.summary.activeAttachmentActorCodes.includes(actorCode),
      actorCode,
    );
  }
  assert.ok(evidence.summary.activeSecondaryObjectCodes.includes("FK01"));
  assert.ok(evidence.summary.activeSecondaryObjectCodes.includes("FK02"));
});

test("dynamic forklift routes match offline XZ arrays and expose native progress", () => {
  assert.equal(evidence.handlerEvidence.actorRoutePointerOffset, "0x5c");
  assert.equal(evidence.handlerEvidence.actorRoutePointCountOffset, "0x60");
  assert.equal(evidence.handlerEvidence.actorRouteTargetIndexOffset, "0x62");
  assert.equal(evidence.handlerEvidence.actorFramePathStepOffset, "0x58");
  assert.equal(evidence.handlerEvidence.actorPathStepOffset, "0x140");
  assert.equal(
    evidence.handlerEvidence.actorPreviousUpdatePositionOffset,
    "0x168",
  );
  assert.equal(
    evidence.handlerEvidence.routedMovementFunctionAddress,
    "0x0c12751a",
  );
  assert.equal(
    evidence.handlerEvidence.framePathStepPreparationAddress,
    "0x0c127a9a",
  );
  assert.equal(
    evidence.handlerEvidence.positivePathControlScaleAddress,
    "0x0c1290f0",
  );
  assert.equal(
    evidence.handlerEvidence.positivePathControlRule,
    "pathControlFloat * positivePathControlScale",
  );
  assert.equal(evidence.summary.sourceRouteOperationCount, 114);
  assert.equal(evidence.summary.sourceRouteActorCodeCount, 18);
  assert.equal(evidence.summary.sourceRoutePointCount, 12871);
  assert.equal(evidence.summary.sourcePositiveTwentyRouteOperationCount, 49);
  assert.equal(evidence.summary.sourceNegativeTwentyRouteOperationCount, 65);
  assert.equal(evidence.summary.sourceResolvedPathStepOperationCount, 114);
  assert.equal(
    evidence.handlerEvidence.negativePathControlSelectorAddress,
    "0x0c12ab92",
  );
  assert.equal(
    evidence.handlerEvidence.negativeTwentyRule,
    "-20 selects index 1 from the attachment-type path-step table",
  );
  assert.equal(evidence.handlerEvidence.forkliftObjectPrefix, "FK0");
  assert.equal(
    evidence.handlerEvidence.forkliftPathStepTableAddress,
    "0x0c2778a4",
  );
  assert.equal(evidence.handlerEvidence.forkliftPathStepTable.length, 5);
  assert.ok(evidence.handlerEvidence.forkliftPathStepTable.every(
    (value) => (
      value === evidence.handlerEvidence.positiveTwentyPathStep
    ),
  ));
  assert.equal(evidence.summary.exactSourceRouteArrayObservationCount, 56);
  assert.equal(
    evidence.summary.exactSourceRouteFrameDisplacementMatchCount,
    56,
  );
  assert.equal(
    evidence.summary.exactSourceRouteResolvedPathStepMatchCount,
    56,
  );

  const dynamic = evidence.captures.flatMap(
    (capture) => capture.actors.filter(
      (actor) => (
        ["FLD6", "FLDB", "FLDE", "FLDG"].includes(actor.actorCode)
        && actor.status === "bit-exact-active-attachment"
      ),
    ),
  );
  assert.ok(dynamic.length > 0);
  for (const actor of dynamic) {
    assert.ok(actor.currentRouteExactSourceMatchCount > 0, actor.actorCode);
    assert.ok(actor.currentRoutePointCount > 1, actor.actorCode);
    assert.ok(actor.currentRouteTargetIndex > 0, actor.actorCode);
    assert.ok(
      actor.currentRouteTargetIndex < actor.currentRoutePointCount,
      actor.actorCode,
    );
    assert.ok(Number.isFinite(actor.runtimePathStep));
    assert.ok(actor.runtimePathStep > 0);
    assert.equal(actor.runtimeFramePathStep, actor.runtimePathStep);
    assert.ok(actor.previousUpdateRuntimePosition.every(Number.isFinite));
    assert.deepEqual(
      actor.previousUpdateBrowserPosition,
      [
        -actor.previousUpdateRuntimePosition[0],
        actor.previousUpdateRuntimePosition[1],
        actor.previousUpdateRuntimePosition[2],
      ],
    );
    assert.ok(Number.isFinite(actor.observedUpdateDisplacement));
    assert.equal(
      actor.observedUpdateDisplacementMatchesFramePathStep,
      true,
    );
    assert.ok(
      Math.abs(
        actor.observedUpdateDisplacement - actor.runtimeFramePathStep
      ) <= 0.00001,
    );
    assert.ok(actor.currentRouteExactSourceMatches.some(
      (route) => route.secondaryObjectCode === actor.secondaryObjectCode,
    ));
    const matchingRoute = actor.currentRouteExactSourceMatches.find(
      (route) => route.secondaryObjectCode === actor.secondaryObjectCode,
    );
    assert.equal(
      actor.runtimePathStep,
      matchingRoute.resolvedPathStepPerUpdate,
    );
  }
});

test("one secondary-route update reproduces every source-matched capture", {
  skip: (
    !sourceAvailable
    && "requires the locally generated scheduled-actor source inventory"
  ),
}, () => {
  const operations = new Map(source.sourceVariants.flatMap(
    (variant) => variant.scheduleTables.flatMap(
      (table) => table.entries.flatMap(
        (entry) => entry.descriptor.operations.map(
          (operation) => [
            `${variant.sourceVariantId}:${operation.fileOffset}`,
            operation,
          ],
        ),
      ),
    ),
  ));
  const observations = evidence.captures.flatMap(
    (capture) => capture.actors.filter(
      (actor) => (
        actor.status === "bit-exact-active-attachment"
        && actor.currentRouteExactSourceMatchCount > 0
      ),
    ),
  );
  assert.equal(observations.length, 56);

  for (const actor of observations) {
    const match = actor.currentRouteExactSourceMatches[0];
    const operation = operations.get(
      `${match.sourceVariantId}:${match.sourceOperationFileOffset}`,
    );
    assert.ok(operation?.secondaryRoute?.browserPoints?.length);
    const stepped = stepSecondaryRoute(
      operation.secondaryRoute.browserPoints,
      actor.previousUpdateBrowserPosition,
      actor.currentRouteTargetIndex,
      actor.runtimeFramePathStep,
    );
    assert.ok(stepped);
    assert.equal(stepped.completed, false);
    assert.equal(stepped.targetIndex, actor.currentRouteTargetIndex);
    assert.ok(
      Math.hypot(
        ...stepped.position.map(
          (value, axis) => value - actor.actorBrowserPosition[axis],
        ),
      ) <= 0.00001,
      actor.actorCode,
    );
  }
});

test("shared route phase follows residency rather than timetable start", () => {
  assert.equal(evidence.summary.synchronizedSharedRouteGroupCount, 5);
  assert.equal(evidence.summary.uniqueSynchronizedSharedRouteStateCount, 2);
  assert.equal(
    evidence.summary.synchronizedSharedRouteGroupsWithDifferentJourneyStarts,
    5,
  );
  assert.equal(
    evidence.summary.maximumSynchronizedJourneyStartSecondSpan,
    20 * 60,
  );

  const uniqueStates = new Map();
  for (const group of evidence.synchronizedRouteGroups) {
    assert.ok(group.actors.length >= 2);
    assert.ok(group.distinctJourneyStartSeconds.length >= 2);
    assert.ok(group.journeyStartSecondSpan > 0);
    for (const actor of group.actors) {
      assert.equal(typeof actor.journeyStartSecond, "number");
      assert.match(actor.sourceVariantId, new RegExp(`^${actor.actorCode}:`));
    }
    const signature = [
      group.schedulerClockSecond,
      group.routePointWordsSha256,
      group.currentRouteTargetIndex,
      ...group.actorRuntimePosition,
      ...group.previousUpdateRuntimePosition,
    ].join(":");
    uniqueStates.set(signature, group);
  }
  assert.equal(uniqueStates.size, 2);

  const harbor = [...uniqueStates.values()].find(
    (group) => group.likelyArea === "MFSY",
  );
  assert.ok(harbor);
  assert.deepEqual(
    harbor.actors.map((actor) => actor.actorCode),
    ["FLD8", "FLDB", "FLDG"],
  );
  assert.deepEqual(
    harbor.distinctJourneyStartSeconds,
    [8 * 3600 + 30 * 60, 8 * 3600 + 41 * 60, 8 * 3600 + 50 * 60],
  );
  assert.equal(harbor.journeyStartSecondSpan, 20 * 60);
});
