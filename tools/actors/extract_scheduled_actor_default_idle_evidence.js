#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  resolveScheduledActorMotionState,
} from "../../src/ScheduledActorMotionRegistry.js";
import {
  OPERATION_ONE_HANDLER_ADDRESS,
  SCHEDULED_ACTOR_DEFINITION_CODE_OFFSET,
  SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_OFFSETS,
  SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_TABLE_OFFSET,
  SCHEDULED_ACTOR_DEFINITION_DEFAULT_MOTION_OFFSET,
  SCHEDULED_ACTOR_DEFINITION_POINTER_OFFSET,
  SCHEDULED_ACTOR_LOOKUP_ADDRESS,
  SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS,
  SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS,
  SCHEDULED_ACTOR_RECORD_STRIDE,
} from "../lib/scheduler_descriptor_layout.js";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/exact/1ST_READ.BIN",
);
const motionBankPath = path.resolve(
  process.argv[4] || "play/assets/scheduled-actors/M_MOBJ.BIN",
);
const outputPath = path.resolve(
  process.argv[5]
    || "tools/evidence/scheduled-actor-default-idle-evidence.json",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const OPERATION_ONE_SELECTION_ADDRESS = 0x0c11f978;
const OPERATION_09_LIFECYCLE_RESET_ADDRESS = 0x0c11ee08;
const RANDOM_FUNCTION_ADDRESS = 0x0c1ce1f0;
const SIGNED_REMAINDER_FUNCTION_ADDRESS = 0x0c1dc440;
const OPERATION_ONE_SELECTION_SIGNATURE = Buffer.from(
  "3ad3e2680b437c7839d203610b4204e0"
  + "017000408d033d63669000ec360e",
  "hex",
);
const LOOKUP_SIGNATURE = Buffer.from(
  "0fd200e70dd322601540208f326552666826178961524032148b0b0053606c0194fe8001",
  "hex",
);
const OPERATION_09_LIFECYCLE_RESET_SIGNATURE = Buffer.from(
  "e62f436e2e90224fec0001883a8be26228223789",
  "hex",
);

function address(value) {
  return Number.parseInt(value, 16);
}

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(runtimeAddress) {
  return runtimeAddress - EXECUTABLE_LOAD_ADDRESS;
}

function requireSignature(executable, runtimeAddress, signature, label) {
  const offset = executableOffset(runtimeAddress);
  const actual = executable.subarray(offset, offset + signature.length);
  if (!actual.equals(signature)) {
    throw new Error(`${label} executable signature is not reviewed`);
  }
}

function physicalOffset(pointer, byteLength) {
  const offset = pointer & 0x00ffffff;
  return offset < byteLength ? offset : null;
}

function readGlobalU32(data, runtimeAddress) {
  const offset = physicalOffset(runtimeAddress, data.length);
  if (offset === null || offset + 4 > data.length) return null;
  return data.readUInt32LE(offset);
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const executable = fs.readFileSync(executablePath);
const mobj = MotnLoader.parse(fs.readFileSync(motionBankPath));

requireSignature(
  executable,
  OPERATION_ONE_SELECTION_ADDRESS,
  OPERATION_ONE_SELECTION_SIGNATURE,
  "Operation-0x01 default-idle selection",
);
requireSignature(
  executable,
  address(SCHEDULED_ACTOR_LOOKUP_ADDRESS),
  LOOKUP_SIGNATURE,
  "Resident scheduled-actor lookup",
);
requireSignature(
  executable,
  OPERATION_09_LIFECYCLE_RESET_ADDRESS,
  OPERATION_09_LIFECYCLE_RESET_SIGNATURE,
  "Operation-0x09 default-motion reset",
);
if (
  executable.readUInt32LE(executableOffset(0x0c11bf98))
    !== address(SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS)
  || executable.readUInt32LE(executableOffset(0x0c11bf9c))
    !== address(SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS)
  || executable.readUInt16LE(executableOffset(0x0c11c0b0))
    !== SCHEDULED_ACTOR_RECORD_STRIDE
  || executable.readUInt32LE(executableOffset(0x0c11fa64))
    !== RANDOM_FUNCTION_ADDRESS
  || executable.readUInt32LE(executableOffset(0x0c11fa68))
    !== SIGNED_REMAINDER_FUNCTION_ADDRESS
) {
  throw new Error("Scheduled-actor registry/default-idle literals changed");
}

const uniqueCaptures = [...new Map(
  inventory.captures.map((capture) => [capture.sha256, capture]),
).values()];
const observationsByActor = new Map();
const invalidRegistries = [];
let residentRecordObservationCount = 0;

for (const capture of uniqueCaptures) {
  const data = fs.readFileSync(capture.path);
  const actorArrayPointer = readGlobalU32(
    data,
    address(SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS),
  );
  const actorCount = readGlobalU32(
    data,
    address(SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS),
  );
  const actorArrayOffset = actorArrayPointer === null
    ? null
    : physicalOffset(actorArrayPointer, data.length);
  if (
    actorArrayOffset === null
    || actorCount === null
    || actorCount > 1024
    || actorArrayOffset + actorCount * SCHEDULED_ACTOR_RECORD_STRIDE
      > data.length
  ) {
    invalidRegistries.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      actorArrayPointer: actorArrayPointer === null
        ? null
        : hex(actorArrayPointer),
      actorCount,
    });
    continue;
  }

  for (let index = 0; index < actorCount; index++) {
    const actorOffset = (
      actorArrayOffset + index * SCHEDULED_ACTOR_RECORD_STRIDE
    );
    const definitionPointer = data.readUInt32LE(
      actorOffset + SCHEDULED_ACTOR_DEFINITION_POINTER_OFFSET,
    );
    const definitionOffset = physicalOffset(
      definitionPointer,
      data.length,
    );
    const definitionEnd = definitionOffset === null
      ? null
      : definitionOffset
        + Math.max(...SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_OFFSETS)
        + 2;
    if (definitionOffset === null || definitionEnd > data.length) continue;

    const actorCode = data.subarray(
      definitionOffset + SCHEDULED_ACTOR_DEFINITION_CODE_OFFSET,
      definitionOffset + SCHEDULED_ACTOR_DEFINITION_CODE_OFFSET + 4,
    ).toString("ascii");
    if (!/^[\x20-\x7e]{4}$/.test(actorCode)) continue;

    const candidateMotionIds =
      SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_OFFSETS.map(
        (offset) => data.readUInt16LE(definitionOffset + offset),
      );
    const defaultMotionStateId = data.readUInt16LE(
      definitionOffset + SCHEDULED_ACTOR_DEFINITION_DEFAULT_MOTION_OFFSET,
    );
    const key = [defaultMotionStateId, ...candidateMotionIds].join(",");
    if (!observationsByActor.has(actorCode)) {
      observationsByActor.set(actorCode, new Map());
    }
    const variants = observationsByActor.get(actorCode);
    if (!variants.has(key)) {
      variants.set(key, {
        defaultMotionStateId,
        candidateMotionIds,
        observationCount: 0,
        representativeCapturePath: capture.path,
        representativeCaptureSha256: capture.sha256,
        representativeActorRecordAddress: hex(
          0x8c000000 + actorOffset,
        ),
        representativeDefinitionAddress: hex(
          definitionPointer,
        ),
      });
    }
    variants.get(key).observationCount++;
    residentRecordObservationCount++;
  }
}

