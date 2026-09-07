#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  OPERATION_22_ACTOR_CANDIDATE_COUNT_OFFSET,
  OPERATION_22_ACTOR_MOTION_STATE_OFFSET,
  OPERATION_22_ACTOR_OPERATION_POINTER_OFFSET,
  OPERATION_22_ACTOR_SELECTED_INDEX_OFFSET,
  OPERATION_22_ACTOR_TARGET_SECOND_OFFSET,
  OPERATION_22_HANDLER_ADDRESS,
  OPERATION_22_INITIALIZER_ADDRESS,
  OPERATION_22_RANDOM_CALL_LITERAL_ADDRESS,
  OPERATION_22_RANDOM_FUNCTION_ADDRESS,
  OPERATION_22_RANDOM_SEED_ADDRESS,
  OPERATION_22_SIGNED_REMAINDER_CALL_LITERAL_ADDRESS,
  OPERATION_22_UPDATE_ADDRESS,
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
    || "tools/evidence/scheduled-actor-variable-motion-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_MOTION_STATE_OFFSET = Number.parseInt(
  OPERATION_22_ACTOR_MOTION_STATE_OFFSET,
  16,
);
const ACTOR_OPERATION_POINTER_OFFSET = Number.parseInt(
  OPERATION_22_ACTOR_OPERATION_POINTER_OFFSET,
  16,
);
const ACTOR_TARGET_SECOND_OFFSET = Number.parseInt(
  OPERATION_22_ACTOR_TARGET_SECOND_OFFSET,
  16,
);
const ACTOR_SELECTED_INDEX_OFFSET = Number.parseInt(
  OPERATION_22_ACTOR_SELECTED_INDEX_OFFSET,
  16,
);
const ACTOR_CANDIDATE_COUNT_OFFSET = Number.parseInt(
  OPERATION_22_ACTOR_CANDIDATE_COUNT_OFFSET,
  16,
);
const OFFSET_LITERAL_ADDRESSES = new Map([
  [0x0c0f900c, ACTOR_TARGET_SECOND_OFFSET],
  [0x0c0f900e, ACTOR_CANDIDATE_COUNT_OFFSET],
  [0x0c0f9010, ACTOR_SELECTED_INDEX_OFFSET],
  [0x0c0f9012, ACTOR_OPERATION_POINTER_OFFSET],
  [0x0c0f911c, ACTOR_CANDIDATE_COUNT_OFFSET],
]);
const RANDOM_CALL_LITERAL_ADDRESS = Number.parseInt(
  OPERATION_22_RANDOM_CALL_LITERAL_ADDRESS,
  16,
);
const SIGNED_REMAINDER_CALL_LITERAL_ADDRESS = Number.parseInt(
  OPERATION_22_SIGNED_REMAINDER_CALL_LITERAL_ADDRESS,
  16,
);
const RANDOM_FUNCTION_ADDRESS = Number.parseInt(
  OPERATION_22_RANDOM_FUNCTION_ADDRESS,
  16,
);
const RANDOM_SEED_ADDRESS = Number.parseInt(
  OPERATION_22_RANDOM_SEED_ADDRESS,
  16,
);
const SIGNED_REMAINDER_FUNCTION_ADDRESS = 0x0c1dc440;
const RANDOM_MULTIPLIER = 0x41c64e6d;
const RANDOM_INCREMENT = 0x3039;
const RANDOM_OUTPUT_MASK = 0x7fff;
const RANDOM_FUNCTION_SIGNATURE = Buffer.from([
  0x1e, 0xd4, 0x1f, 0xd3, 0x42, 0x62, 0x12, 0x4f,
  0x37, 0x02, 0x34, 0x91, 0x1a, 0x03, 0x1c, 0x33,
  0x33, 0x60, 0x32, 0x24, 0x30, 0x93, 0x29, 0x40,
  0x39, 0x20, 0x0b, 0x00,
]);

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(address) {
  return address - EXECUTABLE_LOAD_ADDRESS;
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

for (const [address, expectedValue] of OFFSET_LITERAL_ADDRESSES) {
  const offset = executableOffset(address);
  if (
    offset < 0
    || offset + 2 > executable.length
    || executable.readUInt16LE(offset) !== expectedValue
  ) {
    throw new Error(`Executable offset literal ${hex(address)} is not reviewed`);
  }
}
if (
  executable.readUInt32LE(executableOffset(RANDOM_CALL_LITERAL_ADDRESS))
    !== RANDOM_FUNCTION_ADDRESS
  || executable.readUInt32LE(
    executableOffset(SIGNED_REMAINDER_CALL_LITERAL_ADDRESS),
  ) !== SIGNED_REMAINDER_FUNCTION_ADDRESS
) {
  throw new Error("Operation-0x22 selection call targets are not reviewed");
}
if (
  !executable.subarray(
    executableOffset(RANDOM_FUNCTION_ADDRESS),
    executableOffset(RANDOM_FUNCTION_ADDRESS)
      + RANDOM_FUNCTION_SIGNATURE.length,
  ).equals(RANDOM_FUNCTION_SIGNATURE)
  || executable.readUInt32LE(executableOffset(0x0c1ce26c))
    !== RANDOM_SEED_ADDRESS
  || executable.readUInt32LE(executableOffset(0x0c1ce270))
    !== RANDOM_MULTIPLIER
  || executable.readUInt16LE(executableOffset(0x0c1ce266))
    !== RANDOM_INCREMENT
  || executable.readUInt16LE(executableOffset(0x0c1ce268))
    !== RANDOM_OUTPUT_MASK
  || executable.readUInt32LE(executableOffset(RANDOM_SEED_ADDRESS)) !== 1
) {
  throw new Error("Native scheduler random generator is not reviewed");
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
        if (operation.operation !== 0x22) continue;
        sourceOperations.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          operationOffsetFromProgramHeader:
            operationOffsetFromProgramHeader(variant, operation),
          scheduleTableFileOffset: table.fileOffset,
          journeyStartSecond: entry.startSecond,
          operationFileOffset: operation.fileOffset,
          timeControlValue: operation.timeControlValue,
          targetTimeMode: operation.targetTimeMode,
          relativeDurationSeconds: operation.relativeDurationSeconds,
          absoluteTargetSecond: operation.absoluteTargetSecond,
          rawCandidatePointer: operation.rawCandidatePointer,
          resolvedCandidateFileOffset:
            operation.resolvedCandidateFileOffset,
          motionCandidateCount: operation.motionCandidateCount,
          motionCandidates: operation.motionCandidates,
          uniqueMotionStateIds: operation.uniqueMotionStateIds,
          deterministicMotionStateId:
            operation.deterministicMotionStateId,
          motionStateSelectionStatus:
            operation.motionStateSelectionStatus,
          motionCandidateTerminator:
            operation.motionCandidateTerminator,
          motionCandidateDecodeStatus:
            operation.motionCandidateDecodeStatus,
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
    const operationPointer = data.readUInt32LE(
      actorOffset + ACTOR_OPERATION_POINTER_OFFSET,
    );
    const targetSecond = data.readInt32LE(
      actorOffset + ACTOR_TARGET_SECOND_OFFSET,
    );
    const selectedCandidateIndex = data.readInt32LE(
      actorOffset + ACTOR_SELECTED_INDEX_OFFSET,
    );
    const motionCandidateCount = data.readUInt32LE(
      actorOffset + ACTOR_CANDIDATE_COUNT_OFFSET,
    );
    const selectedMotionStateId = data.readUInt16LE(
      actorOffset + ACTOR_MOTION_STATE_OFFSET,
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
      operationPointer: hex(operationPointer),
      targetSecond,
      selectedCandidateIndex,
      motionCandidateCount,
      selectedMotionStateId,
    };
    observations.push(observation);
    if (currentOperation !== 0x22) continue;

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
    const selectedCandidate = (
      exactMatch
      && selectedCandidateIndex >= 0
      && selectedCandidateIndex < exactMatch.motionCandidateCount
    ) ? exactMatch.motionCandidates[selectedCandidateIndex] : null;
    const candidateCountMatchesSource = (
      exactMatch
      && motionCandidateCount === exactMatch.motionCandidateCount
    );
    const selectedIndexWithinSourceCandidates = (
      exactMatch
      && selectedCandidateIndex >= 0
      && selectedCandidateIndex < exactMatch.motionCandidateCount
    );
    const selectedMotionMatchesSourceCandidate = (
      selectedCandidate
      && selectedMotionStateId === selectedCandidate.motionStateId
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
      candidateCountMatchesSource,
      selectedIndexWithinSourceCandidates,
      selectedMotionMatchesSourceCandidate,
      targetTimeMatchesSourceRule,
      inferredInvocationSecond,
      captureBeforeTarget: clockSecond === null
        ? null
        : clockSecond < targetSecond,
      status: exactMatch
        ? (
          "exact active source operation-0x22 timed variable-motion gate"
        )
        : sourceMatches.length === 0
          ? "active operation has no exact source match"
          : "active operation matches multiple source records",
      exactSourceOperation: exactMatch && {
        sourceVariantId: exactMatch.sourceVariantId,
        operationFileOffset: exactMatch.operationFileOffset,
        journeyStartSecond: exactMatch.journeyStartSecond,
        timeControlValue: exactMatch.timeControlValue,
        targetTimeMode: exactMatch.targetTimeMode,
        relativeDurationSeconds: exactMatch.relativeDurationSeconds,
        absoluteTargetSecond: exactMatch.absoluteTargetSecond,
        motionCandidateCount: exactMatch.motionCandidateCount,
        selectedCandidate,
      },
    });
  }
}

