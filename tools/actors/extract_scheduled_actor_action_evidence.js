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
    || "tools/evidence/scheduled-actor-action-evidence.json",
);

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const sourceManifest = JSON.parse(
  fs.readFileSync(sourceManifestPath, "utf8"),
);

const ACTOR_RECORD_MINIMUM_LENGTH = 0x1dc;
const ACTOR_CURRENT_OPERATION_OFFSET = 0x04;
const ACTOR_CONTROLLER_POINTER_OFFSET = 0x6c;
const ACTOR_ACTION_OPERATION_POINTER_OFFSET = 0xec;
const ACTOR_ACTION_ID_OFFSET = 0xf0;
const ACTOR_ACTION_REQUEST_FLAG_OFFSET = 0x18d;
const CONTROLLER_STATE_OFFSET = 0x68;
const CONTROLLER_ACTION_ID_OFFSET = 0xaa;
const CONTROLLER_MODE_OFFSET = 0xac;

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function hexAddress(offset) {
  return hex(0x8c000000 + offset);
}

function physicalOffset(pointer, byteLength) {
  if (pointer === 0) return null;
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

const sourceVariantsByHash = new Map(
  sourceManifest.sourceVariants.map(
    (variant) => [variant.sourceProgramByteSha256, variant],
  ),
);
const sourceActionOperations = new Map();
for (const variant of sourceManifest.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x30) continue;
        const operationOffset = operationOffsetFromProgramHeader(
          variant,
          operation,
        );
        const key = [
          variant.sourceProgramByteSha256,
          operation.fileOffset,
        ].join(":");
        const timing = `${entry.startSecond}:${table.fileOffset}`;
        const existing = sourceActionOperations.get(key);
        if (existing) {
          existing.scheduleReferences.add(timing);
          continue;
        }
        sourceActionOperations.set(key, {
          key,
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256:
            variant.sourceProgramByteSha256,
          operationFileOffset: operation.fileOffset,
          operationOffsetFromProgramHeader: operationOffset,
          journeyStartSecond: entry.startSecond,
          actionControllerId: operation.actionControllerId,
          actionControllerIdHex: hex(operation.actionControllerId),
          actionControlValues: operation.actionControlValues,
          actionControllerMode: operation.actionControllerMode,
          actionControllerEffect: operation.actionControllerEffect,
          scheduleReferences: new Set([timing]),
        });
      }
    }
  }
}

const actionProgramHashes = new Set(
  [...sourceActionOperations.values()].map(
    (operation) => operation.sourceProgramByteSha256,
  ),
);
const uniqueCaptures = [...new Map(
  inventory.captures.map((capture) => [capture.sha256, capture]),
).values()];
const observations = [];
const actorResolutionErrors = [];
let relevantCaptureCount = 0;
let runtimeActorObservationCount = 0;
let clearedActionRequestObservationCount = 0;

