#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  evaluateAuthActor,
  parseAuthMovement,
} from "../../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../lib/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";

const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-bus-assets.json",
);
const captureDirectory = path.resolve(
  "captures/pvr/20260724-010057-frame-4933",
);
const ram = fs.readFileSync(path.join(captureDirectory, "ram.bin"));
const runtimeObjects = JSON.parse(fs.readFileSync(
  ".disc-work/d000-entry0-tagged-objects.json",
));
const manifest = JSON.parse(fs.readFileSync(
  "play/data/d000-runtime-placements.json",
));
const instanceAudit = JSON.parse(fs.readFileSync(
  "tools/evidence/d000-runtime-instance-audit.json",
));
const sourceModelPath = path.resolve(
  ".disc-work/humans-models/entry_033/00_BUSS530G.CHRM",
);
const sourceModel = fs.readFileSync(sourceModelPath);
const carSourcePath = path.resolve(
  ".disc-work/exact/d000/unpacked/BUSS/C85M201G.CHRM",
);
const carBundledPath = path.resolve(
  "play/assets/dobuita/C85M201G.CHRM",
);
const carSource = fs.readFileSync(carSourcePath);
const carBundled = fs.readFileSync(carBundledPath);
const busMotionPath = path.resolve(
  ".disc-work/exact/d000/unpacked/BUSS/M_01BUS.MOTN",
);
const runtimeMotionPath = path.resolve(
  ".disc-work/runtime-motion/MOTION.BIN",
);
function parseMotion(filename) {
  const bytes = fs.readFileSync(filename);
  return MotnLoader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}
const busMotion = parseMotion(busMotionPath);
const runtimeMotion = parseMotion(runtimeMotionPath);
const motionPackages = new Map([
  [0x10, busMotion],
  [0x02, runtimeMotion],
]);
const runtimeModelOffset = 0x00a2c9a0;
const runtimeModel = ram.subarray(
  runtimeModelOffset,
  runtimeModelOffset + sourceModel.length,
);
let equalBytes = 0;
for (let index = 0; index < sourceModel.length; index += 1) {
  if (sourceModel[index] === runtimeModel[index]) equalBytes += 1;
}
const byteAgreement = equalBytes / sourceModel.length;

const sequences = [2, 5].map((number) => {
  const source = `.disc-work/exact/d000/unpacked/BUSS/SEQDATA${number}.AUTH`;
  const movement = parseAuthMovement(fs.readFileSync(source));
  return {
    source,
    chunkOffset: `0x${movement.markerOffset.toString(16)}`,
    chunkSize: movement.chunkSize,
    durationSeconds: movement.duration,
    actors: movement.actors.map((actor) => ({
      index: actor.index,
      tag: actor.tag,
      initialPose: evaluateAuthActor(actor, 0),
      durationSeconds: actor.duration,
    })),
  };
});
const busRuntime = runtimeObjects.objects.find(
  (object) => object.objectTag === "BUS_",
);
const driverRuntime = runtimeObjects.objects.find(
  (object) => object.objectTag === "BUSS",
);
const carRuntime = runtimeObjects.objects.find(
  (object) => object.objectTag === "CAR7",
);
const busPlacement = manifest.placements.find(
  (placement) => placement.runtime?.objectTag === "BUS_",
);
const driverPlacement = manifest.placements.find(
  (placement) => placement.runtime?.objectTag === "BUSS",
);
const carPlacement = manifest.placements.find(
  (placement) => placement.runtime?.objectTag === "CAR7",
);
const busInstance = instanceAudit.records.find(
  (record) => record.objectTag === "BUS_",
);
const carInstance = instanceAudit.records.find(
  (record) => record.objectTag === "CAR7",
);
const movementEqual = JSON.stringify(sequences[0].actors)
  === JSON.stringify(sequences[1].actors);

const failures = [];
const expectedMotionEventCounts = new Map([
  [1, 3],
  [2, 5],
  [4, 3],
  [5, 5],
]);
const authoredMotions = [...expectedMotionEventCounts].map(
  ([number, expectedCount]) => {
    const source = `.disc-work/exact/d000/unpacked/BUSS/SEQDATA${number}.AUTH`;
    const resolved = resolveAuthMotions(
      parseAuthSequence(fs.readFileSync(source)),
      motionPackages,
    );
    if (resolved.length !== expectedCount) {
      failures.push(
        `BUSS SEQDATA${number} has ${resolved.length} motions, `
        + `expected ${expectedCount}`,
      );
    }
    if (resolved.some((event) => !event.motionValid)) {
      failures.push(`BUSS SEQDATA${number} has unresolved MOTN references`);
    }
    return {
      source,
      motions: resolved.map((event) => ({
        actorTag: event.actorTag,
        motionBank: event.motionBank,
        sequenceNumber: event.sequenceNumber,
        sequenceIndex: event.sequenceIndex,
        motionName: event.motionName,
        startFrame: event.startFrame,
        endFrame: event.endFrame,
        durationFrames: event.motionDurationFrames,
      })),
    };
  },
);
if (sourceModel.subarray(0, 12).compare(runtimeModel.subarray(0, 12)) !== 0) {
  failures.push("runtime/source HRCM headers differ");
}
if (byteAgreement < 0.99) failures.push("runtime/source model agreement < 99%");
if (!movementEqual) failures.push("SEQDATA2/5 AMOV actors differ");
if (!busPlacement || !driverPlacement) {
  failures.push("bus or driver is absent from the browser manifest");
}
if (busInstance?.status !== "verified") {
  failures.push("bus production model does not instantiate visibly");
}
if (!carSource.equals(carBundled)) {
  failures.push("bundled CAR7 model differs from BUSS.PKS source");
}
if (!carPlacement || carInstance?.status !== "verified") {
  failures.push("CAR7 captured inactive state does not instantiate");
}
if (
  JSON.stringify(carPlacement?.position) !== JSON.stringify([-100, -20, 0])
) {
  failures.push("CAR7 browser placement differs from captured inactive pose");
}
for (const renderKey of [153, 154, 155, 156, 157, 158, 196]) {
  if (!busInstance?.renderKeys?.includes(renderKey)) {
    failures.push(`bus production model lacks native render key ${renderKey}`);
  }
}

const report = {
  schema: "new-yokosuka-d000-bus-assets-v1",
  status: failures.length === 0 ? "verified" : "failed",
  source: {
    captureDirectory: path.relative(process.cwd(), captureDirectory),
    sourceModel: path.relative(process.cwd(), sourceModelPath),
    carSource: path.relative(process.cwd(), carSourcePath),
    authSequences: sequences.map((sequence) => sequence.source),
    motionPackages: [
      path.relative(process.cwd(), busMotionPath),
      path.relative(process.cwd(), runtimeMotionPath),
    ],
  },
  modelBinding: {
    runtimeAddress: "0x8ca2c9a0",
    sourceBytes: sourceModel.length,
    matchingBytes: equalBytes,
    byteAgreement,
    renderKeys: busInstance?.renderKeys || [],
    visibleInstanceStatus: busInstance?.status || "missing",
  },
  runtime: {
    busController: busRuntime,
    driver: driverRuntime,
    inactiveCar: carRuntime,
  },
  authoredMovement: {
    identicalSequence2And5: movementEqual,
    sequences,
  },
  authoredMotions,
  browser: {
    busPlacement,
    driverPlacement,
    inactiveCarPlacement: carPlacement,
    inactiveCarInstanceStatus: carInstance?.status || "missing",
  },
  failures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${report.status})`);
if (failures.length > 0) process.exitCode = 1;
