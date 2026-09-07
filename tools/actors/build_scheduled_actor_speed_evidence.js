#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractScheduledPrograms,
  normalizedRamPointer,
  ramOffset,
  sha256,
} from "../lib/scheduled_actor_extractor.js";

const capturePath = path.resolve(
  process.argv[2]
    || "captures/pvr/20260724-103724-frame-35825/ram.bin",
);
const outputPath = path.resolve(
  process.argv[3]
    || "tools/evidence/scheduled-actor-speed-evidence.json",
);
const ram = fs.readFileSync(capturePath);
const expectedBaseSpeed = 1 / 24;
const tolerance = 1e-6;

function pointersTo(value) {
  const result = [];
  for (let offset = 0; offset + 0x5c <= ram.length; offset += 4) {
    if (normalizedRamPointer(ram.readUInt32LE(offset), ram.length) === value) {
      result.push(offset);
    }
  }
  return result;
}

const observations = [];
for (const program of extractScheduledPrograms(ram).filter(
  (candidate) => candidate.scheduleTables.length > 0,
)) {
  const programHeader = Number.parseInt(program.programHeader, 16);
  const recordPointer = programHeader - 4;
  const controllers = pointersTo(recordPointer).map((offset) => {
    const baseSpeed = ram.readFloatLE(offset + 0x54);
    const movementScale = ram.readFloatLE(offset + 0x58);
    return {
      controllerAddress: `0x${(0x8c000000 + offset).toString(16)}`,
      activeOperation: ram.readUInt16LE(offset + 4),
      baseSpeed,
      movementScale,
      effectivePathStepPerNativeUpdate: baseSpeed * movementScale,
      matchesDefaultInitialization: (
        Math.abs(baseSpeed - expectedBaseSpeed) < tolerance
        && Math.abs(movementScale - program.nativeMovementScale) < tolerance
      ),
    };
  });
  observations.push({
    actorCode: program.actorCode,
    programHeader: program.programHeader,
    programRecordPointer: `0x${recordPointer.toString(16)}`,
    programMovementScale: program.nativeMovementScale,
    expectedDefaultPathStepPerNativeUpdate:
      program.nativeDefaultPathSpeedPerGameSecond,
    controllers,
  });
}

const report = {
  schema: "new-yokosuka-scheduled-actor-speed-evidence-v1",
  capture: path.relative(process.cwd(), capturePath),
  captureSha256: sha256(ram),
  engineEvidence: {
    operationOneHandler: "0x0c11f948",
    effectiveSpeedFunction: "0x0c122a44",
    controllerBaseSpeedOffset: "0x54",
    controllerMovementScaleOffset: "0x58",
    programMovementScaleOffsetFromPrg1: "0x08",
    defaultBaseSpeed: expectedBaseSpeed,
    rule: (
      "path step per 30 Hz native actor update = PRG1 float at +0x08 / 24"
    ),
  },
  summary: {
    scheduledProgramCount: observations.length,
    programWithControllerPointerCount: observations.filter(
      (observation) => observation.controllers.length > 0,
    ).length,
    exactDefaultInitializationMatchCount: observations.filter(
      (observation) => observation.controllers.some(
        (controller) => controller.matchesDefaultInitialization,
      ),
    ).length,
    runtimeModifiedOrExceptionalCount: observations.filter(
      (observation) => !observation.controllers.some(
        (controller) => controller.matchesDefaultInitialization,
      ),
    ).length,
  },
  observations,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: `
  + `${report.summary.exactDefaultInitializationMatchCount}/`
  + `${report.summary.scheduledProgramCount} exact default-speed matches.`,
);
