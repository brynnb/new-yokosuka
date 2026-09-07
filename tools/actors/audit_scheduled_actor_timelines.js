#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  createSecondaryRouteController,
  scheduledDescriptorState,
} from "../lib/ScheduledActorOfflineRuntime.js";

const manifestPath = path.resolve(
  process.argv[2] || "play/data/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[3]
    || "tools/evidence/scheduled-actor-runtime-audit.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function operationCounts(journeys) {
  const counts = new Map();
  for (const journey of journeys) {
    for (const operation of journey.operations) {
      counts.set(operation.operation, (counts.get(operation.operation) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([operation, count]) => [
      `0x${operation.toString(16).padStart(2, "0")}`,
      count,
    ]));
}

function sampleSeconds(journeys) {
  const seconds = new Set([0, 86399]);
  for (let second = 0; second < 86400; second += 300) seconds.add(second);
  for (const journey of journeys) {
    for (const delta of [-1, 0, 1]) {
      seconds.add(Math.max(0, Math.min(86399, journey.startSecond + delta)));
    }
    let descriptorSecond = journey.startSecond;
    for (const operation of journey.operations) {
      if (operation.operation === 7) {
        descriptorSecond += operation.durationSeconds;
        for (const delta of [-1, 0, 1]) {
          seconds.add(Math.max(0, Math.min(86399, descriptorSecond + delta)));
        }
      }
      if (operation.operation === 0x16) {
        const activationSecond = operation.activationSecond < 0
          ? journey.startSecond - operation.activationSecond
          : operation.activationSecond;
        const notBeforeSecond = Math.max(
          journey.startSecond + operation.minimumDelaySeconds,
          activationSecond,
        );
        for (const delta of [-1, 0, 1]) {
          seconds.add(Math.max(0, Math.min(86399, notBeforeSecond + delta)));
        }
      }
      if (
        operation.operation === 0x18
        && Number.isFinite(operation.gateReleaseSecond)
      ) {
        for (const delta of [-1, 0, 1]) {
          seconds.add(Math.max(
            0,
            Math.min(86399, operation.gateReleaseSecond + delta),
          ));
        }
      }
      if (
        operation.operation === 0x22
        && Number.isFinite(operation.gateReleaseSecond)
      ) {
        for (const delta of [-1, 0, 1]) {
          seconds.add(Math.max(
            0,
            Math.min(86399, operation.gateReleaseSecond + delta),
          ));
        }
      }
    }
  }
  return [...seconds].sort((left, right) => left - right);
}

function isFiniteState(state) {
  return (
    state
    && Array.isArray(state.position)
    && state.position.length === 3
    && state.position.every(Number.isFinite)
    && (state.rootYaw == null || Number.isFinite(state.rootYaw))
  );
}

function isKnownHiddenSentinel(position) {
  return (
    position.every((value) => value === 1000 || value === -1000)
    || position.every((value) => value === 998 || value === -998)
    || (
      Math.abs(position[0]) === 10000
      && position[1] === 0
      && position[2] === 0
    )
  );
}

function unresolvedReason(journeys) {
  if (journeys.length === 0) return "native-empty-timetable";
  const operations = journeys.flatMap((journey) => journey.operations);
  if (operations.some(
    (operation) => operation.operation === 1 && !operation.points?.length,
  )) {
    return "operation-1-route-operands-not-proven-as-XYZ";
  }
  if (operations.some((operation) => operation.operation === 0x16)) {
    const exactLinkedOperations = journeys.flatMap(
      (journey, journeyIndex) => journey.operations.filter(
        (operation) => (
          operation.operation === 0x16
          && operation.linkedPlacement?.position?.length === 3
        ),
      ).map((operation) => {
        const activationSecond = operation.activationSecond < 0
          ? journey.startSecond - operation.activationSecond
          : operation.activationSecond;
        return {
          notBeforeSecond: Math.max(
            journey.startSecond + operation.minimumDelaySeconds,
            activationSecond,
          ),
          nextJourneySecond:
            journeys[journeyIndex + 1]?.startSecond ?? 86400,
        };
      }),
    );
    if (
      exactLinkedOperations.length > 0
      && exactLinkedOperations.every(
        (operation) => (
          operation.notBeforeSecond >= operation.nextJourneySecond
        ),
      )
    ) {
      return "operation-16-gate-superseded-by-next-journey";
    }
    return "shared-MCIR-leaf-allocation-not-simulated";
  }
  if (operations.some(
    (operation) => operation.operation === 0x1c
      || operation.operation === 0x24,
  )) {
    return "secondary-object-controller-without-direct-actor-transform";
  }
  if (!operations.some(
    (operation) => [1, 3, 0x16].includes(operation.operation),
  )) {
    return "descriptor-has-no-actor-world-position-operation";
  }
  return "runtime-state-unresolved";
}

const actorAudits = manifest.actors.map((actor) => {
  const variants = actor.scheduleVariants.map((variant) => {
    const definition = { ...actor, journeys: variant.journeys };
    const samples = sampleSeconds(variant.journeys);
    const states = samples.map((second) => {
      const gameDate = new Date(Date.UTC(2000, 0, 1, 0, 0, second));
      const descriptorState = scheduledDescriptorState(
        definition,
        gameDate,
        manifest.areaWorlds,
      );
      const residencyController = descriptorState
        ? null
        : createSecondaryRouteController(
          definition,
          gameDate,
          manifest.areaWorlds,
        );
      return {
        second,
        state: descriptorState || residencyController,
        stateSource: descriptorState
          ? "clock-driven-descriptor"
          : residencyController
            ? "map-residency-secondary-route-controller"
            : null,
      };
    }).filter(({ state }) => state !== null);
    const invalidStates = states.filter(({ state }) => !isFiniteState(state));
    const finiteStates = states.filter(({ state }) => isFiniteState(state));
    const visibleStates = finiteStates.filter(
      ({ state }) => !isKnownHiddenSentinel(state.position),
    );
    const authoredAreas = [...new Set(variant.journeys.flatMap(
      (journey) => journey.areas,
    ))].sort();
    const secondaryObjects = variant.journeys.flatMap(
      (journey) => journey.operations.filter(
        (operation) => operation.operation === 0x24,
      ).map((operation) => ({
        code: operation.secondaryObjectCode,
        browserVector: operation.browserVector,
        transformControlWord: operation.transformControlWord,
        enabled: operation.enabled,
      })),
    );
    const unsupportedAreas = authoredAreas.filter(
      (area) => !manifest.areaWorlds[area],
    );
    return {
      scheduleVariantId: variant.scheduleVariantId,
      selectorIndices: variant.selectorIndices,
      selectedByDefault:
        variant.scheduleVariantId === actor.defaultScheduleVariantId,
      journeyCount: variant.journeys.length,
      operationCounts: operationCounts(variant.journeys),
      secondaryObjects,
      sampleCount: samples.length,
      finiteStateSampleCount: finiteStates.length,
      residencyControllerSampleCount: finiteStates.filter(
        ({ stateSource }) => (
          stateSource === "map-residency-secondary-route-controller"
        ),
      ).length,
      visibleStateSampleCount: visibleStates.length,
      hiddenSentinelStateSampleCount:
        finiteStates.length - visibleStates.length,
      invalidStateSampleCount: invalidStates.length,
      authoredAreas,
      unsupportedAreas,
      status: invalidStates.length > 0
        ? "invalid-runtime-state"
        : finiteStates.length > 0
          ? "finite-runtime-state"
          : "no-runtime-state",
      unresolvedReason: finiteStates.length === 0
        ? unresolvedReason(variant.journeys)
        : null,
    };
  });
  return {
    instanceId: actor.instanceId,
    actorCode: actor.actorCode,
    label: actor.label,
    sourceContexts: actor.sourceContexts,
    playbackAreas: actor.playbackAreas,
    playbackWorldIds: actor.playbackWorldIds,
    variantCount: variants.length,
    hasFiniteRuntimeState: variants.some(
      (variant) => variant.finiteStateSampleCount > 0,
    ),
    hasVisibleRuntimeState: variants.some(
      (variant) => variant.visibleStateSampleCount > 0,
    ),
    variants,
  };
});

const variants = actorAudits.flatMap((actor) => actor.variants);
const linkedOperations = manifest.actors.flatMap(
  (actor) => actor.scheduleVariants.flatMap(
    (variant) => variant.journeys.flatMap(
      (journey) => journey.operations.filter(
        (operation) => operation.operation === 0x16,
      ),
    ),
  ),
);
const unresolvedLinkedPlacementReasonCounts = Object.fromEntries(
  [...new Set(linkedOperations.filter(
    (operation) => operation.linkedPlacementUnresolved,
  ).map(
    (operation) => operation.linkedPlacementUnresolved.reason,
  ))].sort().map((reason) => [
    reason,
    linkedOperations.filter(
      (operation) => (
        operation.linkedPlacementUnresolved?.reason === reason
      ),
    ).length,
  ]),
);
const unresolvedReasons = {};
for (const variant of variants) {
  if (variant.unresolvedReason) {
    unresolvedReasons[variant.unresolvedReason] = (
      unresolvedReasons[variant.unresolvedReason] || 0
    ) + 1;
  }
}

const report = {
  schema: "new-yokosuka-scheduled-actor-runtime-audit-v1",
  generatedFrom: path.relative(process.cwd(), manifestPath),
  sampling: {
    regularIntervalSeconds: 300,
    boundarySamples: (
      "midnight/end-of-day, every journey start ±1 second, cumulative "
      + "operation-0x07 gates ±1 second, and operation-0x16 activation "
      + "gates ±1 second"
    ),
  },
  evidenceBoundary: (
    "A finite browser state proves that the extracted descriptor can place "
    + "the mapped actor in the current schedule interpreter. A no-state "
    + "classification preserves the exact native operation family that still "
    + "owns placement; it is not treated as proof that the actor is absent. "
    + "Operation-0x1c programs are initialized at their first exact route "
    + "state and then advanced by the browser's map-residency controller, "
    + "rather than being assigned a timetable-relative phase."
  ),
  summary: {
    actorCodeCount: new Set(actorAudits.map((actor) => actor.actorCode)).size,
    actorInstanceCount: actorAudits.length,
    scheduleVariantCount: variants.length,
    timetableEntryCount: manifest.summary.timetableEntryCount,
    actorInstancesWithFiniteRuntimeState: actorAudits.filter(
      (actor) => actor.hasFiniteRuntimeState,
    ).length,
    actorInstancesWithoutFiniteRuntimeState: actorAudits.filter(
      (actor) => !actor.hasFiniteRuntimeState,
    ).length,
    variantsWithFiniteRuntimeState: variants.filter(
      (variant) => variant.finiteStateSampleCount > 0,
    ).length,
    variantsWithoutFiniteRuntimeState: variants.filter(
      (variant) => variant.finiteStateSampleCount === 0,
    ).length,
    variantsWithInvalidRuntimeState: variants.filter(
      (variant) => variant.invalidStateSampleCount > 0,
    ).length,
    variantsUsingMapResidencySecondaryRouteController: variants.filter(
      (variant) => variant.residencyControllerSampleCount > 0,
    ).length,
    linkedPlacementOperationCount: linkedOperations.length,
    exactLinkedPlacementCount: linkedOperations.filter(
      (operation) => operation.linkedPlacement?.position?.length === 3,
    ).length,
    allocationIndependentSingleLeafLinkedPlacementCount:
      linkedOperations.filter(
      (operation) => (
        operation.linkedPlacement?.status
        === "allocation-independent single MCIR leaf endpoint"
      ),
    ).length,
    allocationIndependentSharedEndpointLinkedPlacementCount:
      linkedOperations.filter(
        (operation) => (
          operation.linkedPlacement?.status
          === "allocation-independent identical MCIR leaf endpoints"
        ),
      ).length,
    sourceWideExclusiveFirstClaimLinkedPlacementCount:
      linkedOperations.filter(
        (operation) => (
          operation.linkedPlacement?.status
          === (
            "source-wide exclusive first claim on zero-initialized "
            + "MCIR root"
          )
        ),
      ).length,
    captureProvenExactOperationLinkedPlacementCount: linkedOperations.filter(
      (operation) => (
        operation.linkedPlacement?.status
        === "capture-proven deterministic exact-operation MCIR leaf"
      ),
    ).length,
    captureProvenAreaProgramLinkedPlacementCount: linkedOperations.filter(
      (operation) => (
        operation.linkedPlacement?.status
        === "capture-proven deterministic map/program MCIR leaf"
      ),
    ).length,
    unresolvedSharedAllocationLinkedPlacementCount: linkedOperations.filter(
      (operation) => !operation.linkedPlacement,
    ).length,
    unresolvedLinkedPlacementReasonCounts,
    unresolvedReasons,
  },
  actors: actorAudits,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: `
  + `${report.summary.actorInstancesWithFiniteRuntimeState}/`
  + `${report.summary.actorInstanceCount} actor instances and `
  + `${report.summary.variantsWithFiniteRuntimeState}/`
  + `${report.summary.scheduleVariantCount} schedule variants have finite `
  + "runtime states.",
);
