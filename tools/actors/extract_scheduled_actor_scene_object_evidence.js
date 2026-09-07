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
    || "tools/evidence/scheduled-actor-scene-object-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const HANDLER_POINTER_LITERAL_ADDRESS = 0x0c1197a0;
const ACTOR_OBJECT_CODE_OFFSET_LITERAL_ADDRESS = 0x0c0f9fda;
const SCENE_OBJECT_STATE_HANDLER_ADDRESS = 0x0c0f9c90;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_DESCRIPTOR_POINTER_OFFSET = 0x64;
const ACTOR_OBJECT_CODE_OFFSET = 0xc8;
const ACTOR_CONTROL_OFFSET = 0xd4;
const OPERATION_BYTE_LENGTH = 36;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(address) {
  return address - EXECUTABLE_LOAD_ADDRESS;
}

function readExecutableUInt32(address) {
  return executable.readUInt32LE(executableOffset(address));
}

function readExecutableUInt16(address) {
  return executable.readUInt16LE(executableOffset(address));
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

function operationOffsetFromProgramHeader(sourceVariant, operation) {
  const offsets = new Set(sourceVariant.sourceFiles.map(
    (file) => (
      Number.parseInt(operation.fileOffset, 16)
      - Number.parseInt(file.programFileOffset, 16)
    ),
  ));
  return offsets.size === 1 ? [...offsets][0] : null;
}

const handlerAddress = readExecutableUInt32(
  HANDLER_POINTER_LITERAL_ADDRESS,
);
const actorObjectCodeOffset = readExecutableUInt16(
  ACTOR_OBJECT_CODE_OFFSET_LITERAL_ADDRESS,
);
if (actorObjectCodeOffset !== ACTOR_OBJECT_CODE_OFFSET) {
  throw new Error("Executable operation-0x2a actor offset is not reviewed");
}
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
        if (operation.operation !== 0x2a) continue;
        sourceOperations.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          operationOffsetFromProgramHeader:
            operationOffsetFromProgramHeader(variant, operation),
          scheduleTableFileOffset: table.fileOffset,
          journeyStartSecond: entry.startSecond,
          operationFileOffset: operation.fileOffset,
          byteLength: operation.byteLength,
          sceneObjectCode: operation.sceneObjectCode,
          sceneObjectControlValue: operation.sceneObjectControlValue,
          sceneObjectTransitionMode: operation.sceneObjectTransitionMode,
          interactionRuntimePosition:
            operation.interactionRuntimePosition,
          interactionFacingFixed: operation.interactionFacingFixed,
          interactionFacingControlWord:
            operation.interactionFacingControlWord,
          interactionControlFloats: operation.interactionControlFloats,
          rawOperands: operation.rawOperands,
        });
      }
    }
  }
}
const sourceProgramHashes = new Set(sourceOperations.map(
  (operation) => operation.sourceProgramByteSha256,
));
const uniqueCaptures = [...new Map(inventory.captures.map(
  (capture) => [capture.sha256, capture],
)).values()];
const observations = [];
const activeObservations = [];
const actorResolutionErrors = [];
let relevantCaptureCount = 0;

