#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import {
  extractMapinfoStaticDoors,
} from "../lib/mapinfo_static_doors.js";

function usage() {
  console.error(
    "Usage: node tools/worlds/build_runtime_placement_manifest.js "
    + "<runtime-report.json> <output.json> [--mapinfo MAPINFO.BIN]",
  );
  process.exit(2);
}

function parseArguments(argv) {
  const positional = [];
  let mapinfo = null;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--mapinfo") {
      mapinfo = argv[++index];
    } else {
      positional.push(argv[index]);
    }
  }
  return {
    reportArgument: positional[0],
    outputArgument: positional[1],
    mapinfo,
  };
}

const {
  reportArgument,
  outputArgument,
  mapinfo: mapinfoArgument,
} = parseArguments(process.argv.slice(2));
if (!reportArgument || !outputArgument) usage();

const reportPath = path.resolve(reportArgument);
const outputPath = path.resolve(outputArgument);
const mapinfoPath = mapinfoArgument ? path.resolve(mapinfoArgument) : null;
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const ramPath = path.join(report.captureDirectory, "ram.bin");
const ram = fs.existsSync(ramPath) ? fs.readFileSync(ramPath) : null;
const RAM_BASE = 0x8c000000;

function runtimeOffset(address) {
  return Number.parseInt(address, 16) - RAM_BASE;
}

function runtimeObjectMetadata(taskAddress) {
  if (!ram) return {};
  const taskOffset = runtimeOffset(taskAddress);
  if (taskOffset < 0 || taskOffset + 0x16c > ram.length) return {};
  const rawTag = ram.subarray(taskOffset + 0x168, taskOffset + 0x16c);
  const objectTag = [...rawTag].every((value) => value >= 0x20 && value < 0x7f)
    ? rawTag.toString("ascii")
    : null;
  return {
    objectTag,
    callbackAddress: `0x${ram.readUInt32LE(taskOffset + 0x64)
      .toString(16)
      .padStart(8, "0")}`,
  };
}

