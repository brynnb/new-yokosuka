#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-model-override-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const MODEL_OVERRIDE_HANDLER_POINTER_LITERAL_ADDRESS = 0x0c1197a8;
const EMPTY_STRING_POINTER_LITERAL_ADDRESS = 0x0c11ada4;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_CHARACTER_INDEX_OFFSET = 0x08;
const ACTOR_MODEL_POINTER_OFFSET = 0x8c;
const ACTOR_MODEL_OVERRIDE_OFFSET = 0x18e;
const ACTOR_MODEL_OVERRIDE_LENGTH = 12;
const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(address) {
  return address - EXECUTABLE_LOAD_ADDRESS;
}

function readExecutablePointer(address) {
  const offset = executableOffset(address);
  if (offset < 0 || offset + 4 > executable.length) {
    throw new Error(`Executable literal ${hex(address)} is out of bounds`);
  }
  return executable.readUInt32LE(offset);
}

function physicalOffset(pointer, byteLength) {
  const offset = pointer & 0x00ffffff;
  return offset < byteLength ? offset : null;
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

function terminatedAscii(bytes) {
  const terminator = bytes.indexOf(0);
  return bytes.subarray(
    0,
    terminator < 0 ? bytes.length : terminator,
  ).toString("ascii");
}

const modelOverrideHandlerAddress = readExecutablePointer(
  MODEL_OVERRIDE_HANDLER_POINTER_LITERAL_ADDRESS,
);
const emptyStringAddress = readExecutablePointer(
  EMPTY_STRING_POINTER_LITERAL_ADDRESS,
);
const schedulerClockLiteral = executable.subarray(
  executableOffset(SCHEDULER_CLOCK_LITERAL_ADDRESS),
  executableOffset(SCHEDULER_CLOCK_LITERAL_ADDRESS)
    + SCHEDULER_CLOCK_LITERAL_LENGTH,
);
if (
  schedulerClockLiteral.length !== SCHEDULER_CLOCK_LITERAL_LENGTH
  || schedulerClockLiteral.readUInt32LE(0) !== 0x0c114856
) {
  throw new Error("Executable scheduler-clock signature is not reviewed");
}

function schedulerClock(data) {
  const matches = occurrences(data, schedulerClockLiteral);
  if (matches.length !== 1) return null;
  const cachePointer = data.readUInt32LE(
    matches[0] + SCHEDULER_CLOCK_CACHE_POINTER_OFFSET,
  );
  const cacheOffset = physicalOffset(cachePointer, data.length);
  if (cacheOffset === null || cacheOffset + 4 > data.length) return null;
  const second = data.readUInt32LE(cacheOffset);
  return second < 86400 ? second : null;
}

const sourceOperations = [];
for (const variant of source.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x2f) continue;
        sourceOperations.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          scheduleTableFileOffset: table.fileOffset,
          journeyStartSecond: entry.startSecond,
          operationFileOffset: operation.fileOffset,
          modelOverrideCode: operation.modelOverrideCode,
          modelOverrideControlValue:
            operation.modelOverrideControlValue,
          modelOverridePersistent: operation.modelOverridePersistent,
          modelOverrideEffect: operation.modelOverrideEffect,
          rawOperands: operation.rawOperands,
        });
      }
    }
  }
}
const actorCodes = new Set(sourceOperations.map(
  (operation) => operation.actorCode,
));
const persistentModelCodes = new Set(sourceOperations
  .filter((operation) => operation.modelOverridePersistent)
  .map((operation) => operation.modelOverrideCode));

