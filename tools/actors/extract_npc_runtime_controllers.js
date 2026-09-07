#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  discoverProgramExtents,
  hexAddress,
  normalizedRamPointer,
  ramOffset,
  runtimeAddress,
  sha256,
  timeText,
} from "../lib/scheduled_actor_extractor.js";

const ACTOR_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CONTROLLER_OFFSET = 0x6c;
const ACTOR_OPERATION_OFFSET = 0x04;
const ACTOR_OPERATION_POINTER_OFFSET = 0xec;
const CONTROLLER_MATRIX_ARRAY_OFFSET = 0xb0;
const CONTROLLER_CONTROL_ARRAY_OFFSET = 0xb4;
const CONTROLLER_FAMILY_INDEX_OFFSET = 0x1c4;
const CONTROL_STRIDE = 0x48;
const MATRIX_STRIDE = 0x40;
const CONTROL_MATRIX_POINTER_OFFSET = 0x44;
const MAX_CONTROL_COUNT = 128;
const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const SCHEDULER_CLOCK_SIGNATURE_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_SIGNATURE_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;

function usage() {
  console.error([
    "Usage: node tools/actors/extract_npc_runtime_controllers.js <ram.bin> [ACTOR ...] [--out report.json]",
    "",
    "Finds live scheduled actors through their relocated PRG1 owner pointer and",
    "dumps each actor's native controller records and final matrices. Actor codes",
    "are optional; without them every resident scheduled-actor controller is kept.",
  ].join("\n"));
}

function parseArgs(argv) {
  const result = { ramPath: "", actorCodes: [], outputPath: "" };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--out") {
      result.outputPath = argv[++index] || "";
    } else if (!result.ramPath) {
      result.ramPath = argument;
    } else {
      result.actorCodes.push(argument.toUpperCase());
    }
  }
  if (!result.ramPath || (argv.includes("--out") && !result.outputPath)) {
    usage();
    process.exit(2);
  }
  return result;
}

function pointerBytes(pointer) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(pointer >>> 0);
  return result;
}

function occurrences(data, bytes) {
  const result = [];
  let cursor = -1;
  while ((cursor = data.indexOf(bytes, cursor + 1)) !== -1) {
    result.push(cursor);
  }
  return result;
}

function schedulerClock(data) {
  const executablePath = path.resolve(".disc-work/exact/1ST_READ.BIN");
  if (!fs.existsSync(executablePath)) return null;
  const executable = fs.readFileSync(executablePath);
  const signatureOffset = (
    SCHEDULER_CLOCK_SIGNATURE_ADDRESS - EXECUTABLE_LOAD_ADDRESS
  );
  const signature = executable.subarray(
    signatureOffset,
    signatureOffset + SCHEDULER_CLOCK_SIGNATURE_LENGTH,
  );
  if (signature.length !== SCHEDULER_CLOCK_SIGNATURE_LENGTH) return null;
  const matches = occurrences(data, signature);
  if (matches.length !== 1) return null;
  const cachePointer = normalizedRamPointer(
    data.readUInt32LE(
      matches[0] + SCHEDULER_CLOCK_CACHE_POINTER_OFFSET,
    ),
    data.length,
  );
  if (cachePointer === null) return null;
  const seconds = data.readUInt32LE(ramOffset(cachePointer));
  return seconds < 86400 ? seconds : null;
}

function finiteMatrix(data, offset) {
  if (offset < 0 || offset + MATRIX_STRIDE > data.length) return false;
  for (let cursor = 0; cursor < MATRIX_STRIDE; cursor += 4) {
    if (!Number.isFinite(data.readFloatLE(offset + cursor))) return false;
  }
  return true;
}

function inferControlCount(data, controlsAddress, matricesAddress) {
  const controlsOffset = ramOffset(controlsAddress);
  const matricesOffset = ramOffset(matricesAddress);
  let count = 0;
  for (; count < MAX_CONTROL_COUNT; count++) {
    const controlOffset = controlsOffset + count * CONTROL_STRIDE;
    const matrixOffset = matricesOffset + count * MATRIX_STRIDE;
    if (
      controlOffset + CONTROL_STRIDE > data.length
      || matrixOffset + MATRIX_STRIDE > data.length
      || !finiteMatrix(data, matrixOffset)
    ) {
      break;
    }
    const embeddedMatrix = normalizedRamPointer(
      data.readUInt32LE(controlOffset + CONTROL_MATRIX_POINTER_OFFSET),
      data.length,
    );
    if (embeddedMatrix !== runtimeAddress(matrixOffset)) break;
  }
  return count;
}

