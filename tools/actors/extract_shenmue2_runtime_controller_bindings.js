#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  shenmue2HumanActorCodes,
  shenmue2RuntimeActorBindings,
} from "../lib/Shenmue2RuntimeActorBinding.js";
import {
  SHENMUE2_SPECIAL_ACTOR_CODES,
} from "../lib/Shenmue2SpecialActorBinding.js";
import { shenmue2RamCaptureTiming } from
  "../lib/Shenmue2CaptureEvidence.js";

const RAM_BASE = 0x8c000000;
const RAM_SIZE = 0x01000000;
const CONTROLLER_SIZE = 0x2440;
const CURRENT_MOTION_IDS_OFFSET = 0x2400;
const REQUESTED_MOTION_IDS_OFFSET = 0x240a;
const SLOT_FLAGS_OFFSET = 0x23c0;
const SLOT_COUNT = 5;
const MATRIX_SIZE = 0x40;
const MDC7 = Buffer.from("MDC7", "ascii");
const SOLVER_SLOT_OFFSETS = Object.freeze([0x08, 0xe18, 0x11a8, 0x1578, 0x1af8]);

function usage() {
  console.error([
    "Usage: node tools/actors/extract_shenmue2_runtime_controller_bindings.js RAM.BIN",
    "       [--motion-id 0xf03e] [--humans-idx HUMANS.IDX] [--out REPORT.json]",
    "",
    "Finds live Shenmue II compact-motion controllers and follows the native",
    "MDC7 render-node pointers to their post-solver controller matrices.",
  ].join("\n"));
}

function parseArguments(argv) {
  const result = {
    ramPath: null,
    motionId: null,
    outputPath: null,
    humansIndexPath: ".disc-work/shenmue2-disc1-native-npc/HUMANS.IDX",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--motion-id") {
      result.motionId = Number(argv[++index]);
    } else if (value === "--out") {
      result.outputPath = argv[++index] || null;
    } else if (value === "--humans-idx") {
      result.humansIndexPath = argv[++index] || null;
    } else if (!result.ramPath) {
      result.ramPath = value;
    } else {
      usage();
      process.exit(2);
    }
  }
  if (
    !result.ramPath
    || (result.motionId !== null && !Number.isInteger(result.motionId))
    || (argv.includes("--out") && !result.outputPath)
  ) {
    usage();
    process.exit(2);
  }
  return result;
}

function runtimeAddress(offset) {
  return (RAM_BASE + offset) >>> 0;
}

