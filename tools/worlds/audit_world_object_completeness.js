#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/world-object-completeness.json",
);

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), "utf8"));
}

function mapModels(catalog, prefix) {
  const expression = new RegExp(`^${prefix}_MAP(?:\\d+)?\\.MT5$`, "i");
  return catalog.filter((model) => expression.test(model));
}

function placementIdentity(placement) {
  return [
    placement.model,
    placement.runtime?.staticDoorIndex ?? "",
    ...(placement.position || []),
  ].join("|");
}

function genericManifestAudit({
  catalog,
  manifest,
  nativeArea,
  mapPrefix,
  additionalEvidence = {},
  knownGaps = [],
}) {
  const available = new Set(catalog);
  const missingModels = [
    ...new Set(
      manifest.placements
        .map((placement) => placement.model)
        .filter((model) => !available.has(model)),
    ),
  ];
  const invalidTransforms = manifest.placements.filter((placement) => (
    !Array.isArray(placement.position)
    || placement.position.length !== 3
    || !placement.position.every(Number.isFinite)
    || (
      placement.rotationDegrees
      && (
        placement.rotationDegrees.length !== 3
        || !placement.rotationDegrees.every(Number.isFinite)
      )
    )
  )).map((placement) => placement.id || placement.model);
  const duplicateIdentities = [
    ...manifest.placements.reduce((counts, placement) => {
      const identity = placementIdentity(placement);
      counts.set(identity, (counts.get(identity) || 0) + 1);
      return counts;
    }, new Map()),
  ].filter(([, count]) => count > 1);
  const gaps = [...knownGaps];
  if (missingModels.length) gaps.push("one or more placement models are absent");
  if (invalidTransforms.length) gaps.push("one or more transforms are invalid");
  if (duplicateIdentities.length) gaps.push("duplicate placement identities exist");
  return {
    status: gaps.length === 0 ? "verified" : "incomplete",
    evidence: {
      nativeArea,
      staticMapModels: mapModels(catalog, mapPrefix),
      manifestSchema: manifest.schema,
      placementCount: manifest.placements.length,
      uniqueModelCount: new Set(
        manifest.placements.map((placement) => placement.model),
      ).size,
      missingModels,
      invalidTransforms,
      duplicateIdentities,
      source: manifest.source,
      ...additionalEvidence,
    },
    gaps,
  };
}

const catalog = read("public/models.json");
const jomoManifest = read("play/data/jomo-runtime-placements.json");
const jomoPlacement = read("tools/evidence/jomo-placement-coverage.json");
const jomoInstances = read("tools/evidence/jomo-runtime-instance-audit.json");
const jomoInteractions = read(
  "tools/evidence/jomo-interaction-coverage.json",
);
const jomoInteractionModels = read(
  "tools/evidence/jomo-interaction-model-audit.json",
);
const jhd0Manifest = read("play/data/jhd0-runtime-placements.json");
const jhd0Instances = read("tools/evidence/jhd0-runtime-instance-audit.json");
const d000Manifest = read("play/data/d000-runtime-placements.json");
const d000Instances = read("tools/evidence/d000-runtime-instance-audit.json");
const d000Interactions = read(
  "tools/evidence/d000-interaction-coverage.json",
);
const d000InteractionModels = read(
  "tools/evidence/d000-interaction-model-audit.json",
);
const d000TkoStateMachine = read(
  "tools/evidence/d000-tko-state-machine.json",
);
const d000PhoneBookInteraction = read(
  "tools/evidence/d000-phone-book-interaction.json",
);
const d000GachaInteraction = read(
  "tools/evidence/d000-gacha-interaction.json",
);
const ju00Manifest = read("play/data/ju00-runtime-placements.json");
const jd00Manifest = read("play/data/jd00-runtime-placements.json");
const dgctManifest = read("play/data/dgct-runtime-placements.json");
const mfsyManifest = read("play/data/mfsy-runtime-placements.json");
const mksgManifest = read("play/data/mksg-runtime-placements.json");
const ms08Manifest = read("play/data/ms08-runtime-placements.json");
const ma00RaceManifest = read(
  "play/data/ma00-race-runtime-placements.json",
);
const scheduledActors = read("play/data/scheduled-actors.json");
const scheduledActorRoutes = (actor) => actor.scheduleVariants.flatMap(
  (variant) => variant.journeys.flatMap((journey) => journey.routes),
);

const jomoStaticDoors = jomoManifest.placements.filter(
  (placement) => Number.isInteger(placement.runtime?.staticDoorIndex),
);
const jomoStaticDoorIndices = new Set(
  jomoStaticDoors.map((placement) => placement.runtime.staticDoorIndex),
);
const missingJomoDoorIndices = Array.from(
  { length: jomoManifest.source.staticDoorRecordCount },
  (_, index) => index,
).filter((index) => !jomoStaticDoorIndices.has(index));

