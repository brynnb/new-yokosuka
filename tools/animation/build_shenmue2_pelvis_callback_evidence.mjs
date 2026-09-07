#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BABYLON from "@babylonjs/core";
import {
  shenmue2NativeActorRelativeRotationQuaternion,
  shenmue2NativePelvisRotationQuaternion,
} from "../../play/characters/Shenmue2ScheduledActorMotionRuntime.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function argumentsFrom(argv) {
  const result = {
    gdb: path.join(
      repositoryRoot,
      ".disc-work/shenmue2-pelvis-callback-one.json",
    ),
    interpreter: path.join(
      repositoryRoot,
      ".disc-work/shenmue2-pelvis-axis-callback.csv",
    ),
    out: path.join(
      repositoryRoot,
      "tools/evidence/shenmue2-pelvis-callback-conformance.json",
    ),
  };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) {
      throw new Error(`Unknown or incomplete option: ${option || ""}`);
    }
    const key = option.slice(2);
    if (!(key in result)) throw new Error(`Unknown option: ${option}`);
    result[key] = path.resolve(value);
  }
  return result;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readRequired(filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(`Required native evidence is missing: ${filename}`);
  }
  return fs.readFileSync(filename);
}

function hex(value, width = 8) {
  return `0x${Number(value).toString(16).padStart(width, "0")}`;
}

function parseHex(value) {
  if (!/^(?:0x)?[0-9a-f]+$/i.test(value || "")) {
    throw new Error(`Invalid hexadecimal value: ${value}`);
  }
  return Number.parseInt(value.replace(/^0x/i, ""), 16);
}

function signedHex32(value) {
  return Number(BigInt.asIntN(32, BigInt(`0x${value}`)));
}

function evaluateDescriptor(descriptor, time) {
  const values = descriptor.float32;
  if (!Array.isArray(values) || values.length !== 16) {
    throw new Error(`Descriptor ${descriptor.address} is not 0x40 bytes`);
  }
  const startTime = values[0];
  const startTangent = values[2];
  const startValue = values[3];
  const endTime = values[4];
  const endTangent = values[5];
  const endValue = values[7];
  if (![startTime, startTangent, startValue, endTime, endTangent, endValue]
    .every(Number.isFinite)) {
    throw new Error(`Descriptor ${descriptor.address} contains non-finite data`);
  }
  let evaluatedValue;
  if (time <= startTime) {
    evaluatedValue = startValue;
  } else if (time >= endTime || endTime - startTime <= 1e-7) {
    evaluatedValue = endValue;
  } else {
    const duration = endTime - startTime;
    const amount = (time - startTime) / duration;
    const amount2 = amount * amount;
    const amount3 = amount2 * amount;
    evaluatedValue = (
      (2 * amount3 - 3 * amount2 + 1) * startValue
      + (amount3 - 2 * amount2 + amount) * duration * startTangent
      + (-2 * amount3 + 3 * amount2) * endValue
      + (amount3 - amount2) * duration * endTangent
    );
  }
  return {
    startTime,
    startTangent,
    startValue,
    endTime,
    endTangent,
    endValue,
    evaluatedValue,
    fixedTurns: Math.trunc(evaluatedValue * 65536 / (2 * Math.PI)),
  };
}

function parseCsv(bytes) {
  const lines = bytes.toString("utf8").trim().split(/\r?\n/);
  const headings = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(
    line.split(",").map((value, index) => [headings[index], value]),
  ));
}

const options = argumentsFrom(process.argv.slice(2));
const gdbBytes = readRequired(options.gdb);
const interpreterBytes = readRequired(options.interpreter);
const capture = JSON.parse(gdbBytes.toString("utf8"));
if (
  capture.schema !== "new-yokosuka-s2-native-pelvis-callback-trace-v1"
  || capture.status !== "complete"
  || capture.observations?.length !== 1
) {
  throw new Error("Expected one complete native pelvis callback observation");
}

const observation = capture.observations[0];
const controller = parseHex(observation.controllerAddress);
const context = parseHex(observation.contextAddress);
const descriptors = [
  observation.firstAxisDescriptorAtCall
    || observation.transientFirstAxisDescriptor,
  ...observation.installedRemainingAxisDescriptors,
];
if (descriptors.some((descriptor) => !descriptor)) {
  throw new Error("Callback capture is missing one or more axis descriptors");
}
const expectedOffsets = [0x170, 0x1b0, 0x1f0];
for (let index = 0; index < descriptors.length; index += 1) {
  const address = parseHex(descriptors[index].address);
  if (address !== controller + expectedOffsets[index]) {
    throw new Error(
      `Callback axis ${index} uses ${descriptors[index].address}, not `
      + `controller ${hex(controller)} + ${hex(expectedOffsets[index], 3)}`,
    );
  }
  if (address !== parseHex(observation.contextWords[index])) {
    throw new Error(`Context axis pointer ${index} does not match its descriptor`);
  }
}

const evaluated = descriptors.map((descriptor) => (
  evaluateDescriptor(descriptor, observation.currentCurveTime)
));
const helperDefinitions = [
  { pc: "8c1e0040", returnPc: "8c0e7fba", nativeAxis: "Z" },
  { pc: "8c1dff90", returnPc: "8c0e7fcc", nativeAxis: "Y" },
  { pc: "8c1dfed0", returnPc: "8c0e7fde", nativeAxis: "X" },
];
const rows = parseCsv(interpreterBytes).filter((row) => (
  parseHex(row.r3) === controller
  && parseHex(row.r9) === context
));
const groups = [];
for (let index = 0; index <= rows.length - helperDefinitions.length; index += 1) {
  const group = rows.slice(index, index + helperDefinitions.length);
  if (group.every((row, axis) => (
    row.pc === helperDefinitions[axis].pc
    && row.pr === helperDefinitions[axis].returnPc
    && parseHex(row.r13) - 8 === controller
    && parseHex(row.r9) === context
  ))) {
    groups.push(group);
  }
}
const exactGroups = groups.filter((group) => group.every((row, axis) => (
  signedHex32(row.fpul) === evaluated[axis].fixedTurns
)));
if (exactGroups.length !== 1) {
  throw new Error(
    `Expected one exact same-controller callback group, found ${exactGroups.length}`,
  );
}
const nativeGroup = exactGroups[0];

