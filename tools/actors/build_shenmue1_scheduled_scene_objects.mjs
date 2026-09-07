#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUTS = Object.freeze({
  dobuita: "tools/evidence/d000-scheduled-scene-objects.json",
  schedules: "play/data/scheduled-actors.json",
  models: "public/models.json",
});
const OUTPUTS = Object.freeze([
  "tools/evidence/shenmue1-scheduled-scene-objects.json",
  "play/data/shenmue1-scheduled-scene-objects.json",
]);

function readJson(filename) {
  const bytes = fs.readFileSync(path.resolve(ROOT, filename));
  return { bytes, value: JSON.parse(bytes) };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function source(filename, bytes) {
  return { path: filename, sha256: sha256(bytes) };
}

function modelArea(model) {
  return String(model || "").match(/^S[123]_([A-Z0-9]{4})_/)?.[1] || null;
}

function placementInventory() {
  const directory = path.resolve(ROOT, "play/data");
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith("-runtime-placements.json"))
    .sort()
    .map((name) => {
      const filename = `play/data/${name}`;
      const { bytes, value } = readJson(filename);
      const placements = value.placements || [];
      const sourceModelAreas = [...new Set(placements.map(
        (placement) => modelArea(placement.model),
      ).filter(Boolean))].sort();
      const area = String(
        value.area || value.source?.area || name.split("-")[0],
      ).match(/[A-Z0-9]{4}/i)?.[0].toUpperCase();
      if (!area) throw new Error(`Cannot resolve placement area for ${filename}`);
      return {
        path: filename,
        sha256: sha256(bytes),
        schema: value.schema,
        placementCount: placements.length,
        area,
        sourceModelAreas,
        placements,
      };
    });
}

function scheduledCommands(schedules) {
  const commands = [];
  for (const actor of schedules.actors || []) {
    for (const variant of actor.scheduleVariants || []) {
      for (const journey of variant.journeys || []) {
        for (const operation of journey.operations || []) {
          if (operation.operation !== 0x2a) continue;
          commands.push({
            actorCode: actor.actorCode,
            scheduleVariantId: variant.scheduleVariantId,
            defaultVariant: (
              variant.scheduleVariantId === actor.defaultScheduleVariantId
            ),
            second: journey.startSecond,
            time: journey.startTime,
            sceneObjectCode: operation.sceneObjectCode,
            controlValue: operation.sceneObjectControlValue,
            transitionMode: operation.sceneObjectTransitionMode,
            sourceOperationFileOffset: operation.fileOffset,
          });
        }
      }
    }
  }
  return commands;
}

const dobuitaInput = readJson(INPUTS.dobuita);
const scheduleInput = readJson(INPUTS.schedules);
const modelInput = readJson(INPUTS.models);
const placements = placementInventory();
const commands = scheduledCommands(scheduleInput.value);
const dobuita = dobuitaInput.value;

const objectOwners = new Map();
for (const definition of dobuita.sceneObjects || []) {
  if (objectOwners.has(definition.code)) {
    throw new Error(`Duplicate reviewed scene object ${definition.code}`);
  }
  objectOwners.set(definition.code, "D000");
}

for (const command of commands) {
  if (!objectOwners.has(command.sceneObjectCode)) {
    throw new Error(
      `Unassigned operation 0x2a object ${command.sceneObjectCode}`,
    );
  }
}
if (commands.length !== dobuita.summary.sourceOperationCount) {
  throw new Error(
    `Reviewed D000 operations ${dobuita.summary.sourceOperationCount} `
    + `do not cover extracted inventory ${commands.length}`,
  );
}

const runtimePlacementTagMatches = [];
for (const inventory of placements) {
  for (const placement of inventory.placements) {
    if (!objectOwners.has(placement.runtime?.objectTag)) continue;
    runtimePlacementTagMatches.push({
      area: inventory.area,
      placementManifest: inventory.path,
      objectCode: placement.runtime.objectTag,
      model: placement.model,
      position: placement.position,
      rotationDegrees: placement.rotationDegrees,
    });
  }
}

const modelAreas = new Map();
for (const model of modelInput.value) {
  const area = modelArea(model);
  if (!area) continue;
  if (!modelAreas.has(area)) modelAreas.set(area, []);
  modelAreas.get(area).push(model);
}

const runtimePlacedModels = placements.flatMap((inventory) => (
  inventory.placements.map((placement, index) => ({
    area: inventory.area,
    placementManifest: inventory.path,
    placementIndex: index,
    placementId: placement.id || null,
    objectTag: placement.runtime?.objectTag || null,
    model: placement.model,
    position: placement.position,
    rotationDegrees: placement.rotationDegrees,
    placementSource: placement.runtime?.placementSource || null,
  }))
));