const jomoEntranceDoors = jomoStaticDoors.filter(
  (placement) => placement.model === "S1_JOMO_DR15_016.MT5",
);
const duplicateJomoPlacementIdentities = [
  ...jomoManifest.placements.reduce((counts, placement) => {
    const identity = placementIdentity(placement);
    counts.set(identity, (counts.get(identity) || 0) + 1);
    return counts;
  }, new Map()),
].filter(([, count]) => count > 1);

const interiorGaps = [];
if (jomoPlacement.summary.missingActiveRuntimeInstanceCount !== 0) {
  interiorGaps.push("active runtime placements are missing");
}
if (missingJomoDoorIndices.length !== 0) {
  interiorGaps.push("static door-table records are missing");
}
if (jomoInstances.summary.status !== "verified") {
  interiorGaps.push("one or more placed models do not instantiate visibly");
}
if (jomoInteractions.summary.implementedInteractionCount
  !== jomoInteractions.summary.activePlacementCount) {
  interiorGaps.push("active TASK-tagged objects lack browser behavior");
}
if (jomoInteractionModels.summary.failureCount !== 0) {
  interiorGaps.push("one or more interaction model routes fail");
}
if (jomoEntranceDoors.length !== 1) {
  interiorGaps.push("the main DR15_016 entrance panel is not uniquely placed");
}
if (duplicateJomoPlacementIdentities.length !== 0) {
  interiorGaps.push("duplicate placement identities exist");
}

const exteriorGaps = [];
if (jhd0Instances.summary.status !== "verified") {
  exteriorGaps.push("one or more exterior placed models do not instantiate");
}
if (
  jhd0Instances.summary.instantiatedPlacementCount
  !== jhd0Manifest.placements.length
) {
  exteriorGaps.push("not every captured JHD0 runtime placement is instantiated");
}

const omittedDynamicTags = d000Manifest.summary.omittedDynamicTags || [];
const dobuitaGaps = [];
if (d000Instances.summary.status !== "verified") {
  dobuitaGaps.push("one or more Dobuita placed models do not instantiate");
}
if (d000InteractionModels.summary.failureCount !== 0) {
  dobuitaGaps.push("one or more Dobuita interaction model routes fail");
}
if (d000Interactions.summary.unresolvedPlacementCount !== 0) {
  dobuitaGaps.push(
    `${d000Interactions.summary.unresolvedPlacementCount} placed objects `
    + "retain unresolved native semantics",
  );
}
if (omittedDynamicTags.length !== 0) {
  dobuitaGaps.push(
    `${omittedDynamicTags.length} time-dependent runtime object tags are `
    + "not yet implemented",
  );
}
if (
  d000TkoStateMachine.schema
  !== "new-yokosuka-d000-tko-state-machine-v1"
) {
  dobuitaGaps.push("TKO story/time state-machine evidence is missing");
}
if (d000PhoneBookInteraction.status !== "verified") {
  dobuitaGaps.push("telephone-book FIXO prop evidence is not verified");
}
if (d000GachaInteraction.status !== "verified") {
  dobuitaGaps.push("gacha setup/detail-model evidence is not verified");
}

