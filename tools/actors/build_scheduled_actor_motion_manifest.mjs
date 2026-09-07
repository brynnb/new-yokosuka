#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  SCHEDULED_ACTOR_MOTION_BANK_RANGES,
  resolveScheduledActorMotionState,
  scheduledActorInteractionMotionCandidates,
} from "../../src/ScheduledActorMotionRegistry.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const bankPaths = Object.freeze({
  free: path.join(repoRoot, ".disc-work/runtime-motion/MOTION.BIN"),
  mobj: path.join(repoRoot, "play/assets/scheduled-actors/M_MOBJ.BIN"),
});
const operationOneEvidencePath = path.join(
  repoRoot,
  "tools/evidence/scheduled-actor-operation-one-motion-evidence.json",
);
const schedulePath = path.join(
  repoRoot,
  "play/data/scheduled-actors.json",
);
const outputPath = path.join(
  repoRoot,
  "play/data/scheduled-actor-motions.json",
);

function parseBank(file) {
  return MotnLoader.parse(fs.readFileSync(file));
}

function indexMap(bank) {
  return new Map(bank.sequences.map((sequence) => [
    sequence.index,
    sequence.name,
  ]));
}

function nativePathStep(sequence) {
  const frameSpan = Math.max(1, (sequence?.durationFrames || 1) - 1);
  const horizontal = ["tx", "tz"].map((channel) => (
    MotnLoader.samplePoseChannel(sequence, frameSpan, 0, channel)
    - MotnLoader.samplePoseChannel(sequence, 0, 0, channel)
  ));
  return Math.hypot(...horizontal) / frameSpan;
}

function scheduledOperations() {
  const manifest = JSON.parse(fs.readFileSync(schedulePath, "utf8"));
  return manifest.actors.flatMap((actor) => [
    {
      operation: 0x09,
      nativeDefaultMotionStateId:
        actor.nativeDefaultMotionStateId ?? null,
    },
    ...(actor.scheduleVariants || []).flatMap(
      (variant) => (variant.journeys || []).flatMap(
        (journey) => journey.operations || [],
      ),
    ),
  ]);
}

function stateRows(operations, bank, namesByIndex) {
  const states = new Map();
  for (const operation of operations) {
    const motionStateIds = (
      operation.operation === 0x09
      && Number.isInteger(operation.nativeDefaultMotionStateId)
    )
      ? [operation.nativeDefaultMotionStateId]
      : operation.operation === 0x01
      ? [Number.parseInt(operation.movementMode, 16)]
      : operation.operation === 0x17
      ? scheduledActorInteractionMotionCandidates(operation.controlValues)
      : (
          operation.operation === 0x1c
          && Number.isInteger(operation.secondaryControlWord)
        )
        ? [operation.secondaryControlWord]
      : (
          operation.operation === 0x30
          && operation.actionControllerId
        )
        ? [operation.actionControllerId]
      : (
          operation.operation === 0x35
          && (
            operation.routeCompletionMotionOverrideId
            || operation.routeCompletionDefaultIdleCandidateMotionIds
          )
        )
        ? (
            operation.routeCompletionMotionOverrideId
              ? [operation.routeCompletionMotionOverrideId]
              : operation.routeCompletionDefaultIdleCandidateMotionIds
                || []
          )
      : (
          operation.operation === 0x02
          || operation.operation === 0x19
          || operation.operation === 0x1a
        )
        ? (
            operation.operation === 0x19
            && operation.motionStateControlWord === 0
          )
          ? []
          : [operation.motionStateId]
        : [];
    for (const motionStateId of motionStateIds) {
      const resolved = resolveScheduledActorMotionState(motionStateId);
      if (resolved?.bank === bank) {
        states.set(resolved.index, resolved.motionId);
      }
    }
  }
  return [...states].sort(
    ([left], [right]) => left - right,
  ).map(([index, motionId]) => {
    const name = namesByIndex.get(index);
    if (!name) {
      throw new Error(
        `Registered ${bank} motion 0x${motionId.toString(16)} resolves to `
        + `missing sequence ${index}.`,
      );
    }
    return { motionId, index, name };
  });
}

