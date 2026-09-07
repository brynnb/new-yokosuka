#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const INPUT = process.env.SCHEDULED_ACTOR_MANIFEST
  || "play/data/scheduled-actors.json";
const OUTPUT = process.env.SCHEDULED_ACTOR_LOCAL_OBJECT_OUTPUT
  || "tools/evidence/scheduled-actor-local-object-inventory.json";

const manifest = JSON.parse(fs.readFileSync(INPUT, "utf8"));

const PLACEMENT_MODE_TARGETS = new Map([
  [0, { kind: "controller-node", nativeNodeId: 12 }],
  [1, { kind: "controller-node", nativeNodeId: 18 }],
  [2, { kind: "controller-node", nativeNodeId: 12 }],
  [3, { kind: "controller-node", nativeNodeId: 18 }],
  [4, { kind: "controller-node", nativeNodeId: 5 }],
  [5, { kind: "controller-node", nativeNodeId: 9 }],
  [6, { kind: "controller-node", nativeNodeId: 15 }],
  [7, { kind: "controller-node", nativeNodeId: 7 }],
  [8, { kind: "controller-node", nativeNodeId: 13 }],
  [9, { kind: "controller-node", nativeNodeId: 2 }],
  [10, { kind: "actor-controller-transform", actorControllerOffset: "0x6c" }],
  [11, { kind: "actor-world-transform" }],
]);

function loadRuntimePlacements() {
  const byAreaAndTag = new Map();
  for (const filename of fs.readdirSync("play/data")) {
    if (!filename.endsWith("-runtime-placements.json")) continue;
    const document = JSON.parse(fs.readFileSync(path.join("play/data", filename)));
    const area = filename.split("-runtime-placements.json")[0].toUpperCase();
    for (const placement of document.placements || []) {
      const tag = placement.runtime?.objectTag ?? placement.objectTag;
      if (!tag) continue;
      const candidates = byAreaAndTag.get(`${area}:${tag}`) || [];
      candidates.push({
        source: `play/data/${filename}`,
        model: placement.model ?? null,
        runtimeObjectTag: tag,
        runtimeModelAddress: placement.runtime?.modelAddress ?? null,
        runtimeTaskAddress: placement.runtime?.taskAddress ?? null,
      });
      byAreaAndTag.set(`${area}:${tag}`, candidates);
    }
  }
  return byAreaAndTag;
}

const AREA_TO_PLACEMENT_PREFIX = new Map([
  ["D000", "D000"],
  ["DGCT", "DGCT"],
  ["JD00", "JD00"],
  ["JHD0", "JHD0"],
  ["JOMO", "JOMO"],
  ["JU00", "JU00"],
  ["MA00", "MA00-RACE"],
  ["MFSY", "MFSY"],
  ["MKSG", "MKSG"],
  ["MS08", "MS08"],
]);

const runtimePlacements = loadRuntimePlacements();
const registrations = [];
const transitions = [];

function modelBasename(model) {
  return model?.replace(/^S[123]_[^_]+_/, "") || null;
}

function addRegistration(actor, variant, journey, area, record, container) {
  const local = record.localTransform || record;
  const placementArea = AREA_TO_PLACEMENT_PREFIX.get(area) || area;
  registrations.push({
    actorCode: actor.actorCode,
    actorLabel: actor.label,
    instanceId: actor.instanceId,
    sourceProgramByteSha256: actor.sourceProgramByteSha256,
    scheduleVariantId: variant.scheduleVariantId,
    journeyStartSecond: journey.startSecond,
    journeyStartTime: journey.startTime,
    area,
    container,
    operation: record.operation,
    sourceOffset: record.fileOffset ?? record.address,
    objectCode: local.objectCode,
    locationCode: local.locationCode,
    controlWord: local.controlWord,
    placementMode: local.placementMode,
    nativePlacementTarget: PLACEMENT_MODE_TARGETS.get(local.placementMode) || null,
    auxiliaryControlWord: local.auxiliaryControlWord,
    runtimePosition: local.runtimePosition,
    browserPosition: local.browserPosition,
    transformControlWords: local.transformControlWords,
    runtimeLocationCandidates: runtimePlacements.get(
      `${placementArea}:${local.locationCode}`,
    ) || [],
  });
}

