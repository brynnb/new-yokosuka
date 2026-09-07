#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error(
    "Usage: node tools/worlds/build_ju00_placement_manifest.js "
    + "<tagged-runtime.json> <static-doors.json> <output.json>",
  );
  process.exit(2);
}

const [taggedPath, doorsPath, outputPath] = process.argv.slice(2);
if (!taggedPath || !doorsPath || !outputPath) usage();

const tagged = JSON.parse(fs.readFileSync(taggedPath, "utf8"));
const staticDoors = JSON.parse(fs.readFileSync(doorsPath, "utf8"));

const runtimePlacements = tagged.objects
  .filter((object) => (
    object.model
    && object.placementClass === "world"
    && Math.max(...object.browserPosition.map(Math.abs)) < 1000
  ))
  .map((object) => ({
    model: object.model,
    position: object.browserPosition,
    rotationDegrees: object.browserRotationDegrees,
    scale: object.scale,
    runtime: {
      objectTag: object.objectTag,
      taskAddress: object.taskAddress,
      callbackAddress: object.callbackAddress,
      modelAddress: object.modelAddress,
      placementSource: "runtime-task",
    },
  }));

const doorPlacements = staticDoors.placements
  .map((placement) => ({
    ...placement,
    runtime: {
      ...placement.runtime,
      objectTag: (() => {
        if (placement.runtime.staticDoorType !== 2) return null;
        const match = tagged.objects
          .filter((object) => /^dor\d+$/i.test(object.objectTag))
          .map((object) => ({
            object,
            distance: Math.hypot(
              object.browserPosition[0] - placement.position[0],
              object.browserPosition[1] - placement.position[1],
              object.browserPosition[2] - placement.position[2],
            ),
          }))
          .sort((left, right) => left.distance - right.distance)[0];
        return match && match.distance < 0.06
          ? match.object.objectTag
          : null;
      })(),
      capturedActiveModel: placement.runtime.staticDoorType === 2,
    },
  }));

const manifest = {
  schema: "new-yokosuka-runtime-placement-manifest-v1",
  area: "JU00",
  source: {
    runtimeCapture: tagged.source.captureDirectory,
    taggedRuntimeObjects: path.relative(process.cwd(), taggedPath),
    staticDoorTable: path.relative(process.cwd(), doorsPath),
    staticDoorPolicy: "all authored MAPINFO door records",
  },
  placements: [...runtimePlacements, ...doorPlacements],
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(
  path.resolve(outputPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${path.resolve(outputPath)} `
  + `(${runtimePlacements.length} runtime + ${doorPlacements.length} doors)`,
);
