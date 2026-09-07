#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  OPERATION_18_ACTOR_OPERATION_POINTER_OFFSET,
  OPERATION_18_ACTOR_STATE_OFFSET,
  OPERATION_18_ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
  OPERATION_18_ACTOR_TARGET_SECOND_OFFSET,
  OPERATION_18_HANDLER_ADDRESS,
  OPERATION_18_INITIALIZER_ADDRESS,
  OPERATION_18_SUBTYPE_ONE_HANDLER_ADDRESS,
  OPERATION_18_SUBTYPE_THREE_HANDLER_ADDRESS,
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
    || "tools/evidence/scheduled-actor-linked-interaction-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const EXTENSION_HANDLER_POINTER_LITERAL_ADDRESS = 0x0c0f5bdc;
const SUBTYPE_ONE_HANDLER_POINTER_LITERAL_ADDRESS = 0x0c0f98c0;
const SUBTYPE_THREE_HANDLER_POINTER_LITERAL_ADDRESS = 0x0c0f98c4;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_STATE_OFFSET = Number.parseInt(
  OPERATION_18_ACTOR_STATE_OFFSET,
  16,
);
const ACTOR_OPERATION_POINTER_OFFSET = Number.parseInt(
  OPERATION_18_ACTOR_OPERATION_POINTER_OFFSET,
  16,
);
const ACTOR_TARGET_REGISTRY_POINTER_OFFSET = Number.parseInt(
  OPERATION_18_ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
  16,
);
const ACTOR_TARGET_SECOND_OFFSET = Number.parseInt(
  OPERATION_18_ACTOR_TARGET_SECOND_OFFSET,
  16,
);
const TARGET_REGISTRY_CODE_OFFSET = 0x00;
const TARGET_REGISTRY_OBJECT_POINTER_OFFSET = 0x04;
const TARGET_OBJECT_SUBTYPE_OFFSET = 0x00;
const TARGET_OBJECT_WINDOW_START_OFFSET = 0x20;
const TARGET_OBJECT_WINDOW_END_OFFSET = 0x24;

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

