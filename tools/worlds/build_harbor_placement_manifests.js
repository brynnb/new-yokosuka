#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote ${outputPath} (${value.placements.length} placements)`);
}

function isFiniteWorldPosition(position) {
  return (
    Array.isArray(position)
    && position.length === 3
    && position.every((value) => Number.isFinite(value) && Math.abs(value) < 500)
  );
}

function runtimePlacements(report, excludedTags = new Set()) {
  return report.objects
    .filter((object) => (
      object.callbackAddress === "0x0c2de638"
      && object.model
      && object.placementClass === "world"
      && object.objectTag !== "AKIR"
      && !excludedTags.has(object.objectTag)
      && isFiniteWorldPosition(object.browserPosition)
    ))
    .map((object) => ({
      id: `runtime-${object.objectTag}`,
      model: object.model,
      position: object.browserPosition,
      rotationDegrees: object.browserRotationDegrees,
      scale: object.scale,
      runtime: {
        objectTag: object.objectTag,
        taskAddress: object.taskAddress,
        callbackAddress: object.callbackAddress,
        modelAddress: object.modelAddress,
        modelByteAgreement: object.modelAgreement,
        placementSource: "runtime-task",
      },
    }));
}

function runtimeModelPlacements(scan, taggedReport, modelName) {
  const model = scan.models.find((candidate) => candidate.name === modelName);
  if (!model || model.runtimeCopies.length !== 1) {
    throw new Error(`Expected one runtime copy of ${modelName}.`);
  }
  const runtimeCopy = model.runtimeCopies[0];
  const tagsByTask = new Map(taggedReport.objects.map((object) => (
    [object.taskAddress, object.objectTag]
  )));
  return runtimeCopy.instances.map((instance, index) => {
    const objectTag = tagsByTask.get(instance.taskAddress) || `door${index}`;
    return {
      id: `runtime-door-${objectTag}`,
      model: modelName,
      position: [
        -instance.position[0],
        instance.position[1],
        instance.position[2],
      ],
      rotationDegrees: [
        instance.rotationDegrees[0],
        -instance.rotationDegrees[1],
        -instance.rotationDegrees[2],
      ],
      scale: instance.scale,
      runtime: {
        objectTag,
        taskAddress: instance.taskAddress,
        modelAddress: runtimeCopy.address,
        modelByteAgreement: runtimeCopy.byteAgreement,
        runtimeDoorIndex: index,
        placementSource: "runtime-hmdl-instance",
      },
    };
  });
}

function manifest(area, sources, placements) {
  return {
    schema: "new-yokosuka-runtime-placement-manifest-v1",
    area,
    source: sources,
    summary: {
      placementCount: placements.length,
      modelCount: new Set(placements.map((placement) => placement.model)).size,
    },
    placements,
  };
}

const mfsyRuntime = readJson(".disc-work/mfsy-tagged-runtime.json");
const mfsyDoors = readJson(".disc-work/mfsy-static-door-placements.json");
const mksgRuntime = readJson(".disc-work/mksg-tagged-runtime.json");
const mksgRuntimeScan = readJson(".disc-work/mksg-runtime-scan.json");

const mfsyPlacements = [
  ...runtimePlacements(mfsyRuntime),
  ...mfsyDoors.placements,
];

// KEB* are scheduled guards and LIG* are their attached light actors. Their
// live transforms depend on the current stealth-game state, so they belong in
// the scheduled-actor system rather than a frozen room-placement manifest.
const mksgScheduledActorTags = new Set([
  "KEBA",
  "KEBB",
  "KEBC",
  "KEBD",
  "KEBE",
  "LIGH",
  "LIG1",
  "LIG2",
  "LIG3",
  "LIG4",
  "LIG5",
]);
const mksgPlacements = runtimePlacements(
  mksgRuntime,
  mksgScheduledActorTags,
);
mksgPlacements.push(...runtimeModelPlacements(
  mksgRuntimeScan,
  mksgRuntime,
  "S2_MKSG_DR02_021.MT5",
));

writeJson(
  "play/data/mfsy-runtime-placements.json",
  manifest(
    "MFSY",
    {
      runtimeCapture: "captures/pvr/20260724-164834-frame-5057/ram.bin",
      staticDoors: ".disc-work/mapinfo/disc2/SCENE/02/MFSY/MAPINFO.BIN",
    },
    mfsyPlacements,
  ),
);

writeJson(
  "play/data/mksg-runtime-placements.json",
  manifest(
    "MKSG",
    {
      runtimeCapture: "captures/pvr/20260724-164607-frame-972/ram.bin",
      scheduledActorCrossCheck:
        "captures/pvr/20260724-165229-frame-285/ram.bin",
    },
    mksgPlacements,
  ),
);