const free = parseBank(bankPaths.free);
const mobj = parseBank(bankPaths.mobj);
const freeNames = indexMap(free);
const mobjNames = indexMap(mobj);
const operations = scheduledOperations();
const operationOneEvidence = JSON.parse(fs.readFileSync(
  operationOneEvidencePath,
  "utf8",
));
if (
  operationOneEvidence.summary.unresolvedMotionStateCount !== 0
  || operationOneEvidence.summary.distinctMotionStateCount
    !== operationOneEvidence.modes.length
) {
  throw new Error("Operation-0x01 motion evidence is incomplete");
}
const resolvedMovementProfiles = Object.fromEntries(
  operationOneEvidence.modes.map((mode) => {
    const bank = mode.bank === "free" ? free : mobj;
    const sequence = bank.sequences[mode.sequenceIndex];
    if (!sequence || sequence.name !== mode.sequenceName) {
      throw new Error(
        `Movement mode ${mode.motionStateIdHex} has no exact MOTN sequence`,
      );
    }
    return [mode.motionStateIdHex.replace(/^0x0+/, "0x"), {
      motionStateId: mode.motionStateId,
      bank: mode.bank,
      index: mode.sequenceIndex,
      name: mode.sequenceName,
      loop: mode.loop,
      nativePathStepPerUpdate: nativePathStep(sequence),
      nativeLoopStartFrame: mode.loop ? 1 : 0,
      nativeLoopFrameCount: mode.loop
        ? Math.max(1, sequence.durationFrames - 1)
        : sequence.durationFrames,
      controllerFamilyIndex: mode.controllerFamilyIndex,
      evidenceStatus: mode.status,
    }];
  }),
);

const freeStates = stateRows(operations, "free", freeNames);
const mobjStates = stateRows(operations, "mobj", mobjNames);
const requestedNames = Object.freeze({
  mbas: [],
  free: [...new Set(freeStates.map((row) => row.name))].sort(),
  mobj: [...new Set(mobjStates.map((row) => row.name))].sort(),
});

const result = {
  schema: "new-yokosuka-scheduled-actor-motions-v3",
  generatedFrom: {
    free: ".disc-work/runtime-motion/MOTION.BIN",
    mobj: "play/assets/scheduled-actors/M_MOBJ.BIN",
    schedules: "play/data/scheduled-actors/*.json",
    operationOneEvidence:
      "tools/evidence/scheduled-actor-operation-one-motion-evidence.json",
  },
  evidenceBoundary: (
    "FUN_0c092f14 resolves operation 0x02, 0x1a, linked-interaction, and "
    + "nonzero operation 0x30 action-controller values "
    + "through the executable's process-wide registered bank ranges; the "
    + "operation code does not select a bank. The live Disc-1 registry maps "
    + "(0x0000,0x0618) to the process-wide MOTION bank and "
    + "(0x8000,0x8358) to M_MOBJ, with "
    + "exclusive bounds and one-based request IDs. Operation 0x01 handler "
    + "0x0c11f948 copies its movement operand verbatim into actor current "
    + "motion +0x06. Its 24 source values therefore resolve directly through "
    + "those same registered ranges to 24 exact MOTION/M_MOBJ sequences; "
    + "there is no hand-authored browser movement-family table and no "
    + "invented M_MBAS entry/exit substitution. "
    + "Operation 0x1c's secondary-control word is the actor motion request "
    + "used while its authored secondary object owns the route; reviewed "
    + "forklift captures match those words exactly at actor +0x06. "
    + "Subtype-1 operation 0x17 selects one of its first two control values "
    + "using the native PRNG modulo two; both authored candidates are retained "
    + "in this manifest. Unresolved states remain unanimated rather than "
    + "using a guessed clip. Operation 0x19 directly submits operand one "
    + "to controller request 0x0c10d77c through handler 0x0c11f804; its "
    + "nonzero requests are included and zero tears the request down. "
    + "Operation 0x30 handler 0x0c11f026 submits its nonzero operand through "
    + "the same 0x0c10d77c request path in controller mode 7; "
    + "0x0c10d7f6 then resolves that operand through FUN_0c092f14. Its zero "
    + "form calls 0x0c11efd2 and removes the action controller. "
    + "Operation 0x35 writes the operation-1 route-completion override at "
    + "actor +0x1c0. The route handler stores the resolved state at +0xf4 "
    + "and installs it into current motion +0x06 when movement completes; "
    + "nonzero overrides are included exactly. Native helper 0x0c114cd4 "
    + "derives operation-1 path step from the active motion's horizontal "
    + "root displacement and frame span; movement profiles retain that "
    + "per-update value and the native looping span."
  ),
  registeredStateRanges: SCHEDULED_ACTOR_MOTION_BANK_RANGES,
  movementProfiles: resolvedMovementProfiles,
  stateNames: {
    free: freeStates,
    mobj: mobjStates,
  },
  requestedNames,
};

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(repoRoot, outputPath)}: `
  + `${freeStates.length} MOTION states, ${mobjStates.length} M_MOBJ states, `
  + `${Object.keys(resolvedMovementProfiles).length} movement controllers.`,
);