const reviewedObjects = dobuita.sceneObjects.map((definition) => ({
  ...definition,
  id: `D000:${definition.code}`,
  kind: "vertical-roll-door",
  motion: {
    axis: "y",
    controlTargets: {
      0: definition.upperY,
      1: definition.lowerY,
    },
    controlStates: {
      0: "open",
      1: "closed",
    },
    transitionStates: {
      0: "opening",
      1: "closing",
    },
    unitsPerSecond: definition.nativeUnitsPerSecond,
  },
}));
const reviewedObjectPlacements = reviewedObjects.map((definition) => ({
  area: "D000",
  objectId: definition.id,
  objectCode: definition.code,
  model: definition.model,
  position: definition.browserPosition,
  rotationDegrees: definition.browserRotationDegrees,
  lowerEndpoint: definition.lowerY,
  upperEndpoint: definition.upperY,
  evidence: INPUTS.dobuita,
}));

const areas = [...modelAreas].sort(([left], [right]) => (
  left.localeCompare(right)
)).map(([area, models]) => {
  const areaPlacements = placements.filter((entry) => (
    entry.area === area
  ));
  const areaCommands = commands.filter((command) => (
    objectOwners.get(command.sceneObjectCode) === area
  ));
  const areaObjects = reviewedObjects.filter((definition) => (
    objectOwners.get(definition.code) === area
  ));
  return {
    area,
    assetModelCount: models.length,
    runtimePlacementManifests: areaPlacements.map((entry) => entry.path),
    runtimePlacementCount: areaPlacements.reduce(
      (total, entry) => total + entry.placementCount,
      0,
    ),
    scheduledOperationCount: areaCommands.length,
    reviewedSceneObjectCount: areaObjects.length,
    activationStatus: areaObjects.length > 0
      ? "reviewed-and-enabled"
      : "no-reviewed-scheduled-scene-object",
  };
});

const manifest = {
  schema: "new-yokosuka-shenmue1-scheduled-scene-objects-v1",
  generatedFrom: {
    dobuitaEvidence: source(INPUTS.dobuita, dobuitaInput.bytes),
    schedules: source(INPUTS.schedules, scheduleInput.bytes),
    modelCatalog: source(INPUTS.models, modelInput.bytes),
    runtimePlacements: placements.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256,
      schema: entry.schema,
      area: entry.area,
      sourceModelAreas: entry.sourceModelAreas,
    })),
  },
  evidenceBoundary: (
    "The complete extracted Shenmue I scheduled-actor corpus contains 41 "
    + "operation-0x2a commands, all targeting BS01 through BS16. The only "
    + "reviewed object table, exact tagged-model mapping, movement endpoints, "
    + "and native movement captures are for D000. Other catalogued areas are "
    + "explicit coverage entries, not inferred shutter mappings."
  ),
  runtimePolicy: {
    owner: "browser presentation driven by the synchronized public clock",
    liveTransition: "animate only continuously crossed reviewed commands",
    discontinuousClock: "snap to the latest reviewed command endpoint",
    accessAuthorization: "independent server concern",
  },
  summary: {
    cataloguedAreaCount: areas.length,
    runtimePlacementManifestCount: placements.length,
    runtimePlacementCount: placements.reduce(
      (total, entry) => total + entry.placementCount,
      0,
    ),
    scheduledOperationCount: commands.length,
    assignedScheduledOperationCount: commands.filter(
      (command) => objectOwners.has(command.sceneObjectCode),
    ).length,
    enabledAreaCount: 1,
    enabledWorldCount: 1,
    reviewedSceneObjectCount: reviewedObjects.length,
    reviewedObjectPlacementCount: reviewedObjectPlacements.length,
    runtimePlacementTagMatchCount: runtimePlacementTagMatches.length,
  },
  coverage: {
    areas,
    runtimePlacedModels,
    reviewedObjectPlacements,
    runtimePlacementTagMatches,
  },
  worlds: [{
    worldId: "dobuita",
    nativeArea: "D000",
    kind: "vertical-roll-doors",
    evidenceStatus: "reviewed-and-enabled",
    sceneObjects: reviewedObjects,
  }],
};

const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
for (const filename of OUTPUTS) {
  const output = path.resolve(ROOT, filename);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encoded);
  console.log(`Wrote ${path.relative(ROOT, output)}`);
}