for (const capture of uniqueCaptures) {
  const relevantPrograms = capture.scheduledPrograms.filter(
    (program) => actionProgramHashes.has(
      program.sourceNormalizedByteSha256,
    ),
  );
  if (relevantPrograms.length === 0) continue;
  relevantCaptureCount++;
  const data = fs.readFileSync(capture.path);

  for (const program of relevantPrograms) {
    const sourceVariant = sourceVariantsByHash.get(
      program.sourceNormalizedByteSha256,
    );
    const programHeader = Number.parseInt(program.programHeader, 16);
    // Native actor records point four bytes before their PRG1 owner header.
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
        sourceProgramByteSha256:
          program.sourceNormalizedByteSha256,
        programHeader: program.programHeader,
        ownerPointer: hex(ownerPointer),
        status: actorOffsets.length === 0
          ? "runtime-actor-record-not-resident"
          : "runtime-actor-record-not-unique",
        candidateActorRecordAddresses: actorOffsets.map(hexAddress),
      });
      continue;
    }

    runtimeActorObservationCount++;
    const actorOffset = actorOffsets[0];
    const actionControllerId = data.readUInt32LE(
      actorOffset + ACTOR_ACTION_ID_OFFSET,
    );
    if (actionControllerId === 0) {
      clearedActionRequestObservationCount++;
      continue;
    }

    const actionOperationPointer = data.readUInt32LE(
      actorOffset + ACTOR_ACTION_OPERATION_POINTER_OFFSET,
    );
    const actionOperationPhysicalOffset = physicalOffset(
      actionOperationPointer,
      data.length,
    );
    const sourceMatches = [...sourceActionOperations.values()].filter(
      (operation) => (
        operation.sourceProgramByteSha256
          === program.sourceNormalizedByteSha256
        && operation.actionControllerId === actionControllerId
        && operation.operationOffsetFromProgramHeader !== null
        && (
          (
            programHeader
            + operation.operationOffsetFromProgramHeader
          ) & 0x00ffffff
        ) === actionOperationPhysicalOffset
      ),
    );
    const controllerPointer = data.readUInt32LE(
      actorOffset + ACTOR_CONTROLLER_POINTER_OFFSET,
    );
    const controllerOffset = physicalOffset(
      controllerPointer,
      data.length,
    );
    const controllerRecordAvailable = (
      controllerOffset !== null
      && controllerOffset + CONTROLLER_MODE_OFFSET + 2 <= data.length
    );
    const exactMatch = sourceMatches.length === 1
      ? sourceMatches[0]
      : null;
    observations.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      likelyDisc: capture.likelyDisc,
      likelyArea: capture.likelyArea,
      actorCode: program.actorCode,
      sourceProgramByteSha256:
        program.sourceNormalizedByteSha256,
      programHeader: program.programHeader,
      actorRecordAddress: hexAddress(actorOffset),
      currentDescriptorOperation: data.readUInt16LE(
        actorOffset + ACTOR_CURRENT_OPERATION_OFFSET,
      ),
      actionOperationPointer: hex(actionOperationPointer),
      actionControllerId,
      actionControllerIdHex: hex(actionControllerId),
      actionRequestFlag: data[
        actorOffset + ACTOR_ACTION_REQUEST_FLAG_OFFSET
      ],
      controllerPointer: hex(controllerPointer),
      controllerRecordAvailable,
      controllerState: !controllerRecordAvailable
        ? null
        : {
          stateWord: data.readUInt16LE(
            controllerOffset + CONTROLLER_STATE_OFFSET,
          ),
          actionId: data.readUInt16LE(
            controllerOffset + CONTROLLER_ACTION_ID_OFFSET,
          ),
          mode: data.readUInt16LE(
            controllerOffset + CONTROLLER_MODE_OFFSET,
          ),
        },
      requestDeliveryState: !controllerRecordAvailable
        ? "queued request without a resident controller record"
        : data.readUInt16LE(
          controllerOffset + CONTROLLER_STATE_OFFSET,
        ) === 0
          ? "queued request before controller state initialization"
          : "queued request while a numeric controller state is resident",
      status: exactMatch
        ? "exact-source-operation action-controller request"
        : sourceMatches.length === 0
          ? "action request has no exact source operation"
          : "action request matches multiple source operations",
      exactSourceOperation: exactMatch && {
        sourceVariantId: exactMatch.sourceVariantId,
        operationFileOffset: exactMatch.operationFileOffset,
        operationOffsetFromProgramHeader:
          exactMatch.operationOffsetFromProgramHeader,
        journeyStartSecond: exactMatch.journeyStartSecond,
        actionControlValues: exactMatch.actionControlValues,
        nativeControllerMode: exactMatch.actionControllerMode,
      },
      sourceMatchCount: sourceMatches.length,
      sourceVariantPresent: Boolean(sourceVariant),
    });
  }
}

const actionIdBindings = [...Map.groupBy(
  observations,
  (observation) => observation.actionControllerId,
).entries()].map(([actionControllerId, members]) => ({
  actionControllerId,
  actionControllerIdHex: hex(actionControllerId),
  actorCodes: [...new Set(
    members.map((member) => member.actorCode),
  )].sort(),
  likelyAreas: [...new Set(
    members.map((member) => member.likelyArea).filter(Boolean),
  )].sort(),
  observationCount: members.length,
  captureHashCount: new Set(
    members.map((member) => member.captureSha256),
  ).size,
  exactSourceOperationObservationCount: members.filter(
    (member) => member.sourceMatchCount === 1,
  ).length,
  residentControllerObservationCount: members.filter(
    (member) => member.controllerRecordAvailable,
  ).length,
  observedResidentControllerStates: [...new Set(members
    .filter((member) => member.controllerRecordAvailable)
    .map((member) => JSON.stringify(member.controllerState)))]
    .map((state) => JSON.parse(state)),
  observedControllerStates: [...new Set(members.map(
    (member) => JSON.stringify(member.controllerState),
  ))].map((state) => JSON.parse(state)),
})).sort(
  (left, right) => left.actionControllerId - right.actionControllerId,
);