function pointer(data, offset) {
  if (offset < 0 || offset + 4 > data.length) return null;
  return normalizedRamPointer(data.readUInt32LE(offset), data.length);
}

function controlIndexForPointer(pointerValue, controlsAddress, controlCount) {
  if (pointerValue === null) return null;
  const delta = pointerValue - controlsAddress;
  if (delta < 0 || delta % CONTROL_STRIDE !== 0) return null;
  const index = delta / CONTROL_STRIDE;
  return index < controlCount ? index : null;
}

function readControl(
  data,
  address,
  index,
  controlsAddress,
  controlCount,
) {
  const offset = ramOffset(address);
  const bytes = data.subarray(offset, offset + CONTROL_STRIDE);
  const pointerValues = Object.fromEntries([
    ["at1c", 0x1c],
    ["at20", 0x20],
    ["at24", 0x24],
    ["at28", 0x28],
    ["at2c", 0x2c],
    ["at30", 0x30],
    ["at34", 0x34],
    ["at38", 0x38],
    ["matrixAt44", 0x44],
  ].map(([name, fieldOffset]) => [
    name,
    normalizedRamPointer(
      bytes.readUInt32LE(fieldOffset),
      data.length,
    ),
  ]));
  const readFloat3 = (pointerValue) => {
    if (pointerValue === null) return null;
    const sourceOffset = ramOffset(pointerValue);
    if (sourceOffset + 12 > data.length) return null;
    return [0, 4, 8].map(
      (component) => data.readFloatLE(sourceOffset + component),
    );
  };
  const readDescriptorRotation = (pointerValue) => {
    if (pointerValue === null) return null;
    const sourceOffset = ramOffset(pointerValue);
    if (sourceOffset + 10 > data.length) return null;
    // The executable copies descriptor +0x14/+0x18/+0x1c into the packed
    // control-record shorts at +0x0a/+0x0c/+0x0e. The intervening source
    // bytes are alignment/padding, not additional rotation components.
    return [0, 4, 8].map(
      (component) => data.readInt16LE(sourceOffset + component),
    );
  };
  const childPointers = [
    pointerValues.at2c,
    pointerValues.at30,
    pointerValues.at34,
  ];
  return {
    index,
    address: hexAddress(address),
    rawHex: bytes.toString("hex"),
    observedByteFields: {
      byte00: bytes.readUInt8(0),
      byte01: bytes.readUInt8(1),
      byte02: bytes.readUInt8(2),
      byte03: bytes.readUInt8(3),
      byte04: bytes.readUInt8(4),
      byte05: bytes.readUInt8(5),
      byte06: bytes.readUInt8(6),
      byte07: bytes.readUInt8(7),
    },
    observedInt16At0a: [
      bytes.readInt16LE(0x0a),
      bytes.readInt16LE(0x0c),
      bytes.readInt16LE(0x0e),
    ],
    observedFloatAt10: [
      bytes.readFloatLE(0x10),
      bytes.readFloatLE(0x14),
      bytes.readFloatLE(0x18),
    ],
    observedPointers: Object.fromEntries(
      Object.entries(pointerValues).map(([name, value]) => [
        name,
        value === null ? null : hexAddress(value),
      ]),
    ),
    nativeStructure: {
      defaultPosition: readFloat3(pointerValues.at24),
      defaultRotationRaw: readDescriptorRotation(pointerValues.at28),
      children: childPointers
        .map((value) => controlIndexForPointer(
          value,
          controlsAddress,
          controlCount,
        ))
        .filter((value) => value !== null),
    },
    observedFloatAt3c: bytes.readFloatLE(0x3c),
  };
}

function readMatrix(data, address, index) {
  const offset = ramOffset(address);
  return {
    index,
    address: hexAddress(address),
    values: Array.from(
      { length: 16 },
      (_, component) => data.readFloatLE(offset + component * 4),
    ),
  };
}

const args = parseArgs(process.argv.slice(2));
const ramPath = path.resolve(args.ramPath);
const data = fs.readFileSync(ramPath);
const requestedCodes = new Set(args.actorCodes);
const actors = [];
const resolutionErrors = [];

