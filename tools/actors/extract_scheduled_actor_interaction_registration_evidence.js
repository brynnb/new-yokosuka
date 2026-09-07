#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  OPERATION_17_ACTIVE_PREDICATE_ADDRESS,
  OPERATION_17_ACTOR_OPERATION_POINTER_OFFSET,
  OPERATION_17_ACTOR_REGISTRATION_POINTER_OFFSET,
  OPERATION_17_ACTOR_STATE_OFFSET,
  OPERATION_17_ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
  OPERATION_17_DESCRIPTOR_HANDLER_ADDRESS,
  OPERATION_17_INITIALIZER_ADDRESS,
  OPERATION_17_UPDATE_ADDRESS,
  OPERATION_17_WIDTH_HANDLER_ADDRESS,
} from "../lib/scheduler_descriptor_layout.js";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-interaction-registration-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_POSITION_OFFSET = 0x24;
const ACTOR_FACING_OFFSET = 0x50;
const ACTOR_REGISTRATION_POINTER_OFFSET = Number.parseInt(
  OPERATION_17_ACTOR_REGISTRATION_POINTER_OFFSET,
  16,
);
const ACTOR_STATE_OFFSET = Number.parseInt(
  OPERATION_17_ACTOR_STATE_OFFSET,
  16,
);
const ACTOR_OPERATION_POINTER_OFFSET = Number.parseInt(
  OPERATION_17_ACTOR_OPERATION_POINTER_OFFSET,
  16,
);
const ACTOR_TARGET_REGISTRY_POINTER_OFFSET = Number.parseInt(
  OPERATION_17_ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
  16,
);
const ACTOR_ACTION_NODE_POINTER_OFFSET = 0xe4;
const TARGET_REGISTRY_CODE_OFFSET = 0;
const TARGET_REGISTRY_OBJECT_POINTER_OFFSET = 4;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(address) {
  return address - EXECUTABLE_LOAD_ADDRESS;
}

function readExecutableUInt16(address) {
  return executable.readUInt16LE(executableOffset(address));
}