function resolveCandidate(motionId) {
  if (motionId === 0) {
    return {
      motionId,
      status: "zero/unassigned native motion state",
    };
  }
  const resolved = resolveScheduledActorMotionState(motionId);
  const sequence = resolved?.bank === "mobj"
    ? mobj.sequences[resolved.index]
    : null;
  if (!resolved || !sequence) {
    return {
      motionId,
      status: "outside reviewed M_MOBJ registry",
    };
  }
  return {
    motionId,
    status: "exact registered M_MOBJ motion",
    bank: resolved.bank,
    sequenceIndex: resolved.index,
    sequenceName: sequence.name,
    durationFrames: sequence.durationFrames,
    controllerFamilyIndex: sequence.controllerFamilyIndex,
  };
}

const actors = [...observationsByActor.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([actorCode, variants]) => {
    const candidateVariants = [...variants.values()].map((variant) => ({
      ...variant,
      candidates: variant.candidateMotionIds.map(resolveCandidate),
    }));
    const exactCandidateMotionIds = candidateVariants.length === 1
      ? candidateVariants[0].candidateMotionIds
      : null;
    const exactDefaultMotionStateId = candidateVariants.length === 1
      ? candidateVariants[0].defaultMotionStateId
      : null;
    const distinctNonzeroCandidateMotionIds = exactCandidateMotionIds
      ? [...new Set(exactCandidateMotionIds.filter(Boolean))]
      : [];
    return {
      actorCode,
      status: candidateVariants.length === 1
        ? "byte-stable exact native default-idle table"
        : "definition table varies across captures",
      observationCount: candidateVariants.reduce(
        (sum, variant) => sum + variant.observationCount,
        0,
      ),
      distinctCandidateTableCount: candidateVariants.length,
      exactDefaultMotionStateId,
      exactDefaultMotion: exactDefaultMotionStateId === null
        ? null
        : resolveCandidate(exactDefaultMotionStateId),
      exactCandidateMotionIds,
      unanimousNonzeroMotionId: (
        exactCandidateMotionIds
        && exactCandidateMotionIds.every(
          (motionId) => motionId === exactCandidateMotionIds[0],
        )
        && exactCandidateMotionIds[0] !== 0
      ) ? exactCandidateMotionIds[0] : null,
      distinctNonzeroCandidateMotionIds,
      candidateVariants,
    };
  });