for (const program of discoverProgramExtents(data)) {
  if (requestedCodes.size && !requestedCodes.has(program.actorCode)) continue;
  const ownerPointer = ((program.programHeader & 0x0fffffff) - 4) >>> 0;
  const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
    .filter((offset) => offset + ACTOR_MINIMUM_LENGTH <= data.length);
  const controllerCandidates = actorOffsets.flatMap((actorOffset) => {
    const controllerAddress = pointer(
      data,
      actorOffset + ACTOR_CONTROLLER_OFFSET,
    );
    if (controllerAddress === null) return [];
    const controllerOffset = ramOffset(controllerAddress);
    const matricesAddress = pointer(
      data,
      controllerOffset + CONTROLLER_MATRIX_ARRAY_OFFSET,
    );
    const controlsAddress = pointer(
      data,
      controllerOffset + CONTROLLER_CONTROL_ARRAY_OFFSET,
    );
    if (matricesAddress === null || controlsAddress === null) return [];
    const controlCount = inferControlCount(
      data,
      controlsAddress,
      matricesAddress,
    );
    return controlCount > 0
      ? [{
        actorOffset,
        controllerAddress,
        matricesAddress,
        controlsAddress,
        controlCount,
      }]
      : [];
  });
  if (controllerCandidates.length !== 1) {
    if (
      actorOffsets.length
      || controllerCandidates.length
      || requestedCodes.has(program.actorCode)
    ) {
      resolutionErrors.push({
        actorCode: program.actorCode,
        programHeader: hexAddress(program.programHeader),
        ownerPointer: hexAddress(ownerPointer),
        candidateActorRecordCount: actorOffsets.length,
        validControllerCandidateCount: controllerCandidates.length,
      });
    }
    continue;
  }

  const {
    actorOffset,
    controllerAddress,
    matricesAddress,
    controlsAddress,
    controlCount,
  } = controllerCandidates[0];
  const actorAddress = runtimeAddress(actorOffset);

  actors.push({
    actorCode: program.actorCode,
    programHeader: hexAddress(program.programHeader),
    ownerPointer: hexAddress(ownerPointer),
    actorAddress: hexAddress(actorAddress),
    currentOperation: data.readUInt16LE(
      actorOffset + ACTOR_OPERATION_OFFSET,
    ),
    operationPointer: hexAddress(
      data.readUInt32LE(actorOffset + ACTOR_OPERATION_POINTER_OFFSET),
    ),
    controllerAddress: hexAddress(controllerAddress),
    controllerFamilyIndex: data.readInt32LE(
      ramOffset(controllerAddress) + CONTROLLER_FAMILY_INDEX_OFFSET,
    ),
    controlsAddress: hexAddress(controlsAddress),
    matricesAddress: hexAddress(matricesAddress),
    controlStride: CONTROL_STRIDE,
    matrixStride: MATRIX_STRIDE,
    controlCount,
    controls: Array.from(
      { length: controlCount },
      (_, index) => readControl(
        data,
        controlsAddress + index * CONTROL_STRIDE,
        index,
        controlsAddress,
        controlCount,
      ),
    ),
    matrices: Array.from(
      { length: controlCount },
      (_, index) => readMatrix(
        data,
        matricesAddress + index * MATRIX_STRIDE,
        index,
      ),
    ),
  });
}

const report = {
  schema: "new-yokosuka-npc-runtime-controllers-v1",
  source: {
    ramPath,
    byteLength: data.length,
    sha256: sha256(data),
  },
  schedulerClockSecond: schedulerClock(data),
  method: {
    actorOwnership: "single relocated pointer to four bytes before ACTORPRG1",
    controllerPointer: "actor +0x6c",
    controllerFamilyIndex: "controller +0x1c4",
    finalMatrixArrayPointer: "controller +0xb0",
    controlArrayPointer: "controller +0xb4",
    countProof: "consecutive control +0x44 pointers equal same-index final matrices",
    interpretationPolicy: (
      "Raw records are authoritative. Candidate fields retain neutral names "
      + "until NPC controller-family dispatch is recovered; Ryo meanings are "
      + "not assumed."
    ),
  },
  requestedActorCodes: [...requestedCodes],
  actorCount: actors.length,
  actors,
  resolutionErrors,
};
if (report.schedulerClockSecond !== null) {
  report.schedulerClock = timeText(report.schedulerClockSecond);
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (args.outputPath) {
  const outputPath = path.resolve(args.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.error(`Wrote ${actors.length} controllers to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