for (const capture of uniqueCaptures) {
  const programs = capture.scheduledPrograms.filter(
    (program) => sourceProgramHashes.has(
      program.sourceNormalizedByteSha256,
    ),
  );
  if (programs.length === 0) continue;
  relevantCaptureCount++;
  const data = fs.readFileSync(capture.path);
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
    const currentOperation = data.readUInt16LE(
      actorOffset + ACTOR_CURRENT_OPERATION_OFFSET,
    );
    const nextDescriptorPointer = data.readUInt32LE(
      actorOffset + ACTOR_DESCRIPTOR_POINTER_OFFSET,
    );
    const sceneObjectCode = data.subarray(
      actorOffset + ACTOR_OBJECT_CODE_OFFSET,
      actorOffset + ACTOR_OBJECT_CODE_OFFSET + 4,
    ).toString("ascii");
    const sceneObjectControlValue = data.readUInt32LE(
      actorOffset + ACTOR_CONTROL_OFFSET,
    );
    const observation = {
      capturePath: capture.path,
      captureSha256: capture.sha256,
      likelyDisc: capture.likelyDisc,
      likelyArea: capture.likelyArea,
      schedulerClockSecond: clockSecond,
      actorCode: program.actorCode,
      sourceProgramByteSha256:
        program.sourceNormalizedByteSha256,
      programHeader: program.programHeader,
      actorRecordAddress: hex(0x8c000000 + actorOffset),
      currentOperation,
      nextDescriptorPointer: hex(nextDescriptorPointer),
      sceneObjectCode,
      sceneObjectControlValue,
      sceneObjectTransitionMode: sceneObjectControlValue + 4,
    };
    observations.push(observation);
    if (currentOperation !== 0x2a) continue;

    const nextDescriptorOffset = physicalOffset(
      nextDescriptorPointer,
      data.length,
    );
    const operationPhysicalOffset = nextDescriptorOffset === null
      ? null
      : nextDescriptorOffset - OPERATION_BYTE_LENGTH;
    const sourceMatches = sourceOperations.filter((operation) => (
      operation.sourceProgramByteSha256
        === program.sourceNormalizedByteSha256
      && operation.operationOffsetFromProgramHeader !== null
      && (
        (
          programHeader
          + operation.operationOffsetFromProgramHeader
        ) & 0x00ffffff
      ) === operationPhysicalOffset
      && operation.sceneObjectCode === sceneObjectCode
      && operation.sceneObjectControlValue === sceneObjectControlValue
    ));
    const exactMatch = sourceMatches.length === 1
      ? sourceMatches[0]
      : null;
    activeObservations.push({
      ...observation,
      operationAddress: operationPhysicalOffset === null
        ? null
        : hex(0x8c000000 + operationPhysicalOffset),
      sourceMatchCount: sourceMatches.length,
      status: exactMatch
        ? "exact active source operation-0x2a scene-object transition"
        : sourceMatches.length === 0
          ? "active operation has no exact source match"
          : "active operation matches multiple source records",
      exactSourceOperation: exactMatch && {
        sourceVariantId: exactMatch.sourceVariantId,
        operationFileOffset: exactMatch.operationFileOffset,
        journeyStartSecond: exactMatch.journeyStartSecond,
        sceneObjectCode: exactMatch.sceneObjectCode,
        sceneObjectControlValue:
          exactMatch.sceneObjectControlValue,
        sceneObjectTransitionMode:
          exactMatch.sceneObjectTransitionMode,
      },
    });
  }
}

const exactActiveObservations = activeObservations.filter(
  (observation) => observation.sourceMatchCount === 1,
);
const report = {
  schema: "new-yokosuka-scheduled-actor-scene-object-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "The scheduler dispatcher calls operation-0x2a handler 0x0c0f9efa. "
    + "It stores the four-byte scene-object code at actor +0xc8 and the "
    + "control at +0xd4, then calls 0x0c0f9c90 with object code, "
    + "control + 4, and the scheduler clock. Modes 4 and 5 select the "
    + "target object's two native position/state slots. The remaining "
    + "position/facing/two-float interaction payload is retained exactly "
    + "without assigning an unproved higher-level interaction name. Runtime "
    + "actors are discovered through relocated PRG1 owner pointers; active "
    + "records join source operations through the native next-descriptor "
    + "pointer, never through capture-specific actor addresses."
  ),
  nativeEvidence: {
    dispatcherAddress: "0x0c119444",
    handlerPointerLiteralAddress: hex(
      HANDLER_POINTER_LITERAL_ADDRESS,
    ),
    handlerAddress: hex(handlerAddress),
    sceneObjectStateHandlerAddress: hex(
      SCENE_OBJECT_STATE_HANDLER_ADDRESS,
    ),
    actorObjectCodeOffsetLiteralAddress: hex(
      ACTOR_OBJECT_CODE_OFFSET_LITERAL_ADDRESS,
    ),
    actorObjectCodeOffset: hex(actorObjectCodeOffset, 2),
    actorControlOffset: hex(
      actorObjectCodeOffset + 0x0c,
      2,
    ),
    actorNextDescriptorPointerOffset: hex(
      ACTOR_DESCRIPTOR_POINTER_OFFSET,
      2,
    ),
    transitionModeRule: "sceneObjectControlValue + 4",
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    relevantCaptureCount,
    sourceOperationCount: sourceOperations.length,
    sourceActorCodeCount: new Set(sourceOperations.map(
      (operation) => operation.actorCode,
    )).size,
    distinctSceneObjectCodeCount: new Set(sourceOperations.map(
      (operation) => operation.sceneObjectCode,
    )).size,
    sourceControlZeroCount: sourceOperations.filter(
      (operation) => operation.sceneObjectControlValue === 0,
    ).length,
    sourceControlOneCount: sourceOperations.filter(
      (operation) => operation.sceneObjectControlValue === 1,
    ).length,
    invalidSourceControlCount: sourceOperations.filter(
      (operation) => ![0, 1].includes(
        operation.sceneObjectControlValue,
      ),
    ).length,
    runtimeActorObservationCount: observations.length,
    activeRuntimeObservationCount: activeObservations.length,
    exactActiveSourceOperationObservationCount:
      exactActiveObservations.length,
    unmatchedActiveRuntimeObservationCount:
      activeObservations.length - exactActiveObservations.length,
    actorResolutionErrorCount: actorResolutionErrors.length,
  },
  sourceOperations,
  activeObservations,
  actorResolutionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${exactActiveObservations.length} exact active `
  + `operation-0x2a observations across ${observations.length} actors.`,
);