function rounded(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function extractJomoStaticDoorPlacements(mapinfo) {
  const recovered = extractMapinfoStaticDoors(
    mapinfo,
    "S1_JOMO_",
  ).placements.map((placement) => ({
    ...placement,
    runtime: {
      modelAddress: null,
      hmdlAddress: null,
      taskAddress: null,
      callbackAddress: null,
      ...placement.runtime,
      placementSource: "jomo-static-door-table",
    },
  }));
  if (recovered.length !== 18) {
    throw new Error(
      `Expected 18 JOMO static door placements, found ${recovered.length}.`,
    );
  }
  return recovered;
}

function isActiveHousePosition(position) {
  return (
    position.length === 3
    && position.every(Number.isFinite)
    // Runtime object slots that have not received an authored transform are
    // initialized to the exact world origin. They must not become placements.
    && !position.every((value) => value === 0)
    && Math.abs(position[0]) < 100
    && position[1] > -5
    && position[1] < 100
    && Math.abs(position[2]) < 100
  );
}

const placements = [];
let staticDoorRecordCount = 0;
for (const model of report.models || []) {
  for (const copy of model.runtimeCopies || []) {
    for (const instance of copy.instances || []) {
      if (!isActiveHousePosition(instance.position)) continue;
      placements.push({
        model: model.name,
        position: [
          -instance.position[0],
          instance.position[1],
          instance.position[2],
        ].map((value) => rounded(value)),
        rotationDegrees: [
          instance.rotationDegrees[0],
          -instance.rotationDegrees[1],
          -instance.rotationDegrees[2],
        ].map((value) => rounded(value)),
        scale: instance.scale.map((value) => rounded(value)),
        runtime: {
          modelAddress: copy.address,
          hmdlAddress: instance.hmdlAddress,
          taskAddress: instance.taskAddress,
          ...runtimeObjectMetadata(instance.taskAddress),
        },
      });
    }
  }
}

if (mapinfoPath) {
  const staticDoors = extractJomoStaticDoorPlacements(
    fs.readFileSync(mapinfoPath),
  );
  staticDoorRecordCount = staticDoors.length;
  for (const staticDoor of staticDoors) {
    const alreadyRecovered = placements.find((placement) => (
      placement.model === staticDoor.model
      && Math.hypot(
        placement.position[0] - staticDoor.position[0],
        placement.position[1] - staticDoor.position[1],
        placement.position[2] - staticDoor.position[2],
      ) < 0.05
    ));
    if (alreadyRecovered) {
      Object.assign(alreadyRecovered.runtime, {
        staticDoorIndex: staticDoor.runtime.staticDoorIndex,
        staticSourceOffset: staticDoor.runtime.staticSourceOffset,
        placementSource: "runtime-and-jomo-static-door-table",
      });
    } else {
      placements.push(staticDoor);
    }
  }
}

function linkStaticDoorsToRuntimeTasks() {
  if (!ram) return;
  const linkedTasks = new Set(
    placements
      .map((placement) => placement.runtime.taskAddress)
      .filter(Boolean),
  );
  for (let offset = 0; offset + 0x16c <= ram.length; offset += 4) {
    if (ram.toString("ascii", offset, offset + 4) !== "TASK") continue;
    const objectTag = ram.toString("ascii", offset + 0x168, offset + 0x16c);
    if (!/^dor\d$/i.test(objectTag)) continue;
    const taskAddress = `0x${(RAM_BASE + offset)
      .toString(16)
      .padStart(8, "0")}`;
    if (linkedTasks.has(taskAddress)) continue;
    const sourcePosition = [0x28, 0x2c, 0x30].map(
      (field) => ram.readFloatLE(offset + field),
    );
    const browserPosition = [
      -sourcePosition[0],
      sourcePosition[1],
      sourcePosition[2],
    ];
    const placement = placements.find((candidate) => (
      candidate.runtime.staticDoorIndex !== undefined
      && !candidate.runtime.taskAddress
      && Math.hypot(
        candidate.position[0] - browserPosition[0],
        candidate.position[1] - browserPosition[1],
        candidate.position[2] - browserPosition[2],
      ) < 0.05
    ));
    if (!placement) continue;
    const callback = ram.readUInt32LE(offset + 0x64);
    Object.assign(placement.runtime, {
      taskAddress,
      objectTag,
      callbackAddress: `0x${callback.toString(16).padStart(8, "0")}`,
      placementSource: "runtime-task-and-jomo-static-door-table",
    });
    linkedTasks.add(taskAddress);
  }
}

linkStaticDoorsToRuntimeTasks();

placements.sort((left, right) => (
  left.model.localeCompare(right.model)
  || (left.runtime.taskAddress || "").localeCompare(
    right.runtime.taskAddress || "",
  )
  || (left.runtime.staticDoorIndex ?? -1)
    - (right.runtime.staticDoorIndex ?? -1)
));

function scanRuntimeObjectTags() {
  if (!ram) return [];
  const placementByTask = new Map(
    placements.map((placement) => [placement.runtime.taskAddress, placement]),
  );
  const tags = [];
  for (let offset = 0; offset + 0x16c <= ram.length; offset += 4) {
    if (ram.toString("ascii", offset, offset + 4) !== "TASK") continue;
    const objectTag = ram.toString("ascii", offset + 0x168, offset + 0x16c);
    if (!/^[A-Za-z0-9_]{4}$/.test(objectTag)) continue;
    const callback = ram.readUInt32LE(offset + 0x64);
    if (callback !== 0x0c2de638 && !/^dor\d$/i.test(objectTag)) continue;
    const taskAddress = `0x${(RAM_BASE + offset).toString(16).padStart(8, "0")}`;
    const placement = placementByTask.get(taskAddress) || null;
    tags.push({
      objectTag,
      taskAddress,
      callbackAddress: `0x${callback.toString(16).padStart(8, "0")}`,
      model: placement?.model || null,
      activePlacement: Boolean(placement),
      behavior: jomoObjectBehavior(
        placement?.model || "",
        objectTag,
        placement?.runtime,
      ).kind,
    });
  }
  return tags.sort((left, right) => (
    left.taskAddress.localeCompare(right.taskAddress)
  ));
}

const manifest = {
  schema: "new-yokosuka-runtime-placement-manifest-v2",
  source: {
    captureDirectory: path.relative(
      process.cwd(),
      report.captureDirectory,
    ),
    runtimeSchema: report.schema,
    mapinfo: mapinfoPath
      ? path.relative(process.cwd(), mapinfoPath)
      : null,
    staticDoorRecordCount,
  },
  coordinateTransform: {
    position: "[-runtimeX, runtimeY, runtimeZ]",
    rotationDegrees: "[runtimeX, -runtimeY, -runtimeZ]",
  },
  objectTags: scanRuntimeObjectTags(),
  placements,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${placements.length} placements)`);
