#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MotnLoader } from "../../src/MotnLoader.js";
import {
  SCHEDULED_ACTOR_MOTION_BANK_RANGES,
  resolveScheduledActorMotionState,
} from "../../src/ScheduledActorMotionRegistry.js";
import {
  OPERATION_ONE_HANDLER_ADDRESS,
  OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
} from "../lib/scheduler_descriptor_layout.js";

const offlineEvidencePath = path.resolve(
  process.argv[2] || "tools/evidence/offline-scheduled-actors.json",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/exact/1ST_READ.BIN",
);
const freeBankPath = path.resolve(
  process.argv[4] || ".disc-work/runtime-motion/MOTION.BIN",
);
const objectBankPath = path.resolve(
  process.argv[5] || "play/assets/scheduled-actors/M_MOBJ.BIN",
);
const outputPath = path.resolve(
  process.argv[6]
    || "tools/evidence/scheduled-actor-operation-one-motion-evidence.json",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const OPERATION_ONE_STATE_COPY_ADDRESS = 0x0c11f966;
const OPERATION_ONE_STATE_COPY_SIGNATURE = Buffer.from(
  "d285e381",
  "hex",
);
const OPERATION_ONE_COMPLETION_COPY_ADDRESS = 0x0c11faba;
const OPERATION_ONE_COMPLETION_COPY_SIGNATURE = Buffer.from(
  "2790ed00e381",
  "hex",
);

function hex(value, width = 4) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function executableOffset(runtimeAddress) {
  return runtimeAddress - EXECUTABLE_LOAD_ADDRESS;
}

function requireExecutableSignature(
  executable,
  runtimeAddress,
  expected,
  label,
) {
  const offset = executableOffset(runtimeAddress);
  const actual = executable.subarray(offset, offset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(`${label} executable signature is not reviewed`);
  }
}

// The complete offline evidence is intentionally large. The compact route
// subtype catalog is near its end, so read progressively larger tails instead
// of materializing and parsing the entire 200 MiB report.
function readNamedJsonArrayFromTail(file, propertyName) {
  const stat = fs.statSync(file);
  let tailLength = Math.min(stat.size, 1024 * 1024);
  while (tailLength <= stat.size) {
    const start = stat.size - tailLength;
    const data = Buffer.allocUnsafe(tailLength);
    const descriptor = fs.openSync(file, "r");
    try {
      fs.readSync(descriptor, data, 0, tailLength, start);
    } finally {
      fs.closeSync(descriptor);
    }
    const text = data.toString("utf8");
    const marker = `"${propertyName}"`;
    const markerOffset = text.indexOf(marker);
    if (markerOffset >= 0) {
      const arrayStart = text.indexOf("[", markerOffset + marker.length);
      if (arrayStart < 0) {
        throw new Error(`${propertyName} has no array value`);
      }
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let offset = arrayStart; offset < text.length; offset++) {
        const character = text[offset];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === "\"") {
            inString = false;
          }
          continue;
        }
        if (character === "\"") {
          inString = true;
        } else if (character === "[") {
          depth++;
        } else if (character === "]") {
          depth--;
          if (depth === 0) {
            return JSON.parse(text.slice(arrayStart, offset + 1));
          }
        }
      }
    }
    if (tailLength === stat.size) break;
    tailLength = Math.min(stat.size, tailLength * 2);
  }
  throw new Error(`${propertyName} was not found in ${file}`);
}

const executable = fs.readFileSync(executablePath);
requireExecutableSignature(
  executable,
  OPERATION_ONE_STATE_COPY_ADDRESS,
  OPERATION_ONE_STATE_COPY_SIGNATURE,
  "Operation-0x01 active-state copy",
);
requireExecutableSignature(
  executable,
  OPERATION_ONE_COMPLETION_COPY_ADDRESS,
  OPERATION_ONE_COMPLETION_COPY_SIGNATURE,
  "Operation-0x01 route-completion state copy",
);