if (
  observation.actorRootMatrix?.length !== 16
  || observation.pelvisPrimaryWorldMatrixAfter?.length !== 16
) {
  throw new Error("GDB callback capture does not contain its same-cycle matrices");
}
const nativePrimaryRotation = shenmue2NativeActorRelativeRotationQuaternion(
  observation.pelvisPrimaryWorldMatrixAfter,
  observation.actorRootMatrix,
);
const browserPrimaryRotation = shenmue2NativePelvisRotationQuaternion({
  rx: evaluated[0].evaluatedValue,
  ry: evaluated[1].evaluatedValue,
  rz: evaluated[2].evaluatedValue,
});
const quaternionDot = Math.min(1, Math.abs(BABYLON.Quaternion.Dot(
  nativePrimaryRotation,
  browserPrimaryRotation,
)));
const primaryMatrixOrientationErrorDegrees = (
  2 * Math.acos(quaternionDot) * 180 / Math.PI
);

const axes = descriptors.map((descriptor, index) => {
  const nativeFixedTurns = signedHex32(nativeGroup[index].fpul);
  return {
    compactChannel: ["rx", "ry", "rz"][index],
    curveIndex: index + 3,
    nativeAxis: helperDefinitions[index].nativeAxis,
    descriptorAddress: descriptor.address,
    controllerOffset: expectedOffsets[index],
    descriptorWordHex: descriptor.wordHex,
    hermite: evaluated[index],
    nativeHelper: {
      address: hex(parseHex(nativeGroup[index].pc)),
      callbackReturnAddress: hex(parseHex(nativeGroup[index].pr)),
      cycle: Number(nativeGroup[index].cycles),
      fixedTurns: nativeFixedTurns,
      evaluatorAdvancedDescriptorAddress: hex(parseHex(nativeGroup[index].r2)),
    },
    exactFixedTurnMatch: nativeFixedTurns === evaluated[index].fixedTurns,
  };
});

const evidence = {
  schema: "new-yokosuka-s2-pelvis-callback-conformance-v1",
  conclusion: (
    "A naturally executed FUN_8c0e7f00 callback reads controller curves "
    + "3/4/5 at +0x170/+0x1b0/+0x1f0. Browser Hermite evaluation and "
    + "radian-to-fixed-turn truncation reproduce all three native helper "
    + "inputs exactly in the same callback invocation."
  ),
  sources: {
    gdbCallbackCapture: {
      file: path.relative(repositoryRoot, options.gdb),
      sha256: sha256(gdbBytes),
      observationType: capture.source.observationType,
      emulatorExecutableSha256: capture.source.emulatorExecutable.sha256,
      discImageSha256: capture.source.discImage.sha256,
      saveStateSha256: capture.source.saveState.sha256,
      displayedSaveSlot: capture.source.saveState.displayedSlot,
    },
    interpreterEntryTrace: {
      file: path.relative(repositoryRoot, options.interpreter),
      sha256: sha256(interpreterBytes),
      observationType: (
        "natural SH-4 interpreter entries filtered by the callback's three "
        + "matrix-helper return addresses"
      ),
    },
  },
  sh4: {
    callbackAddress: hex(parseHex(capture.callbackAddress)),
    scalarCurveEvaluatorAddress: "0x8c1cdee0",
    radiansToFixedTurns: "FTRC(value * 65536 / (2 * pi))",
    matrixHelperOrder: helperDefinitions.map(({ pc, returnPc, nativeAxis }) => ({
      helperAddress: hex(parseHex(pc)),
      callbackReturnAddress: hex(parseHex(returnPc)),
      nativeAxis,
    })),
  },
  observation: {
    controllerAddress: observation.controllerAddress,
    contextAddress: observation.contextAddress,
    currentCurveTime: observation.currentCurveTime,
    mode: observation.mode,
    modeSource: observation.modeSource,
    capturedBlendAmount: observation.capturedBlendAmount,
    forceComplete: observation.forceComplete,
    contextAxisPointers: observation.contextWords.slice(0, 3),
    contextBlendPointer: observation.contextWords[4],
    axes,
    browserFixedTurns: axes.map(({ hermite }) => hermite.fixedTurns),
    nativeFixedTurns: axes.map(({ nativeHelper }) => nativeHelper.fixedTurns),
    exactFixedTurnMatch: axes.every(({ exactFixedTurnMatch }) => (
      exactFixedTurnMatch
    )),
    primaryMatrixConformance: {
      actorRootMatrix: observation.actorRootMatrix,
      nativePrimaryWorldMatrix: observation.pelvisPrimaryWorldMatrixAfter,
      orientationErrorDegrees: primaryMatrixOrientationErrorDegrees,
      maximumAcceptedErrorDegrees: 0.05,
      passes: primaryMatrixOrientationErrorDegrees <= 0.05,
    },
  },
};

fs.mkdirSync(path.dirname(options.out), { recursive: true });
fs.writeFileSync(options.out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(repositoryRoot, options.out)}: `
  + `${evidence.observation.nativeFixedTurns.join(", ")}`,
);