const executablePointerChecks = new Map([
  [
    EXTENSION_HANDLER_POINTER_LITERAL_ADDRESS,
    Number.parseInt(OPERATION_18_HANDLER_ADDRESS, 16),
  ],
  [
    SUBTYPE_ONE_HANDLER_POINTER_LITERAL_ADDRESS,
    Number.parseInt(OPERATION_18_SUBTYPE_ONE_HANDLER_ADDRESS, 16),
  ],
  [
    SUBTYPE_THREE_HANDLER_POINTER_LITERAL_ADDRESS,
    Number.parseInt(OPERATION_18_SUBTYPE_THREE_HANDLER_ADDRESS, 16),
  ],
]);
for (const [address, expected] of executablePointerChecks) {
  if (readExecutableUInt32(address) !== expected) {
    throw new Error(`Executable handler literal ${hex(address)} is not reviewed`);
  }
}
const executableOffsetChecks = new Map([
  [0x0c0f88ac, ACTOR_OPERATION_POINTER_OFFSET],
  [0x0c0f97d8, ACTOR_TARGET_REGISTRY_POINTER_OFFSET],
  [0x0c0f97da, ACTOR_STATE_OFFSET],
  [0x0c0f6530, ACTOR_OPERATION_POINTER_OFFSET],
  [0x0c0f6532, ACTOR_TARGET_SECOND_OFFSET],
  [0x0c0f6658, ACTOR_STATE_OFFSET],
]);
for (const [address, expected] of executableOffsetChecks) {
  if (readExecutableUInt16(address) !== expected) {
    throw new Error(`Executable actor offset ${hex(address)} is not reviewed`);
  }
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
        if (operation.operation !== 0x18) continue;
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
          timeControlValue: operation.timeControlValue,
          targetTimeMode: operation.targetTimeMode,
          relativeDurationSeconds: operation.relativeDurationSeconds,
          absoluteTargetSecond: operation.absoluteTargetSecond,
          interactionMotionStateIds:
            operation.interactionMotionStateIds,
          interactionControlValues:
            operation.interactionControlValues,
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
    const stateWord = data.readUInt32LE(
      actorOffset + ACTOR_STATE_OFFSET,
    );
    const registeredTargetSubtype = stateWord >>> 16;
    const interactionState = stateWord & 0xffff;
    const operationPointer = data.readUInt32LE(
      actorOffset + ACTOR_OPERATION_POINTER_OFFSET,
    );
    const targetRegistryPointer = data.readUInt32LE(
      actorOffset + ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
    );
    const targetSecond = data.readInt32LE(
      actorOffset + ACTOR_TARGET_SECOND_OFFSET,
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
      stateWord: hex(stateWord),
      registeredTargetSubtype,
      interactionState,
      operationPointer: hex(operationPointer),
      targetRegistryPointer: hex(targetRegistryPointer),
      targetSecond,
    };
    observations.push(observation);
    if (currentOperation !== 0x18) continue;

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
    const targetObjectOffset = physicalOffset(
      targetObjectPointer,
      data.length,
    );
    const targetObjectReadable = (
      targetObjectOffset !== null
      && targetObjectOffset + TARGET_OBJECT_WINDOW_END_OFFSET + 4
        <= data.length
    );
    const targetObjectSubtype = targetObjectReadable
      ? data.readUInt32LE(
        targetObjectOffset + TARGET_OBJECT_SUBTYPE_OFFSET,
      )
      : null;
    const targetWindowStartSecond = targetObjectReadable
      ? data.readUInt32LE(
        targetObjectOffset + TARGET_OBJECT_WINDOW_START_OFFSET,
      )
      : null;
    const targetWindowEndSecond = targetObjectReadable
      ? data.readUInt32LE(
        targetObjectOffset + TARGET_OBJECT_WINDOW_END_OFFSET,
      )
      : null;
    const targetRegistryCodeMatchesSource = (
      exactMatch
      && targetRegistryCode === exactMatch.targetCode
    );
    const targetWindowValid = (
      [1, 3].includes(targetObjectSubtype)
      && targetWindowStartSecond >= 0
      && targetWindowStartSecond < targetWindowEndSecond
      && targetWindowEndSecond < 86400
    );
    const targetBindingValid = Boolean(
      targetRegistryCodeMatchesSource
      && targetWindowValid
      && registeredTargetSubtype === targetObjectSubtype
    );
    const inferredInvocationSecond = (
      exactMatch?.targetTimeMode === "relative duration"
    ) ? targetSecond - exactMatch.relativeDurationSeconds : null;
    const targetTimeMatchesSourceRule = !exactMatch
      ? false
      : exactMatch.targetTimeMode === "absolute scheduler second"
        ? targetSecond === exactMatch.absoluteTargetSecond
        : clockSecond === null
          ? null
          : (
            inferredInvocationSecond >= 0
            && inferredInvocationSecond < 86400
            && inferredInvocationSecond <= clockSecond
          );

    activeObservations.push({
      ...observation,
      operationAddress: operationPhysicalOffset === null
        ? null
        : hex(0x8c000000 + operationPhysicalOffset),
      sourceMatchCount: sourceMatches.length,
      targetRegistryCode,
      targetRegistryCodeMatchesSource,
      targetObjectPointer: targetObjectReadable
        ? hex(targetObjectPointer)
        : null,
      targetObjectSubtype,
      targetWindowStartSecond,
      targetWindowEndSecond,
      targetBindingValid,
      targetTimeMatchesSourceRule,
      inferredInvocationSecond,
      status: exactMatch
        ? targetBindingValid
          ? "exact active source operation-0x18 linked-actor interaction"
          : "exact source operation with transient invalid target binding"
        : sourceMatches.length === 0
          ? "active operation has no exact source match"
          : "active operation matches multiple source records",
      exactSourceOperation: exactMatch && {
        sourceVariantId: exactMatch.sourceVariantId,
        operationFileOffset: exactMatch.operationFileOffset,
        journeyStartSecond: exactMatch.journeyStartSecond,
        targetCode: exactMatch.targetCode,
        timeControlValue: exactMatch.timeControlValue,
        targetTimeMode: exactMatch.targetTimeMode,
        relativeDurationSeconds: exactMatch.relativeDurationSeconds,
        absoluteTargetSecond: exactMatch.absoluteTargetSecond,
        interactionMotionStateIds:
          exactMatch.interactionMotionStateIds,
        interactionControlValues:
          exactMatch.interactionControlValues,
      },
    });
  }
}

const exactActiveObservations = activeObservations.filter(
  (observation) => observation.sourceMatchCount === 1,
);
const validTargetBindingObservations = exactActiveObservations.filter(
  (observation) => observation.targetBindingValid,
);
const targetBindings = [...Map.groupBy(
  validTargetBindingObservations,
  (observation) => observation.exactSourceOperation.targetCode,
).entries()].map(([targetCode, targetObservations]) => {
  const signatures = new Set(targetObservations.map(
    (observation) => JSON.stringify([
      observation.targetObjectSubtype,
      observation.targetWindowStartSecond,
      observation.targetWindowEndSecond,
    ]),
  ));
  if (signatures.size !== 1) {
    throw new Error(`${targetCode} has multiple valid target signatures`);
  }
  const [
    targetSubtype,
    activeWindowStartSecond,
    activeWindowEndSecond,
  ] = JSON.parse([...signatures][0]);
  return {
    targetCode,
    targetSubtype,
    activeWindowStartSecond,
    activeWindowEndSecond,
    observationCount: targetObservations.length,
    captureHashCount: new Set(targetObservations.map(
      (observation) => observation.captureSha256,
    )).size,
    sourceOperationCount: sourceOperations.filter(
      (operation) => operation.targetCode === targetCode,
    ).length,
  };
}).sort((left, right) => left.targetCode.localeCompare(right.targetCode));