function addTransition(actor, variant, journey, area, record, container) {
  transitions.push({
    actorCode: actor.actorCode,
    actorLabel: actor.label,
    instanceId: actor.instanceId,
    sourceProgramByteSha256: actor.sourceProgramByteSha256,
    scheduleVariantId: variant.scheduleVariantId,
    journeyStartSecond: journey.startSecond,
    journeyStartTime: journey.startTime,
    area,
    container,
    operation: record.operation,
    sourceOffset: record.fileOffset ?? record.address,
    objectCode: record.objectCode,
    nativeEffect: "state 3 with a 30-frame fade-out timer",
  });
}

for (const actor of manifest.actors || []) {
  for (const variant of actor.scheduleVariants || []) {
    for (const journey of variant.journeys || []) {
      let area = null;
      for (const operation of journey.operations || []) {
        if (operation.operation === 0x08) area = operation.area;
        if (
          (operation.operation === 0x10 || operation.operation === 0x2d)
          && operation.localTransform
        ) {
          addRegistration(actor, variant, journey, area, operation, "journey");
        } else if (
          operation.operation === 0x11 || operation.operation === 0x2e
        ) {
          addTransition(actor, variant, journey, area, operation, "journey");
        }
        for (const record of operation.subordinateStream?.records || []) {
          if (record.operation === 0x10 || record.operation === 0x2d) {
            addRegistration(
              actor,
              variant,
              journey,
              area,
              record,
              `operation-${operation.operation.toString(16)}-subordinate`,
            );
          } else if (record.operation === 0x11 || record.operation === 0x2e) {
            addTransition(
              actor,
              variant,
              journey,
              area,
              record,
              `operation-${operation.operation.toString(16)}-subordinate`,
            );
          }
        }
      }
    }
  }
}

function sourceKey(record) {
  return [
    record.sourceProgramByteSha256,
    record.sourceOffset,
    record.operation,
  ].join(":");
}

function uniqueSourceRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = sourceKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...record, scheduleReferences: [] });
    }
    byKey.get(key).scheduleReferences.push({
      scheduleVariantId: record.scheduleVariantId,
      journeyStartSecond: record.journeyStartSecond,
      area: record.area,
    });
  }
  return [...byKey.values()];
}

const uniqueRegistrations = uniqueSourceRecords(registrations);
const uniqueTransitions = uniqueSourceRecords(transitions);
const fukuharaRegistrations = uniqueRegistrations.filter(
  (record) => record.actorCode === "FUKU",
);
const fukuharaSo01Registrations = fukuharaRegistrations.filter(
  (record) => record.locationCode === "SO01",
);
const fukuharaSo01ModelBasenames = [...new Set(
  fukuharaSo01Registrations.flatMap(
    (record) => record.runtimeLocationCandidates.map(
      (candidate) => modelBasename(candidate.model),
    ),
  ).filter(Boolean),
)];
const fukuhara = {
  actorCode: "FUKU",
  registrations: fukuharaRegistrations,
  transitions: uniqueTransitions.filter(
    (record) => record.actorCode === "FUKU",
  ),
  sweepPropResolution: {
    locationCode: "SO01",
    objectCode: "ITEM",
    resolvedModelBasename: (
      fukuharaSo01ModelBasenames.length === 1
        ? fukuharaSo01ModelBasenames[0]
        : null
    ),
    runtimeCandidateModels: [...new Set(
      fukuharaSo01Registrations.flatMap(
        (record) => record.runtimeLocationCandidates.map(
          (candidate) => candidate.model,
        ),
      ),
    )],
    placementMode: 2,
    nativeControllerNodeId: 12,
    localTransform: {
      runtimePosition: [0.43518999218940735, -0.8508099913597107, 0.48438000679016113],
      browserPosition: [-0.43518999218940735, -0.8508099913597107, 0.48438000679016113],
      transformControlWords: [4733, 31675, 3822],
    },
    resolutionStatus: (
      fukuharaSo01ModelBasenames.length === 1
        ? "exact runtime scene-object owner model"
        : "unresolved"
    ),
    evidence: (
      "Every runtime-resolved SO01 registration in JOMO and JHD0 names "
      + "HOUS501G.MT5. The native resolver retains that scene object's "
      + "render pointer, and the model contains one render hierarchy root, "
      + "so there is no remaining subtree choice."
    ),
  },
  evidenceBoundary: (
    "SO01 is resolved to the exact HOUS501G.MT5 scene object by independent "
    + "JOMO and JHD0 runtime placements. The generic lifecycle and authored "
    + "transform are proven statically. No saved RAM capture contains "
    + "Fukuhara with the record active, so a live final-matrix comparison "
    + "remains useful validation rather than a prerequisite for identifying "
    + "the prop."
  ),
};