const exactActors = actors.filter(
  (actor) => actor.distinctCandidateTableCount === 1,
);
const allCandidates = actors.flatMap(
  (actor) => actor.candidateVariants.flatMap(
    (variant) => variant.candidates,
  ),
);
const report = {
  schema: "new-yokosuka-scheduled-actor-default-idle-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), executablePath),
    path.relative(process.cwd(), motionBankPath),
  ],
  evidenceBoundary: (
    "Operation-1 handler 0x0c11f948 reads the active actor-definition "
    + "pointer from scheduled actor +0x00, advances to definition +0x7c, "
    + "and selects one of the four halfwords at +0x7e/+0x80/+0x82/+0x84 "
    + "using the shared native PRNG modulo four. Captures are enumerated "
    + "through the native resident scheduled-actor array globals rather "
    + "than searched by guessed addresses. Every observed four-character "
    + "actor code has one byte-stable candidate table across all captures "
    + "in which it is resident. Exact table membership is therefore "
    + "recovered; later choice order remains process-wide PRNG state. "
    + "Separately, operation-0x09 lifecycle reset 0x0c11ee08 copies the "
    + "leading halfword at definition +0x7c directly into actor current "
    + "motion +0x06. That leading default is not part of the four-candidate "
    + "random route-completion domain."
  ),
  nativeEvidence: {
    operationOneHandlerAddress: OPERATION_ONE_HANDLER_ADDRESS,
    operationOneSelectionAddress: hex(OPERATION_ONE_SELECTION_ADDRESS),
    actorDefinitionPointerOffset: hex(
      SCHEDULED_ACTOR_DEFINITION_POINTER_OFFSET,
      2,
    ),
    actorDefinitionCodeOffset: hex(
      SCHEDULED_ACTOR_DEFINITION_CODE_OFFSET,
      2,
    ),
    actorDefinitionDefaultIdleTableOffset: hex(
      SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_TABLE_OFFSET,
      2,
    ),
    actorDefinitionDefaultMotionOffset: hex(
      SCHEDULED_ACTOR_DEFINITION_DEFAULT_MOTION_OFFSET,
      2,
    ),
    operation09LifecycleResetAddress: hex(
      OPERATION_09_LIFECYCLE_RESET_ADDRESS,
    ),
    operation09DefaultMotionRule:
      "non-one lifecycle state installs definition[+0x7c] at actor +0x06",
    candidateWordOffsets:
      SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_OFFSETS.map(
        (offset) => hex(offset, 2),
      ),
    selectionRule: "candidate[processWideRandom15 % 4]",
    residentActorLookupAddress: SCHEDULED_ACTOR_LOOKUP_ADDRESS,
    actorRecordArrayPointerAddress:
      SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS,
    actorRecordCountAddress: SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS,
    actorRecordStride: SCHEDULED_ACTOR_RECORD_STRIDE,
    randomFunctionAddress: hex(RANDOM_FUNCTION_ADDRESS),
    signedRemainderFunctionAddress: hex(
      SIGNED_REMAINDER_FUNCTION_ADDRESS,
    ),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    validRegistryCaptureCount:
      uniqueCaptures.length - invalidRegistries.length,
    invalidRegistryCaptureCount: invalidRegistries.length,
    residentRecordObservationCount,
    actorCodeCount: actors.length,
    byteStableActorCodeCount: exactActors.length,
    varyingActorCodeCount: actors.length - exactActors.length,
    unanimousNonzeroActorCodeCount: actors.filter(
      (actor) => actor.unanimousNonzeroMotionId !== null,
    ).length,
    exactRegisteredDefaultMotionCount: actors.filter(
      (actor) => actor.exactDefaultMotion?.status
        === "exact registered M_MOBJ motion",
    ).length,
    zeroDefaultMotionCount: actors.filter(
      (actor) => actor.exactDefaultMotion?.status
        === "zero/unassigned native motion state",
    ).length,
    unresolvedNonzeroDefaultMotionCount: actors.filter(
      (actor) => (
        actor.exactDefaultMotionStateId !== 0
        && actor.exactDefaultMotion?.status
          !== "exact registered M_MOBJ motion"
      ),
    ).length,
    exactRegisteredCandidateCount: allCandidates.filter(
      (candidate) => (
        candidate.status === "exact registered M_MOBJ motion"
      ),
    ).length,
    zeroCandidateCount: allCandidates.filter(
      (candidate) => candidate.motionId === 0,
    ).length,
    unresolvedNonzeroCandidateCount: allCandidates.filter(
      (candidate) => (
        candidate.motionId !== 0
        && candidate.status !== "exact registered M_MOBJ motion"
      ),
    ).length,
  },
  invalidRegistries,
  actors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(process.cwd(), outputPath)}: `
  + `${actors.length} byte-stable actor default-idle tables from `
  + `${residentRecordObservationCount} resident observations.`,
);