function readExecutableUInt32(address) {
  return executable.readUInt32LE(executableOffset(address));
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

const executableWordChecks = new Map([
  [0x0c0f5a88, ACTOR_REGISTRATION_POINTER_OFFSET],
  [0x0c0f9620, ACTOR_TARGET_REGISTRY_POINTER_OFFSET],
  [0x0c0f9622, ACTOR_STATE_OFFSET],
  [0x0c0f96dc, ACTOR_TARGET_REGISTRY_POINTER_OFFSET],
  [0x0c0f96de, ACTOR_STATE_OFFSET],
  [0x0c0f96e2, 0xac],
  [0x0c0f98b0, ACTOR_STATE_OFFSET],
  [0x0c0f998e, ACTOR_OPERATION_POINTER_OFFSET],
]);
for (const [address, expected] of executableWordChecks) {
  if (readExecutableUInt16(address) !== expected) {
    throw new Error(`Executable actor offset ${hex(address)} is not reviewed`);
  }
}

const executablePointerChecks = new Map([
  [0x0c0f5a98, Number.parseInt(OPERATION_17_WIDTH_HANDLER_ADDRESS, 16)],
  [0x0c0f5aa4, Number.parseInt(OPERATION_17_INITIALIZER_ADDRESS, 16)],
  [0x0c0f5bcc, Number.parseInt(OPERATION_17_UPDATE_ADDRESS, 16)],
  [0x0c0f5bd8, Number.parseInt(OPERATION_17_DESCRIPTOR_HANDLER_ADDRESS, 16)],
  [0x0c0f5be8, Number.parseInt(OPERATION_17_ACTIVE_PREDICATE_ADDRESS, 16)],
  [0x0c0f9624, 0x0c0f7bda],
  [0x0c0f9628, 0x0c0f8464],
  [0x0c0f962c, 0x0c0f5d5e],
  [0x0c0f96e4, 0x0c0f6f60],
  [0x0c0f96e8, 0x0c0f84b4],
  [0x0c0f96ec, 0x0c0f5ea2],
]);
for (const [address, expected] of executablePointerChecks) {
  if (readExecutableUInt32(address) !== expected) {
    throw new Error(`Executable handler literal ${hex(address)} is not reviewed`);
  }
}

const sourceOperations = [];
for (const variant of source.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x17) continue;
        const interactionModeSigned = operation.interactionMode > 0x7fffffff
          ? operation.interactionMode - 0x100000000
          : operation.interactionMode;
        const timeControlValue = operation.activationSecond;
        sourceOperations.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          operationOffsetFromProgramHeader:
            operationOffsetFromProgramHeader(variant, operation),
          scheduleTableFileOffset: table.fileOffset,
          journeyStartSecond: entry.startSecond,
          operationFileOffset: operation.fileOffset,
          targetCode: operation.targetCode,
          interactionMode: operation.interactionMode,
          interactionModeSigned,
          timeControlValue,
          targetTimeMode: timeControlValue <= 0
            ? "relative duration"
            : "absolute scheduler second",
          relativeDurationSeconds: timeControlValue <= 0
            ? -timeControlValue
            : null,
          absoluteTargetSecond: timeControlValue > 0
            ? timeControlValue
            : null,
          runtimePosition: operation.runtimePosition,
          browserPosition: operation.browserPosition,
          controlValues: operation.controlValues,
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
const activeObservations = [];
const actorResolutionErrors = [];
let relevantCaptureCount = 0;
let runtimeActorObservationCount = 0;

for (const capture of uniqueCaptures) {
  const programs = capture.scheduledPrograms.filter(
    (program) => sourceProgramHashes.has(
      program.sourceNormalizedByteSha256,
    ),
  );
  if (programs.length === 0) continue;
  relevantCaptureCount++;
  const data = fs.readFileSync(capture.path);

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
    runtimeActorObservationCount++;

    const actorOffset = actorOffsets[0];
    const currentOperation = data.readUInt16LE(
      actorOffset + ACTOR_CURRENT_OPERATION_OFFSET,
    );
    if (currentOperation !== 0x17) continue;

    const registrationPointer = data.readUInt32LE(
      actorOffset + ACTOR_REGISTRATION_POINTER_OFFSET,
    );
    const stateWord = data.readUInt32LE(actorOffset + ACTOR_STATE_OFFSET);
    const operationPointer = data.readUInt32LE(
      actorOffset + ACTOR_OPERATION_POINTER_OFFSET,
    );
    const targetRegistryPointer = data.readUInt32LE(
      actorOffset + ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
    );
    const actionNodePointer = data.readUInt32LE(
      actorOffset + ACTOR_ACTION_NODE_POINTER_OFFSET,
    );
    const operationPhysicalOffset = physicalOffset(
      operationPointer,
      data.length,
    );
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
    ));
    const exactMatch = sourceMatches.length === 1
      ? sourceMatches[0]
      : null;

    const targetRegistryOffset = physicalOffset(
      targetRegistryPointer,
      data.length,
    );
    const targetRegistryReadable = (
      targetRegistryOffset !== null
      && targetRegistryOffset + 8 <= data.length
    );
    const targetRegistryCode = targetRegistryReadable
      ? data.subarray(
        targetRegistryOffset + TARGET_REGISTRY_CODE_OFFSET,
        targetRegistryOffset + TARGET_REGISTRY_CODE_OFFSET + 4,
      ).toString("ascii")
      : null;
    const targetObjectPointer = targetRegistryReadable
      ? data.readUInt32LE(
        targetRegistryOffset + TARGET_REGISTRY_OBJECT_POINTER_OFFSET,
      )
      : 0;

    const actorRuntimePosition = [
      data.readFloatLE(actorOffset + ACTOR_POSITION_OFFSET),
      data.readFloatLE(actorOffset + ACTOR_POSITION_OFFSET + 4),
      data.readFloatLE(actorOffset + ACTOR_POSITION_OFFSET + 8),
    ];
    const sourcePositionDistance = exactMatch
      ? Math.hypot(
        actorRuntimePosition[0] - exactMatch.runtimePosition[0],
        actorRuntimePosition[1] - exactMatch.runtimePosition[1],
        actorRuntimePosition[2] - exactMatch.runtimePosition[2],
      )
      : null;

    activeObservations.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      likelyDisc: capture.likelyDisc,
      likelyArea: capture.likelyArea,
      actorCode: program.actorCode,
      sourceProgramByteSha256:
        program.sourceNormalizedByteSha256,
      programHeader: program.programHeader,
      actorRecordAddress: hex(0x8c000000 + actorOffset),
      currentOperation,
      registrationPointer: hex(registrationPointer),
      operationPointer: hex(operationPointer),
      registrationPointerMatchesOperation:
        registrationPointer === operationPointer,
      operationAddress: operationPhysicalOffset === null
        ? null
        : hex(0x8c000000 + operationPhysicalOffset),
      stateWord: hex(stateWord),
      registeredTargetSubtype: stateWord >>> 16,
      interactionState: stateWord & 0xffff,
      targetRegistryPointer: hex(targetRegistryPointer),
      targetRegistryCode,
      targetRegistryCodeMatchesSource:
        Boolean(exactMatch && targetRegistryCode === exactMatch.targetCode),
      targetObjectPointer: targetObjectPointer
        ? hex(targetObjectPointer)
        : null,
      actionNodePointer: actionNodePointer
        ? hex(actionNodePointer)
        : null,
      actorRuntimePosition,
      actorFacingFixed:
        data.readInt16LE(actorOffset + ACTOR_FACING_OFFSET),
      sourcePositionDistance,
      sourceMatchCount: sourceMatches.length,
      status: exactMatch
        ? "exact externally activated source operation-0x17 registration"
        : sourceMatches.length === 0
          ? "active operation has no exact source match"
          : "active operation matches multiple source records",
      exactSourceOperation: exactMatch && {
        sourceVariantId: exactMatch.sourceVariantId,
        operationFileOffset: exactMatch.operationFileOffset,
        journeyStartSecond: exactMatch.journeyStartSecond,
        targetCode: exactMatch.targetCode,
        interactionMode: exactMatch.interactionMode,
        interactionModeSigned: exactMatch.interactionModeSigned,
        timeControlValue: exactMatch.timeControlValue,
        targetTimeMode: exactMatch.targetTimeMode,
        relativeDurationSeconds: exactMatch.relativeDurationSeconds,
        absoluteTargetSecond: exactMatch.absoluteTargetSecond,
        runtimePosition: exactMatch.runtimePosition,
        controlValues: exactMatch.controlValues,
      },
    });
  }
}

