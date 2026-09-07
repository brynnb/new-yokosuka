#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
} from "../../src/Shenmue2MotLoader.js";

const RAM_BASE = 0x8c000000;

const OUTPUTS = Object.freeze([
  { name: "hip", offset: 0x3e0, parent: 0x08 },
  { name: "leg-a-1", offset: 0x620, parent: 0x3e0 },
  { name: "leg-a-2", offset: 0x660, parent: 0x620 },
  { name: "leg-a-3", offset: 0x760, parent: 0x660 },
  { name: "leg-b-1", offset: 0xb10, parent: 0x3e0 },
  { name: "leg-b-2", offset: 0xb50, parent: 0xb10 },
  { name: "leg-b-3", offset: 0xc50, parent: 0xb50 },
  { name: "torso", offset: 0x1168, parent: 0x3e0 },
  { name: "head", offset: 0x1508, parent: 0x1168 },
  { name: "arm-a-0", offset: 0x1690, parent: 0x1168 },
  { name: "arm-a-1", offset: 0x18c8, parent: 0x1690 },
  { name: "arm-a-2", offset: 0x1908, parent: 0x18c8 },
  { name: "arm-a-3", offset: 0x1980, parent: 0x1908 },
  { name: "arm-a-4", offset: 0x1a80, parent: 0x1980 },
  { name: "arm-b-0", offset: 0x1c10, parent: 0x1168 },
  { name: "arm-b-1", offset: 0x1e48, parent: 0x1c10 },
  { name: "arm-b-2", offset: 0x1e88, parent: 0x1e48 },
  { name: "arm-b-3", offset: 0x1f00, parent: 0x1e88 },
  { name: "arm-b-4", offset: 0x2000, parent: 0x1f00 },
]);

function usage() {
  console.error([
    "Usage: node tools/animation/analyze_shenmue2_runtime_pose_series.js",
    "  --ram-dir CAPTURE_DIR [--ram-dir CAPTURE_DIR ...]",
    "  --controller 0x8c8082e8 --motion MOTION.MOT --motion-id 0xf086",
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { ramDirs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--ram-dir") args.ramDirs.push(argv[++index]);
    else if (value === "--controller") args.controller = Number(argv[++index]);
    else if (value === "--motion") args.motion = argv[++index];
    else if (value === "--motion-id") args.motionId = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (
    !args.ramDirs.length
    || !Number.isInteger(args.controller)
    || !args.motion
    || !Number.isInteger(args.motionId)
  ) {
    usage();
    process.exit(2);
  }
  return args;
}

function matrixAt(ram, offset) {
  const values = Array.from(
    { length: 16 },
    (_, index) => ram.readFloatLE(offset + index * 4),
  );
  return BABYLON.Matrix.FromArray(values);
}

function localEuler(ram, controllerOffset, output) {
  const world = matrixAt(ram, controllerOffset + output.offset);
  const parent = matrixAt(ram, controllerOffset + output.parent);
  const local = world.multiply(parent.clone().invert());
  const rotation = BABYLON.Quaternion.Identity();
  local.decompose(undefined, rotation, undefined);
  const euler = rotation.toEulerAngles();
  return [euler.x, euler.y, euler.z];
}

function unwrap(values) {
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    let value = values[index];
    while (value - result[index - 1] > Math.PI) value -= Math.PI * 2;
    while (value - result[index - 1] < -Math.PI) value += Math.PI * 2;
    result.push(value);
  }
  return result;
}

function correlation(left, right) {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 1e-12 ? numerator / denominator : 0;
}

const args = parseArgs(process.argv.slice(2));
const controllerOffset = (args.controller - RAM_BASE) >>> 0;
const motionData = fs.readFileSync(args.motion);
const resolvedMotion = resolveShenmue2NativeMotionId(args.motionId);
if (!resolvedMotion) {
  throw new Error(`Unknown native motion ID 0x${args.motionId.toString(16)}`);
}
const parsed = Shenmue2MotLoader.parse(motionData, {
  sequenceIndices: [resolvedMotion.sequenceIndex],
});
const sequence = parsed.sequences[0];
if (!sequence?.valid) throw new Error("Requested motion could not be decoded");

const samples = args.ramDirs.map((directory) => {
  const ramPath = path.join(directory, "ram.bin");
  const ram = fs.readFileSync(ramPath);
  const frame = ram.readFloatLE(controllerOffset + 0x94);
  const currentMotionId = ram.readUInt16LE(controllerOffset + 0x2400);
  if (currentMotionId !== (args.motionId & 0xffff)) {
    throw new Error(`${ramPath}: controller motion changed to 0x${currentMotionId.toString(16)}`);
  }
  return {
    source: directory,
    frame,
    pose: Shenmue2MotLoader.evaluateSequence(sequence, frame),
    native: Object.fromEntries(OUTPUTS.map((output) => [
      output.name,
      localEuler(ram, controllerOffset, output),
    ])),
  };
});

const curveSeries = [];
for (let controller = 0; controller < 22; controller += 1) {
  for (const channel of ["rx", "ry", "rz"]) {
    curveSeries.push({
      controller,
      channel,
      values: samples.map(({ pose }) => pose.rotations[controller][channel]),
    });
  }
}

const axes = ["x", "y", "z"];
const correlations = OUTPUTS.flatMap((output) => axes.map((axis, axisIndex) => {
  const nativeValues = unwrap(samples.map(({ native }) => native[output.name][axisIndex]));
  const candidates = curveSeries.map((curve) => ({
    controller: curve.controller,
    channel: curve.channel,
    correlation: correlation(nativeValues, curve.values),
  })).sort((left, right) => (
    Math.abs(right.correlation) - Math.abs(left.correlation)
  ));
  return {
    output: output.name,
    matrixOffset: `0x${output.offset.toString(16)}`,
    nativeAxis: axis,
    nativeRange: Math.max(...nativeValues) - Math.min(...nativeValues),
    topCurveCandidates: candidates.slice(0, 5),
  };
}));

console.log(JSON.stringify({
  schema: "new-yokosuka-shenmue2-runtime-pose-series-v1",
  controller: `0x${args.controller.toString(16)}`,
  motionId: `0x${args.motionId.toString(16)}`,
  motionName: sequence.name,
  durationFrames: sequence.durationFrames,
  capturedFrames: samples.map(({ frame }) => frame),
  correlations,
}, null, 2));
