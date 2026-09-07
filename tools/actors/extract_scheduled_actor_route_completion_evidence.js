#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  DESCRIPTOR_DISPATCHER_ADDRESS,
  OPERATION_ONE_HANDLER_ADDRESS,
  OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
  OPERATION_35_ACTOR_OVERRIDE_OFFSET,
} from "../lib/scheduler_descriptor_layout.js";
import {
  resolveScheduledActorMotionState,
} from "../../src/ScheduledActorMotionRegistry.js";

const sourcePath = path.resolve(
  process.argv[2] || "tools/evidence/scheduled-actors.json",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/exact/1ST_READ.BIN",
);
const motionBankPath = path.resolve(
  process.argv[4] || "play/assets/scheduled-actors/M_MOBJ.BIN",
);
const outputPath = path.resolve(
  process.argv[5]
    || "tools/evidence/scheduled-actor-route-completion-evidence.json",
);
const defaultIdleEvidencePath = path.resolve(
  process.argv[6]
    || "tools/evidence/scheduled-actor-default-idle-evidence.json",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const OPERATION_35_WRITE_ADDRESS = 0x0c1197de;
const OPERATION_ONE_SELECTION_ADDRESS = 0x0c11f966;
const OPERATION_ONE_COMPLETION_ADDRESS = 0x0c11faba;
const RANDOM_FUNCTION_ADDRESS = 0x0c1ce1f0;
const SIGNED_REMAINDER_FUNCTION_ADDRESS = 0x0c1dc440;
const OPERATION_35_WRITE_SIGNATURE = Buffer.from(
  "f2624c902153360ef2620fa00872",
  "hex",
);
const OPERATION_ONE_SELECTION_SIGNATURE = Buffer.from(
  "d285e3817890ee022822028d221f0ca0"
  + "f2533ad3e2680b437c7839d203610b42"
  + "04e0017000408d033d63669000ec360e",
  "hex",
);
const OPERATION_ONE_COMPLETION_SIGNATURE = Buffer.from(
  "2790ed00e38198f3",
  "hex",
);

function executableOffset(address) {
  return address - EXECUTABLE_LOAD_ADDRESS;
}

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function requireSignature(executable, address, signature, label) {
  const actual = executable.subarray(
    executableOffset(address),
    executableOffset(address) + signature.length,
  );
  if (!actual.equals(signature)) {
    throw new Error(`${label} executable signature is not reviewed`);
  }
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const executable = fs.readFileSync(executablePath);
const defaultIdleEvidence = JSON.parse(
  fs.readFileSync(defaultIdleEvidencePath, "utf8"),
);
if (
  defaultIdleEvidence.schema
    !== "new-yokosuka-scheduled-actor-default-idle-evidence-v1"
) {
  throw new Error("Default-idle evidence schema is not reviewed");
}
const defaultIdleByActor = new Map(
  defaultIdleEvidence.actors.map((actor) => [actor.actorCode, actor]),
);
requireSignature(
  executable,
  OPERATION_35_WRITE_ADDRESS,
  OPERATION_35_WRITE_SIGNATURE,
  "Operation-0x35 write",
);
requireSignature(
  executable,
  OPERATION_ONE_SELECTION_ADDRESS,
  OPERATION_ONE_SELECTION_SIGNATURE,
  "Operation-0x01 completion-state selection",
);
requireSignature(
  executable,
  OPERATION_ONE_COMPLETION_ADDRESS,
  OPERATION_ONE_COMPLETION_SIGNATURE,
  "Operation-0x01 completion-state install",
);
if (
  executable.readUInt16LE(executableOffset(0x0c11987c))
    !== Number.parseInt(OPERATION_35_ACTOR_OVERRIDE_OFFSET, 16)
  || executable.readUInt16LE(executableOffset(0x0c11fa5e))
    !== Number.parseInt(OPERATION_35_ACTOR_OVERRIDE_OFFSET, 16)
  || executable.readUInt16LE(executableOffset(0x0c11fa60))
    !== Number.parseInt(
      OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
      16,
    )
  || executable.readUInt16LE(executableOffset(0x0c11fb0c))
    !== Number.parseInt(
      OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
      16,
    )
  || executable.readUInt32LE(executableOffset(0x0c11fa64))
    !== RANDOM_FUNCTION_ADDRESS
  || executable.readUInt32LE(executableOffset(0x0c11fa68))
    !== SIGNED_REMAINDER_FUNCTION_ADDRESS
) {
  throw new Error("Route-completion field/call literals are not reviewed");
}

const mobj = MotnLoader.parse(fs.readFileSync(motionBankPath));
const operations = [];
const routeBindings = [];
for (const variant of source.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      let activeOverride = null;
      for (const operation of entry.descriptor.operations) {
        if (operation.operation === 0x35) {
          const motionId = operation.actorControlValue >>> 0;
          const resolved = resolveScheduledActorMotionState(motionId);
          const sequence = resolved?.bank === "mobj"
            ? mobj.sequences[resolved.index]
            : null;
          const defaultIdle = defaultIdleByActor.get(variant.actorCode);
          activeOverride = {
            actorCode: variant.actorCode,
            sourceVariantId: variant.sourceVariantId,
            scheduleTableFileOffset: table.fileOffset,
            journeyStartSecond: entry.startSecond,
            operationFileOffset: operation.fileOffset,
            routeCompletionMotionOverrideId: motionId || null,
            resolution: motionId === 0
              ? {
                  status: (
                    "native actor-definition default-idle selection"
                  ),
                  candidateTableOffsetFromActorDefinition: "0x7c",
                  candidateCount: 4,
                  candidateWordOffsets: ["0x7e", "0x80", "0x82", "0x84"],
                  selectionRule: "candidate[processWideRandom15 % 4]",
                  candidateMotionIds:
                    defaultIdle?.exactCandidateMotionIds ?? null,
                  candidates: defaultIdle?.candidateVariants?.[0]
                    ?.candidates ?? null,
                  unanimousNonzeroMotionId:
                    defaultIdle?.unanimousNonzeroMotionId ?? null,
                  tableStatus: defaultIdle?.status
                    ?? "actor absent from reviewed resident captures",
                }
              : resolved && sequence
                ? {
                    status: "exact registered route-completion motion",
                    bank: resolved.bank,
                    motionId: resolved.motionId,
                    sequenceIndex: resolved.index,
                    sequenceName: sequence.name,
                    durationFrames: sequence.durationFrames,
                    controllerFamilyIndex:
                      sequence.controllerFamilyIndex,
                  }
                : {
                    status: "nonzero override outside reviewed registry",
                  },
            rawOperands: operation.rawOperands,
          };
          operations.push(activeOverride);
          continue;
        }
        if (operation.operation !== 1 || !activeOverride) continue;
        routeBindings.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          journeyStartSecond: entry.startSecond,
          overrideOperationFileOffset:
            activeOverride.operationFileOffset,
          routeOperationFileOffset: operation.fileOffset,
          movementControllerId: Number.parseInt(
            operation.subtype,
            16,
          ),
          routeCompletionMotionOverrideId:
            activeOverride.routeCompletionMotionOverrideId,
          resolution: activeOverride.resolution,
        });
      }
    }
  }
}