function hex(value) {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function nativeMotionId(value) {
  return (
    value === 0
    || (value >= 0x8001 && value <= 0x8105)
    || (value >= 0x9101 && value <= 0x910a)
    || (value >= 0x9301 && value <= 0x931a)
    || (value >= 0x9601 && value <= 0x9604)
    || (value >= 0x9701 && value <= 0x9706)
    || (value >= 0x9801 && value <= 0x9809)
    || (value >= 0x9901 && value <= 0x9908)
    || value === 0xa101
    || (value >= 0xa301 && value <= 0xa303)
    || (value >= 0xa401 && value <= 0xa403)
    || (value >= 0xa501 && value <= 0xa506)
    || (value >= 0xa701 && value <= 0xa702)
    || (value >= 0xa801 && value <= 0xa806)
    || (value >= 0xe001 && value <= 0xe3b7)
    || (value >= 0xf001 && value <= 0xf130)
  );
}

function u16Array(ram, offset, count) {
  return Array.from(
    { length: count },
    (_, index) => ram.readUInt16LE(offset + index * 2),
  );
}

function floatMatrix(ram, offset) {
  return Array.from(
    { length: 16 },
    (_, index) => ram.readFloatLE(offset + index * 4),
  );
}

function affineMatrix(matrix) {
  if (!matrix.every(Number.isFinite)) return false;
  if (
    Math.abs(matrix[3]) > 0.002
    || Math.abs(matrix[7]) > 0.002
    || Math.abs(matrix[11]) > 0.002
    || Math.abs(matrix[15] - 1) > 0.002
  ) return false;
  for (let row = 0; row < 3; row += 1) {
    const lengthSquared = (
      matrix[row] ** 2
      + matrix[4 + row] ** 2
      + matrix[8 + row] ** 2
    );
    if (lengthSquared < 0.5 || lengthSquared > 1.5) return false;
  }
  return true;
}

function solverSlotForMatrixOffset(matrixOffset) {
  for (let slot = SOLVER_SLOT_OFFSETS.length - 1; slot >= 0; slot -= 1) {
    if (matrixOffset >= SOLVER_SLOT_OFFSETS[slot]) return slot;
  }
  return null;
}

function compactControllerAt(ram, offset) {
  if (
    offset < 0
    || offset + CONTROLLER_SIZE > ram.length
    // Native allocations observed on Dreamcast end in ...08/...28/...48/etc.
    || (runtimeAddress(offset) & 0x1f) !== 0x08
  ) return null;
  const flags = u16Array(ram, offset + SLOT_FLAGS_OFFSET, SLOT_COUNT);
  const currentMotionIds = u16Array(
    ram,
    offset + CURRENT_MOTION_IDS_OFFSET,
    SLOT_COUNT,
  );
  const requestedMotionIds = u16Array(
    ram,
    offset + REQUESTED_MOTION_IDS_OFFSET,
    SLOT_COUNT,
  );
  if (
    flags.slice(0, 4).some((value) => value !== 0x0c)
    || currentMotionIds[0] === 0
    || currentMotionIds.slice(0, 4).some(
      (value) => value !== currentMotionIds[0],
    )
    || !currentMotionIds.every(nativeMotionId)
    || !requestedMotionIds.every(nativeMotionId)
    || requestedMotionIds.some((value) => value !== 0)
  ) return null;
  const rootMatrix = floatMatrix(ram, offset + 8);
  if (!affineMatrix(rootMatrix)) return null;
  return { flags, currentMotionIds, requestedMotionIds, rootMatrix };
}

function occurrences(buffer, needle, start, end) {
  const result = [];
  let cursor = start - 1;
  while ((cursor = buffer.indexOf(needle, cursor + 1)) >= 0 && cursor < end) {
    result.push(cursor);
  }
  return result;
}

function renderBindings(ram, controllerOffset, nodeOffsets) {
  const controllerAddress = runtimeAddress(controllerOffset);
  const controllerEndAddress = controllerAddress + CONTROLLER_SIZE;
  const candidates = nodeOffsets.flatMap((nodeOffset, index) => {
    const nextOffset = nodeOffsets[index + 1];
    if (nextOffset === undefined) return [];
    if (nextOffset - nodeOffset < 12) return [];
    const bindingFieldOffset = nextOffset - 8;
    const matrixAddress = ram.readUInt32LE(bindingFieldOffset);
    if (
      matrixAddress < controllerAddress
      || matrixAddress + MATRIX_SIZE > controllerEndAddress
    ) return [];
    const matrixOffset = (matrixAddress - RAM_BASE) >>> 0;
    const matrix = floatMatrix(ram, matrixOffset);
    if (!affineMatrix(matrix)) return [];
    return [{
      runtimeRenderRecordAddress: hex(runtimeAddress(nodeOffset)),
      captureWindowRecordOrder: index,
      runtimeRenderRecordByteLength: nextOffset - nodeOffset,
      bindingFieldAddress: hex(runtimeAddress(bindingFieldOffset)),
      controllerMatrixAddress: hex(matrixAddress),
      controllerMatrixOffset: matrixAddress - controllerAddress,
      solverSlot: solverSlotForMatrixOffset(
        matrixAddress - controllerAddress,
      ),
      controllerMatrix: matrix,
      runtimeRenderRecordLocalMatrix: floatMatrix(ram, nodeOffset + 4),
    }];
  });
  const firstRecordOrder = candidates[0]?.captureWindowRecordOrder ?? 0;
  return candidates.map((binding, boundRecordOrder) => ({
    ...binding,
    // MDC7 records belonging to one live character are contiguous. Some are
    // model-node records and others are geometry records, so do not infer a
    // one-record-per-bone skeleton from this ordering. Preserve both orders
    // solely as stable joins for comparing captures of the same model family.
    runtimeRenderRecordOrder: (
      binding.captureWindowRecordOrder - firstRecordOrder
    ),
    boundRecordOrder,
  }));
}

const args = parseArguments(process.argv.slice(2));
const ramPath = path.resolve(args.ramPath);
const ram = fs.readFileSync(ramPath);
if (ram.length !== RAM_SIZE) {
  throw new Error(`Expected a 16 MiB Dreamcast RAM dump, received ${ram.length} bytes`);
}
const renderNodeOffsets = occurrences(ram, MDC7, 0, ram.length);
const actorBindings = args.humansIndexPath && fs.existsSync(args.humansIndexPath)
  ? shenmue2RuntimeActorBindings(
      ram,
      [
        ...shenmue2HumanActorCodes(args.humansIndexPath),
        ...SHENMUE2_SPECIAL_ACTOR_CODES,
      ],
    )
  : new Map();

const controllers = [];
for (let offset = 0; offset + CONTROLLER_SIZE <= ram.length; offset += 4) {
  const controller = compactControllerAt(ram, offset);
  if (!controller) continue;
  if (
    args.motionId !== null
    && controller.currentMotionIds[0] !== (args.motionId & 0xffff)
  ) continue;
  const bindings = renderBindings(ram, offset, renderNodeOffsets);
  controllers.push({
    address: hex(runtimeAddress(offset)),
    byteLength: CONTROLLER_SIZE,
    slotFlags: controller.flags.map(hex),
    currentMotionIds: controller.currentMotionIds.map(hex),
    requestedMotionIds: controller.requestedMotionIds.map(hex),
    worldPosition: controller.rootMatrix.slice(12, 15),
    rootMatrix: controller.rootMatrix,
    renderBindingCount: bindings.length,
    renderBindings: bindings,
    actorBinding: actorBindings.get(runtimeAddress(offset)) || null,
  });
}

const report = {
  schema: "new-yokosuka-shenmue2-runtime-controller-bindings-v2",
  source: {
    ramPath,
    byteLength: ram.length,
    captureTiming: shenmue2RamCaptureTiming(ramPath),
  },
  method: {
    controllerIdentification: (
      "five native compact-motion slot records at +0x23c0/+0x2400/+0x240a "
      + "and an affine actor-root matrix at +0x08"
    ),
    renderBindingIdentification: (
      "the final pointer field before the next RAM-resident MDC7 render record "
      + "addresses "
      + "an affine post-solver matrix inside the adjacent compact controller"
    ),
    solverSlotIdentification: (
      "controller-relative matrix ranges are partitioned by the five native "
      + "solver structure bases at +0x08/+0xe18/+0x11a8/+0x1578/+0x1af8"
    ),
    evidenceBoundary: (
      "runtime addresses are capture-local; controller-relative matrix offsets "
      + "and source-backed node ordering are the portable evidence; only a "
      + "completed PVR frame synchronizes solver inputs with output matrices"
    ),
    actorBindingIdentification: (
      "ordinary native actor records retain their HUMANS code and duplicate "
      + "controller pointers at code +0x08/+0x24; CLMD story records retain "
      + "the controller pointer at code -0x20"
    ),
    specialActorCodes: SHENMUE2_SPECIAL_ACTOR_CODES,
  },
  requestedMotionId: args.motionId === null ? null : hex(args.motionId),
  controllerCount: controllers.length,
  controllers,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (args.outputPath) {
  const outputPath = path.resolve(args.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.error(`Wrote ${controllers.length} controllers to ${outputPath}`);
} else {
  process.stdout.write(serialized);
}