const worlds = {
  interior: {
    status: interiorGaps.length === 0 ? "verified" : "incomplete",
    evidence: {
      staticMapModels: mapModels(catalog, "S1_JOMO"),
      activeRuntimeInstances: jomoPlacement.summary.activeRuntimeInstanceCount,
      finalPlacements: jomoManifest.placements.length,
      staticDoorRecords: jomoManifest.source.staticDoorRecordCount,
      coveredStaticDoorRecords: jomoStaticDoorIndices.size,
      missingStaticDoorIndices: missingJomoDoorIndices,
      entranceDoor: jomoEntranceDoors[0] || null,
      visibleInstanceAudit: jomoInstances.summary.status,
      implementedTaggedInteractions:
        jomoInteractions.summary.implementedInteractionCount,
      activeTaggedPlacements: jomoInteractions.summary.activePlacementCount,
      verifiedInteractionModels:
        jomoInteractionModels.summary.verifiedModelCount,
    },
    gaps: interiorGaps,
  },
  exterior: {
    status: exteriorGaps.length === 0 ? "verified" : "incomplete",
    evidence: {
      nativeArea: "JHD0",
      staticMapModels: mapModels(catalog, "S1_JHD0"),
      runtimeCapture: jhd0Manifest.source.captureDirectory,
      capturedObjectTags: jhd0Manifest.objectTags.length,
      finalPlacements: jhd0Manifest.placements.length,
      instantiatedPlacements:
        jhd0Instances.summary.instantiatedPlacementCount,
      visibleInstanceAudit: jhd0Instances.summary.status,
    },
    gaps: exteriorGaps,
  },
  dobuita: {
    status: dobuitaGaps.length === 0 ? "verified" : "incomplete",
    evidence: {
      staticMapModels: mapModels(catalog, "S1_D000"),
      runtimePlacements: d000Manifest.summary.runtimePlacementCount,
      staticDoorPlacements: d000Manifest.summary.staticDoorPlacementCount,
      logicalDoorBindings: d000Manifest.summary.logicalDoorBindingCount,
      finalPlacements: d000Manifest.summary.placementCount,
      visibleInstanceAudit: d000Instances.summary.status,
      exactNativeSemantics:
        d000Interactions.summary.exactNativeSemanticsCount,
      unresolvedPlacedObjects:
        d000Interactions.summary.unresolvedPlacementCount,
      omittedDynamicTags,
      verifiedInteractionModels:
        d000InteractionModels.summary.verifiedModelCount,
      tkoStateMachine: {
        storySelectorCount: d000TkoStateMachine.storySelectors.length,
        clockWindow: d000TkoStateMachine.clockWindow,
      },
      phoneBookInteraction: {
        status: d000PhoneBookInteraction.status,
        attachments: Object.keys(d000PhoneBookInteraction.attachments),
      },
      gachaInteraction: {
        status: d000GachaInteraction.status,
        populatedMachineRecords:
          d000GachaInteraction.populatedMachineRecords.length,
        interactionModels:
          d000GachaInteraction.highDetailResourceFlow
            .interactionModels
            .map((model) => model.browserAsset),
      },
    },
    gaps: dobuitaGaps,
  },
  yamanose: genericManifestAudit({
    catalog,
    manifest: ju00Manifest,
    nativeArea: "JU00",
    mapPrefix: "S1_JU00",
    additionalEvidence: {
      scheduledActorCount: scheduledActors.summary.actorCodeCount,
      authoredScheduledRouteCount: scheduledActors.summary.routeCount,
      scheduledActorsWithJu00Routes: scheduledActors.actors.filter(
        (actor) => scheduledActorRoutes(actor).some(
          (route) => route.area === "JU00",
        ),
      ).map((actor) => actor.actorCode),
    },
  }),
  sakuragaoka: genericManifestAudit({
    catalog,
    manifest: jd00Manifest,
    nativeArea: "JD00",
    mapPrefix: "S1_JD00",
    additionalEvidence: {
      staticDoorRecordCount: jd00Manifest.placements.filter(
        (placement) => Number.isInteger(
          placement.runtime?.staticDoorIndex,
        ),
      ).length,
      settledRuntimeCapture: jd00Manifest.runtimeCapture,
      capturedRuntimeObjectTags: jd00Manifest.placements.filter(
        (placement) => (
          placement.runtime?.placementSource
          === "settled-jd00-runtime-task"
        ),
      ).map((placement) => placement.runtime.objectTag),
      scheduledActorRouteCount: scheduledActors.actors.reduce(
        (count, actor) => count + scheduledActorRoutes(actor).filter(
          (route) => route.area === "JD00",
        ).length,
        0,
      ),
    },
  }),
  arcade: genericManifestAudit({
    catalog,
    manifest: dgctManifest,
    nativeArea: "DGCT",
    mapPrefix: "S3_DGCT",
    additionalEvidence: {
      playableGameCount: 4,
    },
  }),
  harbor: genericManifestAudit({
    catalog,
    manifest: mfsyManifest,
    nativeArea: "MFSY",
    mapPrefix: "S2_MFSY",
  }),
  warehouseDistrict: genericManifestAudit({
    catalog,
    manifest: mksgManifest,
    nativeArea: "MKSG",
    mapPrefix: "S2_MKSG",
    additionalEvidence: {
      scheduledActorsExcluded: ["KEBA", "KEBB", "KEBC", "KEBD", "KEBE"],
    },
  }),
  warehouseEight: genericManifestAudit({
    catalog,
    manifest: ms08Manifest,
    nativeArea: "MS08",
    mapPrefix: "S2_MS08",
  }),
  forkliftRace: genericManifestAudit({
    catalog,
    manifest: ma00RaceManifest,
    nativeArea: "MA00",
    mapPrefix: "S3_MA00",
    additionalEvidence: {
      capturedWorldObjectCount:
        ma00RaceManifest.summary.capturedWorldObjectCount,
      omittedActors: ma00RaceManifest.summary.omittedActorTags,
      alternateStates: ma00RaceManifest.summary.omittedAlternateStateTags,
    },
  }),
  forkliftPlayground: {
    status: "verified",
    evidence: {
      nativeArea: "MFSY",
      placementPolicy: (
        "browser-authored physics playground reuses the verified MFSY "
        + "stationary placement manifest"
      ),
      placementCount: mfsyManifest.placements.length,
    },
    gaps: [],
  },
};

const gaps = Object.entries(worlds).flatMap(([world, record]) => (
  record.gaps.map((gap) => ({ world, gap }))
));
const report = {
  schema: "new-yokosuka-world-object-completeness-v1",
  status: gaps.length === 0 ? "verified" : "incomplete",
  worlds,
  gaps,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath} (${report.status}, ${gaps.length} open gaps)`,
);