const nonzeroOperations = operations.filter(
  (operation) => operation.routeCompletionMotionOverrideId !== null,
);
const unresolvedNonzeroOperations = nonzeroOperations.filter(
  (operation) => (
    operation.resolution.status
      !== "exact registered route-completion motion"
  ),
);
const report = {
  schema: "new-yokosuka-scheduled-actor-route-completion-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), sourcePath),
    path.relative(process.cwd(), executablePath),
    path.relative(process.cwd(), motionBankPath),
    path.relative(process.cwd(), defaultIdleEvidencePath),
  ],
  evidenceBoundary: (
    "Dispatcher operation 0x35 writes its operand to actor +0x1c0. "
    + "Operation-1 handler 0x0c11f948 copies its movement-controller operand "
    + "to actor +0x06, resolves actor +0x1c0 into route-completion state "
    + "+0xf4, and copies +0xf4 back to current state +0x06 when the route "
    + "finishes. A nonzero +0x1c0 is used verbatim. Zero invokes the shared "
    + "PRNG modulo four and reads one of four actor-definition halfwords at "
    + "+0x7e/+0x80/+0x82/+0x84. All zero/default actors join byte-stable "
    + "resident actor-definition tables recovered from the native registry; "
    + "their candidate motions resolve exactly through M_MOBJ. The selected "
    + "candidate order is still process-wide PRNG state and is not invented. "
    + "Nonzero source values also resolve exactly through M_MOBJ."
  ),
  nativeEvidence: {
    descriptorDispatcherAddress: DESCRIPTOR_DISPATCHER_ADDRESS,
    operation35WriteAddress: hex(OPERATION_35_WRITE_ADDRESS),
    operation35ActorOverrideOffset: OPERATION_35_ACTOR_OVERRIDE_OFFSET,
    operationOneHandlerAddress: OPERATION_ONE_HANDLER_ADDRESS,
    operationOneSelectionAddress: hex(OPERATION_ONE_SELECTION_ADDRESS),
    operationOneCompletionAddress: hex(OPERATION_ONE_COMPLETION_ADDRESS),
    actorCurrentMotionStateOffset: "0x06",
    actorRouteCompletionStateOffset:
      OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
    actorDefinitionDefaultIdleTableOffset: "0x7c",
    actorDefinitionDefaultIdleCandidateCount: 4,
    actorDefinitionDefaultIdleCandidateWordOffsets: [
      "0x7e",
      "0x80",
      "0x82",
      "0x84",
    ],
    actorDefinitionDefaultIdleSelectionRule:
      "candidate[processWideRandom15 % 4]",
    randomFunctionAddress: hex(RANDOM_FUNCTION_ADDRESS),
    signedRemainderFunctionAddress: hex(
      SIGNED_REMAINDER_FUNCTION_ADDRESS,
    ),
  },
  summary: {
    operationCount: operations.length,
    actorCodeCount: new Set(operations.map(
      (operation) => operation.actorCode,
    )).size,
    nonzeroOverrideOperationCount: nonzeroOperations.length,
    zeroDefaultSelectionOperationCount:
      operations.length - nonzeroOperations.length,
    exactRegisteredOverrideOperationCount:
      nonzeroOperations.length - unresolvedNonzeroOperations.length,
    unresolvedNonzeroOverrideOperationCount:
      unresolvedNonzeroOperations.length,
    boundRouteOperationCount: routeBindings.length,
    distinctOverrideMotionCount: new Set(nonzeroOperations.map(
      (operation) => operation.routeCompletionMotionOverrideId,
    )).size,
    exactDefaultIdleTableOperationCount: operations.filter(
      (operation) => (
        operation.routeCompletionMotionOverrideId === null
        && Array.isArray(operation.resolution.candidateMotionIds)
      ),
    ).length,
    missingDefaultIdleTableOperationCount: operations.filter(
      (operation) => (
        operation.routeCompletionMotionOverrideId === null
        && !Array.isArray(operation.resolution.candidateMotionIds)
      ),
    ).length,
    prngIndependentDefaultIdleOperationCount: operations.filter(
      (operation) => (
        operation.routeCompletionMotionOverrideId === null
        && operation.resolution.unanimousNonzeroMotionId !== null
      ),
    ).length,
  },
  operations,
  routeBindings,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${operations.length} operation-0x35 records, `
  + `${routeBindings.length} exact route bindings.`,
);