const exactActiveObservations = activeObservations.filter(
  (observation) => observation.sourceMatchCount === 1,
);
const report = {
  schema: "new-yokosuka-scheduled-actor-variable-motion-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "The extension dispatcher routes operation 0x22 to 0x0c0f90f2. "
    + "Initializer 0x0c0f8f48 stores the operation pointer at actor +0xac, "
    + "converts a negative time operand to currentClock + abs(operand), "
    + "retains a nonnegative operand as an absolute target second at +0xcc, "
    + "counts 16-byte candidates until a 0xffffffff sentinel into +0xd4, "
    + "and initializes selected index +0xd0 to -1. Update 0x0c0f8f8c "
    + "selects candidates while the target remains in the future and writes "
    + "the selected low-16-bit numeric motion state at actor +0x06. Its first "
    + "selection is candidate zero. Later selections use the process-wide "
    + "linear-congruential generator at 0x0c1ce1f0 and the exact rule "
    + "`(currentIndex + 1 + random15 % "
    + "(current.selectionAdvanceControl + 1)) % candidateCount`. The native "
    + "random stream is shared by many engine consumers, so source data alone "
    + "does not prove the call-order-dependent sequence of later choices. Runtime "
    + "actors are discovered through relocated PRG1 owner pointers and join "
    + "source operations through actor +0xac; no capture-specific actor "
    + "address or unproved motion name is used."
  ),
  nativeEvidence: {
    extensionDispatcherAddress: "0x0c0f5b28",
    handlerAddress: OPERATION_22_HANDLER_ADDRESS,
    initializerAddress: OPERATION_22_INITIALIZER_ADDRESS,
    updateAddress: OPERATION_22_UPDATE_ADDRESS,
    actorCurrentOperationOffset: hex(
      ACTOR_CURRENT_OPERATION_OFFSET,
      2,
    ),
    actorMotionStateOffset: hex(ACTOR_MOTION_STATE_OFFSET, 2),
    actorOperationPointerOffset: hex(
      ACTOR_OPERATION_POINTER_OFFSET,
      2,
    ),
    actorTargetSecondOffset: hex(ACTOR_TARGET_SECOND_OFFSET, 2),
    actorSelectedIndexOffset: hex(
      ACTOR_SELECTED_INDEX_OFFSET,
      2,
    ),
    actorCandidateCountOffset: hex(
      ACTOR_CANDIDATE_COUNT_OFFSET,
      2,
    ),
    candidateStrideBytes: 16,
    candidateSentinel: "0xffffffff",
    relativeTargetRule: "invocationClockSecond - timeControlValue",
    absoluteTargetRule: "timeControlValue",
    initialSelectedCandidateIndex: 0,
    subsequentSelectionRule: (
      "(currentIndex + 1 + random15 % "
      + "(current.selectionAdvanceControl + 1)) % candidateCount"
    ),
    selectionAdvanceControlCandidateOffset: "0x0c",
    randomCallLiteralAddress: OPERATION_22_RANDOM_CALL_LITERAL_ADDRESS,
    signedRemainderCallLiteralAddress:
      OPERATION_22_SIGNED_REMAINDER_CALL_LITERAL_ADDRESS,
    signedRemainderFunctionAddress: hex(
      SIGNED_REMAINDER_FUNCTION_ADDRESS,
    ),
    randomFunctionAddress: OPERATION_22_RANDOM_FUNCTION_ADDRESS,
    randomSeedAddress: OPERATION_22_RANDOM_SEED_ADDRESS,
    randomInitialSeed: 1,
    randomRecurrence: (
      "seed = (seed * 0x41c64e6d + 0x00003039) modulo 2^32"
    ),
    randomOutputRule: "(seed >>> 16) & 0x7fff",
    randomSharedProcessWide: true,
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    relevantCaptureCount,
    sourceOperationCount: sourceOperations.length,
    sourceActorCodeCount: new Set(sourceOperations.map(
      (operation) => operation.actorCode,
    )).size,
    sourceRelativeDurationOperationCount: sourceOperations.filter(
      (operation) => operation.targetTimeMode === "relative duration",
    ).length,
    sourceAbsoluteTargetOperationCount: sourceOperations.filter(
      (operation) => (
        operation.targetTimeMode === "absolute scheduler second"
      ),
    ).length,
    distinctSourceCandidateArrayCount: new Set(sourceOperations.map(
      (operation) => (
        `${operation.sourceProgramByteSha256}:`
        + operation.resolvedCandidateFileOffset
      ),
    )).size,
    sourceMotionCandidateRecordCount: sourceOperations.reduce(
      (count, operation) => count + operation.motionCandidateCount,
      0,
    ),
    sourceUnanimousMotionStateOperationCount:
      sourceOperations.filter(
        (operation) => Number.isInteger(
          operation.deterministicMotionStateId,
        ),
      ).length,
    sourceRandomMotionStateOperationCount:
      sourceOperations.filter(
        (operation) => operation.deterministicMotionStateId === null,
      ).length,
    exactSourceCandidateArrayCount: sourceOperations.filter(
      (operation) => operation.motionCandidateDecodeStatus.startsWith(
        "exact ",
      ),
    ).length,
    runtimeActorObservationCount: observations.length,
    activeRuntimeObservationCount: activeObservations.length,
    exactActiveSourceOperationObservationCount:
      exactActiveObservations.length,
    unmatchedActiveRuntimeObservationCount:
      activeObservations.length - exactActiveObservations.length,
    exactCandidateCountObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.candidateCountMatchesSource,
      ).length,
    selectedIndexWithinSourceCandidatesObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.selectedIndexWithinSourceCandidates,
      ).length,
    exactSelectedMotionObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.selectedMotionMatchesSourceCandidate,
      ).length,
    exactTargetTimeRuleObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.targetTimeMatchesSourceRule,
      ).length,
    activeBeforeTargetObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.captureBeforeTarget,
      ).length,
    activeAtOrAfterTargetObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.captureBeforeTarget === false,
      ).length,
    unavailableClockTargetRuleObservationCount:
      exactActiveObservations.filter(
        (observation) => observation.targetTimeMatchesSourceRule === null,
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
  `Wrote ${outputPath}: ${exactActiveObservations.length} exact active `
  + `operation-0x22 observations across ${observations.length} actors.`,
);