const bankFiles = {
  free: freeBankPath,
  mobj: objectBankPath,
};
const bankData = Object.fromEntries(
  Object.entries(bankFiles).map(([name, file]) => [
    name,
    fs.readFileSync(file),
  ]),
);
const banks = Object.fromEntries(
  Object.entries(bankData).map(([name, data]) => [
    name,
    MotnLoader.parse(data),
  ]),
);
const routeModes = readNamedJsonArrayFromTail(
  offlineEvidencePath,
  "routeArrayCandidateCatalog",
);
const modes = routeModes.map((routeMode) => {
  const motionStateId = Number.parseInt(routeMode.subtype, 16);
  const resolved = resolveScheduledActorMotionState(motionStateId);
  if (!resolved) {
    throw new Error(
      `Operation-0x01 state ${routeMode.subtype} is outside native ranges`,
    );
  }
  const sequence = banks[resolved.bank].sequences[resolved.index];
  if (
    !sequence
    || !sequence.valid
    || !sequence.valueData?.complete
  ) {
    throw new Error(
      `Operation-0x01 state ${routeMode.subtype} has no complete sequence`,
    );
  }
  return {
    motionStateId,
    motionStateIdHex: hex(motionStateId),
    occurrenceCount: routeMode.occurrenceCount,
    actorCount: routeMode.actorCodes.length,
    actorCodes: routeMode.actorCodes,
    bank: resolved.bank,
    sequenceIndex: resolved.index,
    sequenceName: sequence.name,
    controllerFamilyIndex: sequence.controllerFamilyIndex,
    durationFrames: sequence.durationFrames,
    loop: /(?:^|_)LP(?:_|$)/.test(sequence.name),
    status: "exact registered native route motion",
  };
}).sort((left, right) => left.motionStateId - right.motionStateId);

const report = {
  schema: "new-yokosuka-scheduled-actor-operation-one-motion-evidence-v1",
  generatedFrom: {
    offlineSchedules: path.relative(process.cwd(), offlineEvidencePath),
    executable: {
      path: path.relative(process.cwd(), executablePath),
      sha256: sha256(executable),
    },
    banks: Object.fromEntries(
      Object.entries(bankFiles).map(([name, file]) => [
        name,
        {
          path: path.relative(process.cwd(), file),
          sha256: sha256(bankData[name]),
        },
      ]),
    ),
  },
  evidenceBoundary: (
    "Operation-0x01 handler 0x0c11f948 copies the descriptor halfword at "
    + "operand offset +0x04 verbatim into scheduled actor current-motion "
    + "+0x06 at 0x0c11f966. The shared registered-motion lookup therefore "
    + "resolves the route state through the same exclusive, one-based "
    + "runtime MOTION/M_MOBJ ranges as other scheduler motion requests. The route "
    + "handler later copies its independently selected completion state "
    + "from actor +0xf4 into current-motion +0x06 at 0x0c11faba. No native "
    + "entry/loop/exit lookup occurs in this handler, so the browser must "
    + "play the exact live-registry route state while moving and switch to the "
    + "separately recovered completion state when the route ends."
  ),
  nativeEvidence: {
    handlerAddress: OPERATION_ONE_HANDLER_ADDRESS,
    descriptorMotionStateOperandOffset: "0x04",
    actorCurrentMotionStateOffset: "0x06",
    activeStateCopyAddress: hex(OPERATION_ONE_STATE_COPY_ADDRESS, 8),
    routeCompletionStateOffset:
      OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET,
    routeCompletionCopyAddress:
      hex(OPERATION_ONE_COMPLETION_COPY_ADDRESS, 8),
    registeredMotionRanges: SCHEDULED_ACTOR_MOTION_BANK_RANGES,
    parsedBankSequenceCounts: Object.fromEntries(
      Object.entries(banks).map(([name, bank]) => [
        name,
        bank.sequences.length,
      ]),
    ),
  },
  summary: {
    distinctMotionStateCount: modes.length,
    occurrenceCount: modes.reduce(
      (sum, mode) => sum + mode.occurrenceCount,
      0,
    ),
    actorCodeCount: new Set(
      modes.flatMap((mode) => mode.actorCodes),
    ).size,
    exactRegisteredMotionStateCount: modes.length,
    unresolvedMotionStateCount: 0,
    nonhumanMotionStateCount: modes.filter(
      (mode) => [16, 18].includes(mode.controllerFamilyIndex),
    ).length,
    controllerFamilyIndices: [...new Set(
      modes.map((mode) => mode.controllerFamilyIndex),
    )].sort((left, right) => left - right),
  },
  modes,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(process.cwd(), outputPath)}: `
  + `${modes.length} exact operation-0x01 states, `
  + `${report.summary.unresolvedMotionStateCount} unresolved.`,
);