const uniqueCaptures = [...new Map(inventory.captures.map(
  (capture) => [capture.sha256, capture],
)).values()];
const observations = [];
const actorResolutionErrors = [];
let relevantCaptureCount = 0;
let emptyStringByteObservationCount = 0;
let nonzeroEmptyStringByteObservationCount = 0;
for (const capture of uniqueCaptures) {
  const programs = capture.scheduledPrograms.filter(
    (program) => actorCodes.has(program.actorCode),
  );
  if (programs.length === 0) continue;
  relevantCaptureCount++;
  const data = fs.readFileSync(capture.path);
  const emptyStringOffset = physicalOffset(emptyStringAddress, data.length);
  if (emptyStringOffset !== null) {
    emptyStringByteObservationCount++;
    if (data[emptyStringOffset] !== 0) {
      nonzeroEmptyStringByteObservationCount++;
    }
  }
  const clockSecond = schedulerClock(data);
  for (const program of programs) {
    const programHeader = Number.parseInt(program.programHeader, 16);
    const ownerPointer = ((programHeader & 0x0fffffff) - 4) >>> 0;
    const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
      .filter(
        (offset) => offset + ACTOR_RECORD_MINIMUM_LENGTH <= data.length,
      );
    if (actorOffsets.length !== 1) {
      actorResolutionErrors.push({
        capturePath: capture.path,
        captureSha256: capture.sha256,
        actorCode: program.actorCode,
        programHeader: program.programHeader,
        ownerPointer: hex(ownerPointer),
        candidateActorRecordCount: actorOffsets.length,
      });
      continue;
    }
    const actorOffset = actorOffsets[0];
    const overrideBytes = data.subarray(
      actorOffset + ACTOR_MODEL_OVERRIDE_OFFSET,
      actorOffset + ACTOR_MODEL_OVERRIDE_OFFSET
        + ACTOR_MODEL_OVERRIDE_LENGTH,
    );
    const modelOverrideCode = terminatedAscii(overrideBytes);
    const modelPointer = data.readUInt32LE(
      actorOffset + ACTOR_MODEL_POINTER_OFFSET,
    );
    observations.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      likelyDisc: capture.likelyDisc,
      likelyArea: capture.likelyArea,
      schedulerClockSecond: clockSecond,
      actorCode: program.actorCode,
      programHeader: program.programHeader,
      actorRecordAddress: hex(0x8c000000 + actorOffset),
      actorCurrentOperation: data.readUInt16LE(
        actorOffset + ACTOR_CURRENT_OPERATION_OFFSET,
      ),
      actorCharacterIndex: data.readUInt32LE(
        actorOffset + ACTOR_CHARACTER_INDEX_OFFSET,
      ),
      actorModelPointer: hex(modelPointer),
      modelOverrideCode,
      modelOverrideRawBytes: overrideBytes.toString("hex"),
      modelOverridePresent: modelOverrideCode.length > 0,
      sourcePersistentModelCodeMatch: (
        modelOverrideCode.length > 0
        && persistentModelCodes.has(modelOverrideCode)
      ),
      status: modelOverrideCode.length === 0
        ? "actor model override buffer is empty"
        : persistentModelCodes.has(modelOverrideCode)
          ? "source-authored persistent model override"
          : "nonempty model override has no source-authored persistent code",
    });
  }
}

const nonemptyObservations = observations.filter(
  (observation) => observation.modelOverridePresent,
);
const report = {
  schema: "new-yokosuka-scheduled-actor-model-override-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "Operation 0x2f handler 0x0c11acd8 accepts a NUL-terminated model name "
    + "shorter than 12 bytes, copies it to actor +0x18e, and refreshes a "
    + "resident model through actor +0x8c. A zero final operand then copies "
    + "the executable-derived empty byte over the first character; a nonzero "
    + "operand retains the override. Runtime actor records are found only "
    + "through relocated PRG1 owner pointers. A live override can validate "
    + "the handler result but is not claimed as one exact source operation "
    + "when the resident program bytes differ from the source corpus."
  ),
  nativeEvidence: {
    dispatcherAddress: "0x0c119444",
    handlerPointerLiteralAddress:
      hex(MODEL_OVERRIDE_HANDLER_POINTER_LITERAL_ADDRESS),
    handlerAddress: hex(modelOverrideHandlerAddress),
    stringLengthAddress: "0x0c1dca1c",
    stringCopyAddress: "0x0c1dc6c0",
    actorModelPointerOffset: hex(ACTOR_MODEL_POINTER_OFFSET, 2),
    actorModelOverrideOffset: hex(ACTOR_MODEL_OVERRIDE_OFFSET, 3),
    modelOverrideBufferLength: ACTOR_MODEL_OVERRIDE_LENGTH,
    emptyStringPointerLiteralAddress:
      hex(EMPTY_STRING_POINTER_LITERAL_ADDRESS),
    emptyStringAddress: hex(emptyStringAddress),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    relevantCaptureCount,
    sourceOperationCount: sourceOperations.length,
    sourcePersistentOverrideOperationCount: sourceOperations.filter(
      (operation) => operation.modelOverridePersistent,
    ).length,
    sourceClearedOverrideOperationCount: sourceOperations.filter(
      (operation) => !operation.modelOverridePersistent,
    ).length,
    sourceActorCodeCount: actorCodes.size,
    distinctSourceModelOverrideCodeCount: new Set(
      sourceOperations.map((operation) => operation.modelOverrideCode),
    ).size,
    runtimeActorObservationCount: observations.length,
    emptyRuntimeOverrideObservationCount:
      observations.length - nonemptyObservations.length,
    nonemptyRuntimeOverrideObservationCount: nonemptyObservations.length,
    sourcePersistentModelCodeRuntimeObservationCount:
      nonemptyObservations.filter(
        (observation) => observation.sourcePersistentModelCodeMatch,
      ).length,
    unmatchedNonemptyRuntimeOverrideObservationCount:
      nonemptyObservations.filter(
        (observation) => !observation.sourcePersistentModelCodeMatch,
      ).length,
    actorResolutionErrorCount: actorResolutionErrors.length,
    emptyStringByteObservationCount,
    nonzeroEmptyStringByteObservationCount,
  },
  sourceOperations,
  observations,
  actorResolutionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${nonemptyObservations.length} live model override `
  + `across ${observations.length} actor observations.`,
);