const exactActiveObservations = activeObservations.filter(
  (observation) => observation.sourceMatchCount === 1,
);
const modeCounts = Object.fromEntries([...Map.groupBy(
  sourceOperations,
  (operation) => String(operation.interactionModeSigned),
).entries()].map(([mode, operations]) => [mode, operations.length]));
const subtypeCounts = Object.fromEntries([...Map.groupBy(
  exactActiveObservations,
  (observation) => String(observation.registeredTargetSubtype),
).entries()].map(([subtype, observations]) => [
  subtype,
  observations.length,
]));

const report = {
  schema: "new-yokosuka-scheduled-actor-interaction-registration-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "The extension dispatcher routes authored operation 0x17 declarations "
    + "to 0x0c0f96d0, which sets the continuation flag and returns the "
    + "56-byte record width without installing a timed owner-descriptor "
    + "gate. Extension registration stores the record pointer at actor "
    + "+0xa4. Linked-actor activation later calls 0x0c0f956a, stores target "
    + "subtype/state at +0xd4, the same source operation pointer at +0xd8, "
    + "and target registry pointer at +0xdc, then dispatches subtype 0, 1, "
    + "or 3 behavior. Existing captures join active runtime operation 0x17 "
    + "records back to their exact owner-authored registration through "
    + "+0xd8. Position/control operands remain numeric: active actor world "
    + "positions are measured but are not treated as proof that the source "
    + "vector is a static owner placement."
  ),
  nativeEvidence: {
    extensionDispatcherAddress: "0x0c0f5b28",
    widthHandlerAddress: OPERATION_17_WIDTH_HANDLER_ADDRESS,
    initializerAddress: OPERATION_17_INITIALIZER_ADDRESS,
    updateAddress: OPERATION_17_UPDATE_ADDRESS,
    descriptorHandlerAddress: OPERATION_17_DESCRIPTOR_HANDLER_ADDRESS,
    activePredicateAddress: OPERATION_17_ACTIVE_PREDICATE_ADDRESS,
    recordByteLength: 0x38,
    descriptorBehavior: "set continuation flag and advance synchronously",
    actorRegistrationPointerOffset:
      hex(ACTOR_REGISTRATION_POINTER_OFFSET, 2),
    actorStateOffset: hex(ACTOR_STATE_OFFSET, 2),
    actorOperationPointerOffset:
      hex(ACTOR_OPERATION_POINTER_OFFSET, 2),
    actorTargetRegistryPointerOffset:
      hex(ACTOR_TARGET_REGISTRY_POINTER_OFFSET, 2),
    subtypeInitializers: {
      "0": "0x0c0f7bda",
      "1": "0x0c0f8464",
      "3": "0x0c0f5d5e",
    },
    subtypeUpdates: {
      "0": "0x0c0f6f60",
      "1": "0x0c0f84b4",
      "3": "0x0c0f5ea2",
    },
    timeOperandBoundary: (
      "negative values are relative durations and positive values are "
      + "absolute scheduler seconds; the source corpus contains no zero"
    ),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    relevantCaptureCount,
    sourceOperationCount: sourceOperations.length,
    sourceActorCodeCount: new Set(sourceOperations.map(
      (operation) => operation.actorCode,
    )).size,
    sourceTargetCodeCount: new Set(sourceOperations.map(
      (operation) => operation.targetCode,
    )).size,
    sourceRelativeDurationOperationCount: sourceOperations.filter(
      (operation) => operation.targetTimeMode === "relative duration",
    ).length,
    sourceAbsoluteTargetOperationCount: sourceOperations.filter(
      (operation) => (
        operation.targetTimeMode === "absolute scheduler second"
      ),
    ).length,
    sourceZeroTimeOperationCount: sourceOperations.filter(
      (operation) => operation.timeControlValue === 0,
    ).length,
    sourceInteractionModeCounts: modeCounts,
    runtimeActorObservationCount,
    activeRuntimeObservationCount: activeObservations.length,
    exactActiveSourceOperationObservationCount:
      exactActiveObservations.length,
    unmatchedActiveRuntimeObservationCount:
      activeObservations.length - exactActiveObservations.length,
    exactRegistrationPointerObservationCount:
      exactActiveObservations.filter(
        (observation) => (
          observation.registrationPointerMatchesOperation
        ),
      ).length,
    exactTargetRegistryCodeObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.targetRegistryCodeMatchesSource,
      ).length,
    activeTargetSubtypeCounts: subtypeCounts,
    exactSourcePositionObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.sourcePositionDistance === 0,
      ).length,
    actorResolutionErrorCount: actorResolutionErrors.length,
  },
  sourceOperations,
  activeObservations,
  actorResolutionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${sourceOperations.length} registrations, `
  + `${exactActiveObservations.length} exact active observations.`,
);