const output = {
  schema: "new-yokosuka-scheduled-actor-local-object-inventory-v1",
  generatedFrom: INPUT,
  nativeEvidence: {
    registrationHandler: "0x0c11d1de",
    transitionHandler: "0x0c11d2b6",
    targetResolutionAndActivationHandler: "0x0c11d3a8",
    perFrameTransformAndRenderHandler: "0x0c11d53c",
    attachmentMatrixHandler: "0x0c11d6fa",
    placementModeMapper: "0x0c11d960",
    controllerNodeResolver: "0x0c1140e6",
    controllerRecordSearch: "0x0c092ea0",
    controllerRecordByteLength: 72,
    controllerRecordTypeOffset: "0x00",
    controllerRecordMatrixOffset: "0x44",
    sceneObjectLookup: "0x0c152e54",
    actorLocalObjectListOffset: "0x94",
    recordByteLength: 56,
    recordOffsets: {
      next: "0x00",
      placementMode: "0x08",
      resolvedTargetRenderObject: "0x0c",
      localPosition: "0x10",
      transformControlWords: "0x1c",
      state: "0x28",
      fadeTimer: "0x29",
      actor: "0x2c",
      sourceOperation: "0x30",
    },
    placementModeTargets: Object.fromEntries(PLACEMENT_MODE_TARGETS),
    registrationEffect: (
      "Allocate or reuse a record keyed by source operation objectCode, copy "
      + "the local transform, set state 2, and start fadeTimer at 0."
    ),
    transitionEffect: "Set state 3 and fadeTimer 30.",
    targetLookupRule: (
      "Look up sourceOperation.locationCode in the current scene object "
      + "registry and retain the returned object's render pointer at +0x40."
    ),
    renderRule: (
      "For each active record, resolve the authored placement target, compose "
      + "its matrix with local position and three fixed-turn controls, then "
      + "render the retained scene object. States 2 and 3 scale visibility "
      + "with the record's frame timer."
    ),
    controllerRoutingRule: (
      "Placement modes 0 through 9 produce a MOMT controller-node type. "
      + "FUN_0c1140e6 obtains the actor's MOMT controller array and "
      + "FUN_0c092ea0 scans its 72-byte records until record byte +0x00 "
      + "equals that type; the attachment parent matrix is record +0x44. "
      + "The type therefore resolves through the actor's authored controller "
      + "family and is not a fixed controller index or MT5 render key."
    ),
  },
  summary: {
    expandedRegistrationReferenceCount: registrations.length,
    uniqueRegistrationCount: uniqueRegistrations.length,
    expandedTransitionReferenceCount: transitions.length,
    uniqueTransitionCount: uniqueTransitions.length,
    actorCodeCount: new Set(uniqueRegistrations.map((record) => (
      record.actorCode
    ))).size,
    locationCodeCount: new Set(uniqueRegistrations.map((record) => (
      record.locationCode
    ))).size,
    runtimeResolvedCandidateCount: uniqueRegistrations.filter(
      (record) => record.runtimeLocationCandidates.length > 0,
    ).length,
    placementModeCounts: Object.fromEntries(
      [...PLACEMENT_MODE_TARGETS.keys()].map((mode) => [
        mode,
        uniqueRegistrations.filter(
          (record) => record.placementMode === mode,
        ).length,
      ]),
    ),
  },
  registrations: uniqueRegistrations,
  transitions: uniqueTransitions,
  fukuhara,
  evidenceBoundary: (
    "This inventory proves scheduler records, native target selection, "
    + "placement transforms, and lifecycle. Candidate MT5 ownership comes "
    + "only from exact runtime object-tag captures. It does not rename props "
    + "from context or guess an owning model's internal render subtree."
  ),
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `wrote ${OUTPUT}: ${uniqueRegistrations.length} registrations, `
  + `${uniqueTransitions.length} transitions`,
);
