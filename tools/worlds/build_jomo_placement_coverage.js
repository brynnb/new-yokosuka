#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [
  runtimeArgument = ".disc-work/jomo-runtime-placements.json",
  manifestArgument = "play/data/jomo-runtime-placements.json",
  catalogArgument = "public/models.json",
  outputArgument = "tools/evidence/jomo-placement-coverage.json",
] = process.argv.slice(2);

const runtimePath = path.resolve(runtimeArgument);
const manifestPath = path.resolve(manifestArgument);
const catalogPath = path.resolve(catalogArgument);
const outputPath = path.resolve(outputArgument);
const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

function isActiveHousePosition(position) {
  return (
    position.length === 3
    && position.every(Number.isFinite)
    && Math.abs(position[0]) < 100
    && position[1] > -5
    && position[1] < 100
    && Math.abs(position[2]) < 100
  );
}

const activeRuntimeInstances = runtime.models.flatMap((model) => (
  model.runtimeCopies.flatMap((copy) => (
    copy.instances
      .filter((instance) => isActiveHousePosition(instance.position))
      .map((instance) => ({
        model: model.name,
        taskAddress: instance.taskAddress,
        hmdlAddress: instance.hmdlAddress,
      }))
  ))
));
const manifestTaskAddresses = new Set(
  manifest.placements
    .map((placement) => placement.runtime.taskAddress)
    .filter(Boolean),
);
const missingRuntimeInstances = activeRuntimeInstances.filter(
  (instance) => !manifestTaskAddresses.has(instance.taskAddress),
);

const staticDoorPlacements = manifest.placements.filter(
  (placement) => Number.isInteger(placement.runtime.staticDoorIndex),
);
const staticDoorIndices = new Set(
  staticDoorPlacements.map(
    (placement) => placement.runtime.staticDoorIndex,
  ),
);
const missingStaticDoorIndices = Array.from(
  { length: manifest.source.staticDoorRecordCount },
  (_, index) => index,
).filter((index) => !staticDoorIndices.has(index));

const mapModels = catalog.filter(
  (name) => /^S1_JOMO_MAP(?:\d+)?\.MT5$/i.test(name),
);
const loadedResourcesWithoutInstances = runtime.models
  .filter((model) => (
    model.runtimeCopies.length > 0
    && model.runtimeCopies.every((copy) => copy.instances.length === 0)
  ))
  .map((model) => ({
    model: model.name,
    classification: /^S1_JOMO_MAP(?:\d+)?\.MT5$/i.test(model.name)
      ? "static-map-geometry"
      : /^S1_JOMO_YK/i.test(model.name)
        ? "character-rig-resource"
        : staticDoorPlacements.some(
          (placement) => placement.model === model.name,
        )
          ? "covered-by-static-door-table"
          : "loaded-resource-without-world-instance",
  }));

const result = {
  schema: "new-yokosuka-jomo-placement-coverage-v1",
  sources: {
    runtime: path.relative(process.cwd(), runtimePath),
    manifest: path.relative(process.cwd(), manifestPath),
    catalog: path.relative(process.cwd(), catalogPath),
  },
  summary: {
    activeRuntimeInstanceCount: activeRuntimeInstances.length,
    activeRuntimeInstanceCoveredCount: (
      activeRuntimeInstances.length - missingRuntimeInstances.length
    ),
    missingActiveRuntimeInstanceCount: missingRuntimeInstances.length,
    staticDoorRecordCount: manifest.source.staticDoorRecordCount,
    staticDoorPlacementCoveredCount: staticDoorIndices.size,
    missingStaticDoorPlacementCount: missingStaticDoorIndices.length,
    finalBrowserPlacementCount: manifest.placements.length,
    distinctPlacedModelCount: new Set(
      manifest.placements.map((placement) => placement.model),
    ).size,
    staticMapModelCount: mapModels.length,
  },
  missingRuntimeInstances,
  missingStaticDoorIndices,
  staticMapModels: mapModels,
  loadedResourcesWithoutInstances,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Wrote ${outputPath} `
  + `(${result.summary.missingActiveRuntimeInstanceCount} runtime gaps, `
  + `${result.summary.missingStaticDoorPlacementCount} door gaps)`,
);