const report = {
  schema: "new-yokosuka-scheduled-actor-linked-interaction-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "Extension dispatcher 0x0c0f5b28 routes operation 0x18 to "
    + "0x0c0f9812. It resolves the four-character target through registry "
    + "lookup 0x0c0f9458 and dispatches target subtype 1 to 0x0c0f8ec0 or "
    + "subtype 3 to 0x0c0f6b38. Common initializer 0x0c0f96f0 stores the "
    + "encoded target subtype/state at actor +0xd4, operation pointer at "
    + "+0xd8, target registry pointer at +0xdc, and target second at +0xe0. "
    + "Subtype 1 completes when the target is outside its half-open active "
    + "window and the target second has arrived. Subtype 3 completes when "
    + "outside its inclusive active window or after the target second. "
    + "Runtime actors are found through relocated PRG1 owner pointers and "
    + "join source operations through +0xd8; transient invalid registry "
    + "reads remain explicit and are excluded from target-window bindings."
  ),
  nativeEvidence: {
    extensionDispatcherAddress: "0x0c0f5b28",
    handlerPointerLiteralAddress: hex(
      EXTENSION_HANDLER_POINTER_LITERAL_ADDRESS,
    ),
    handlerAddress: OPERATION_18_HANDLER_ADDRESS,
    targetRegistryLookupAddress: "0x0c0f9458",
    initializerAddress: OPERATION_18_INITIALIZER_ADDRESS,
    subtypeOneHandlerPointerLiteralAddress: hex(
      SUBTYPE_ONE_HANDLER_POINTER_LITERAL_ADDRESS,
    ),
    subtypeOneHandlerAddress:
      OPERATION_18_SUBTYPE_ONE_HANDLER_ADDRESS,
    subtypeThreeHandlerPointerLiteralAddress: hex(
      SUBTYPE_THREE_HANDLER_POINTER_LITERAL_ADDRESS,
    ),
    subtypeThreeHandlerAddress:
      OPERATION_18_SUBTYPE_THREE_HANDLER_ADDRESS,
    actorStateOffset: hex(ACTOR_STATE_OFFSET, 2),
    actorOperationPointerOffset: hex(
      ACTOR_OPERATION_POINTER_OFFSET,
      2,
    ),
    actorTargetRegistryPointerOffset: hex(
      ACTOR_TARGET_REGISTRY_POINTER_OFFSET,
      2,
    ),
    actorTargetSecondOffset: hex(
      ACTOR_TARGET_SECOND_OFFSET,
      2,
    ),
    targetObjectActiveWindowStartOffset: hex(
      TARGET_OBJECT_WINDOW_START_OFFSET,
      2,
    ),
    targetObjectActiveWindowEndOffset: hex(
      TARGET_OBJECT_WINDOW_END_OFFSET,
      2,
    ),
    relativeTargetRule: "invocationClockSecond - timeControlValue",
    absoluteTargetRule: "timeControlValue",
    subtypeOneCompletionRule: (
      "outside [activeWindowStartSecond, activeWindowEndSecond) "
      + "and currentSecond >= targetSecond"
    ),
    subtypeThreeCompletionRule: (
      "outside [activeWindowStartSecond, activeWindowEndSecond] "
      + "or currentSecond > targetSecond"
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
    runtimeActorObservationCount: observations.length,
    activeRuntimeObservationCount: activeObservations.length,
    exactActiveSourceOperationObservationCount:
      exactActiveObservations.length,
    unmatchedActiveRuntimeObservationCount:
      activeObservations.length - exactActiveObservations.length,
    validTargetBindingObservationCount:
      validTargetBindingObservations.length,
    transientInvalidTargetBindingObservationCount:
      exactActiveObservations.length
      - validTargetBindingObservations.length,
    exactTargetTimeRuleObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.targetTimeMatchesSourceRule,
      ).length,
    unavailableClockTargetRuleObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.targetTimeMatchesSourceRule === null,
      ).length,
    subtypeOneTargetBindingObservationCount:
      validTargetBindingObservations.filter(
        (observation) => observation.targetObjectSubtype === 1,
      ).length,
    subtypeThreeTargetBindingObservationCount:
      validTargetBindingObservations.filter(
        (observation) => observation.targetObjectSubtype === 3,
      ).length,
    actorResolutionErrorCount: actorResolutionErrors.length,
  },
  targetBindings,
  sourceOperations,
  activeObservations,
  actorResolutionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${exactActiveObservations.length} exact active `
  + `operation-0x18 observations; ${targetBindings.length} target bindings.`,
);