const sourceOperations = [...sourceActionOperations.values()].map(
  (operation) => ({
    ...operation,
    scheduleReferences: [...operation.scheduleReferences].sort(),
  }),
).sort((left, right) => (
  left.actorCode.localeCompare(right.actorCode)
  || left.operationFileOffset.localeCompare(right.operationFileOffset)
));
const exactObservationCount = observations.filter(
  (observation) => observation.sourceMatchCount === 1,
).length;
const report = {
  schema: "new-yokosuka-scheduled-actor-action-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    ".disc-work/exact/1ST_READ.BIN",
  ],
  evidenceBoundary: (
    "Operation 0x30 handler 0x0c11f026 writes operand one to actor +0xf0 "
    + "and the exact operation pointer to actor +0xec, requests controller "
    + "mode 7 through 0x0c10d77c, and uses 0x0c11efd2 for zero-ID teardown. "
    + "The request initializer 0x0c10d7f6 passes the nonzero operand to "
    + "FUN_0c092f14, whose exclusive registered ranges select the original "
    + "M_FREE or M_MOBJ sequence. The action ID is therefore a registered "
    + "motion request, not an opaque action namespace. "
    + "The actor +0x18d flag marks these as queued requests; actor +0x6c "
    + "may legitimately be null, and null is never treated as RAM offset "
    + "zero. A resident controller snapshot remains contextual validation; "
    + "the static lookup path supplies the action-ID-to-motion mapping. "
    + "Runtime joins require the resident source-normalized PRG1 hash, its "
    + "unique owner actor record, the exact action ID, and an operation "
    + "pointer resolving to that exact source operation. Action IDs remain "
    + "numeric until independently mapped to authored motion assets."
  ),
  nativeEvidence: {
    dispatcherAddress: "0x0c119444",
    handlerPointerLiteralAddress: "0x0c119790",
    handlerAddress: "0x0c11f026",
    teardownAddress: "0x0c11efd2",
    controllerRequestAddress: "0x0c10d77c",
    controllerRequestInitializerAddress: "0x0c10d7f6",
    registeredMotionLookupAddress: "0x0c092f14",
    actorCurrentOperationOffset: hex(ACTOR_CURRENT_OPERATION_OFFSET, 2),
    actorControllerPointerOffset: hex(ACTOR_CONTROLLER_POINTER_OFFSET, 2),
    actorActionOperationPointerOffset:
      hex(ACTOR_ACTION_OPERATION_POINTER_OFFSET, 2),
    actorActionIdOffset: hex(ACTOR_ACTION_ID_OFFSET, 2),
    actorActionRequestFlagOffset:
      hex(ACTOR_ACTION_REQUEST_FLAG_OFFSET, 3),
    controllerActionIdOffset: hex(CONTROLLER_ACTION_ID_OFFSET, 2),
    controllerModeOffset: hex(CONTROLLER_MODE_OFFSET, 2),
    installedControllerMode: 7,
    requestDeliveryModel: (
      "queued mode-7 registered-motion command; the request initializer "
      + "resolves the action ID through the native motion-bank registry"
    ),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    relevantCaptureCount,
    sourceOperationCount: sourceOperations.length,
    sourceInstallOperationCount: sourceOperations.filter(
      (operation) => operation.actionControllerId !== 0,
    ).length,
    sourceTeardownOperationCount: sourceOperations.filter(
      (operation) => operation.actionControllerId === 0,
    ).length,
    distinctSourceActionIdCount: new Set(sourceOperations
      .map((operation) => operation.actionControllerId)
      .filter(Boolean)).size,
    sourceActorCodeCount: new Set(
      sourceOperations.map((operation) => operation.actorCode),
    ).size,
    runtimeActorObservationCount,
    clearedActionRequestObservationCount,
    nonzeroActionRequestObservationCount: observations.length,
    queuedActionRequestObservationCount: observations.filter(
      (observation) => observation.actionRequestFlag === 1,
    ).length,
    nullControllerPointerObservationCount: observations.filter(
      (observation) => observation.controllerPointer === "0x00000000",
    ).length,
    residentControllerObservationCount: observations.filter(
      (observation) => observation.controllerRecordAvailable,
    ).length,
    exactSourceOperationActionRequestObservationCount:
      exactObservationCount,
    unmatchedActionRequestObservationCount:
      observations.length - exactObservationCount,
    actorResolutionErrorCount: actorResolutionErrors.length,
  },
  actionIdBindings,
  sourceOperations,
  observations,
  actorResolutionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${exactObservationCount}/`
  + `${observations.length} nonzero action requests match an exact source `
  + "operation.",
);
