#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  OPERATION_09_ACTOR_STATE_OFFSET,
  OPERATION_09_HANDLER_ADDRESS,
  OPERATION_0F_ACTOR_QUERY_ADDRESS,
  OPERATION_0F_ACTOR_QUERY_STATE_OFFSET,
  OPERATION_0F_HANDLER_ADDRESS,
  OPERATION_28_ACTOR_BOOLEAN_MODE_OFFSET,
  OPERATION_28_HANDLER_ADDRESS,
  OPERATION_38_ACTOR_BOUNDS_MODE_OFFSET,
  OPERATION_38_BOUNDS_REFRESH_ADDRESS,
  OPERATION_38_HANDLER_ADDRESS,
} from "../lib/scheduler_descriptor_layout.js";

const manifestPath = path.resolve(
  process.argv[2] || "play/data/scheduled-actors.json",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/exact/1ST_READ.BIN",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-direct-state-evidence.json",
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);
const LOAD_ADDRESS = 0x0c010000;

function address(value) {
  return Number.parseInt(value, 16);
}

function bytesAt(runtimeAddress, byteLength) {
  const offset = runtimeAddress - LOAD_ADDRESS;
  if (offset < 0 || offset + byteLength > executable.length) {
    throw new Error(
      `Executable address 0x${runtimeAddress.toString(16)} is outside 1ST_READ.BIN`,
    );
  }
  return executable.subarray(offset, offset + byteLength);
}

function requireHex(runtimeAddress, expectedHex, label) {
  const actual = bytesAt(runtimeAddress, expectedHex.length / 2).toString("hex");
  if (actual !== expectedHex) {
    throw new Error(`${label} changed at 0x${runtimeAddress.toString(16)}`);
  }
}

// Pin the exact jump-table handlers and the first native consumers. These
// signatures intentionally stop before adjacent compact handlers overlap.
requireHex(
  address(OPERATION_09_HANDLER_ADDRESS),
  "f2644153351ef26201a10872",
  "operation 0x09 state handler",
);
requireHex(
  address(OPERATION_0F_HANDLER_ADDRESS),
  "f26422904153360ef262eda00872",
  "operation 0x0f query-state handler",
);
requireHex(
  address(OPERATION_28_HANDLER_ADDRESS),
  "f2642e904153340ef262faa00872",
  "operation 0x28 boolean-mode handler",
);
requireHex(
  address(OPERATION_38_HANDLER_ADDRESS),
  "f26111533823048de364429001e302a0340e",
  "operation 0x38 bounds-mode handler",
);
requireHex(
  address(OPERATION_0F_ACTOR_QUERY_ADDRESS),
  "32d3326558250b895156626331524032038b",
  "operation 0x0f actor-code query",
);
requireHex(
  address(OPERATION_38_BOUNDS_REFRESH_ADDRESS),
  "4e904e033823488b4b904c033823078d8df4",
  "operation 0x38 bounds refresh",
);
requireHex(
  0x0c11ee08,
  "e62f436e2e90224fec0001883a8be26228223789",
  "operation 0x09 non-one lifecycle consumer",
);

const definitions = new Map([
  [0x09, {
    valueField: "actorStateValue",
    nativeClass: "actor lifecycle/control state",
    handlerAddress: OPERATION_09_HANDLER_ADDRESS,
    actorOffset: OPERATION_09_ACTOR_STATE_OFFSET,
    consumerEvidence: {
      nonOneConsumerAddress: "0x0c11ee08",
      initializedValue: 2,
      exactEffect: (
        "A value other than one invokes 0x0c11ee08. For an initialized "
        + "resident actor that routine can construct its controller, save "
        + "the current controller state, install state 0x2c, and restore "
        + "the definition's default motion."
      ),
    },
    boundary: (
      "The write, initialization, comparison with one, and controller "
      + "transition are exact. The three source values are not relabeled "
      + "as visible/hidden because that user-facing meaning is not proven."
    ),
  }],
  [0x0f, {
    valueField: "actorControlValue",
    nativeClass: "script-queryable actor state register",
    handlerAddress: OPERATION_0F_HANDLER_ADDRESS,
    actorOffset: OPERATION_0F_ACTOR_QUERY_STATE_OFFSET,
    consumerEvidence: {
      queryAddress: OPERATION_0F_ACTOR_QUERY_ADDRESS,
      queryKey: "four-character actor definition code",
      exactEffect: (
        "The native query resolves a resident actor by its four-character "
        + "definition code and returns the dword stored at actor +0x90."
      ),
    },
    boundary: (
      "The state register and script query are exact. Numeric values are "
      + "retained without inventing names for their game-script meanings."
    ),
  }],
  [0x28, {
    valueField: "actorByteValue",
    nativeClass: "actor boolean controller mode",
    handlerAddress: OPERATION_28_HANDLER_ADDRESS,
    actorOffset: OPERATION_28_ACTOR_BOOLEAN_MODE_OFFSET,
    consumerEvidence: {
      acceptedValues: [0, 1],
      exactEffect: (
        "The native controller path reads actor +0x149. Input is normalized "
        + "to zero unless it is exactly zero or one, proving a strict "
        + "boolean controller mode."
      ),
    },
    boundary: (
      "The boolean storage and controller propagation are exact. Its "
      + "presentation-level label remains unknown."
    ),
  }],
  [0x38, {
    valueField: "actorBooleanValue",
    nativeClass: "actor bounds/control-footprint mode",
    handlerAddress: OPERATION_38_HANDLER_ADDRESS,
    actorOffset: OPERATION_38_ACTOR_BOUNDS_MODE_OFFSET,
    consumerEvidence: {
      refreshAddress: OPERATION_38_BOUNDS_REFRESH_ADDRESS,
      exactEffect: (
        "The handler stores a boolean and immediately recomputes actor "
        + "extents from definition values at +0x10 and +0x14. Enabled mode "
        + "doubles the +0x10 extent; disabled mode derives the alternate "
        + "footprint and clears the secondary extent."
      ),
    },
    boundary: (
      "The derived bounds/control footprint is exact. Evidence does not "
      + "show this operation directly toggling mesh visibility."
    ),
  }],
]);

const observations = new Map(
  [...definitions.keys()].map((operation) => [operation, []]),
);
for (const actor of manifest.actors) {
  for (const variant of actor.scheduleVariants) {
    for (const journey of variant.journeys) {
      for (const operation of journey.operations) {
        const definition = definitions.get(operation.operation);
        if (!definition) continue;
        observations.get(operation.operation).push({
          actorCode: actor.actorCode,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          journeyStartSecond: journey.startSecond,
          journeyStartTime: journey.startTime,
          operationFileOffset: operation.fileOffset,
          value: operation[definition.valueField],
        });
      }
    }
  }
}

function countBy(members, selector) {
  return Object.fromEntries(
    [...Map.groupBy(members, selector).entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, grouped]) => [String(key), grouped.length]),
  );
}

const operationFamilies = [...definitions.entries()].map(
  ([operation, definition]) => {
    const members = observations.get(operation);
    return {
      operation,
      operationHex: `0x${operation.toString(16).padStart(2, "0")}`,
      nativeClass: definition.nativeClass,
      handlerAddress: definition.handlerAddress,
      actorOffset: definition.actorOffset,
      consumerEvidence: definition.consumerEvidence,
      evidenceBoundary: definition.boundary,
      summary: {
        occurrenceCount: members.length,
        actorCodeCount: new Set(members.map((member) => member.actorCode)).size,
        sourceProgramVariantCount: new Set(
          members.map((member) => member.sourceProgramByteSha256),
        ).size,
        valueCounts: countBy(members, (member) => member.value),
      },
      operations: members,
    };
  },
);

const report = {
  schema: "new-yokosuka-scheduled-actor-direct-state-evidence-v1",
  generatedFrom: [
    {
      path: path.relative(process.cwd(), manifestPath),
      sha256: crypto.createHash("sha256")
        .update(fs.readFileSync(manifestPath))
        .digest("hex"),
    },
    {
      path: path.relative(process.cwd(), executablePath),
      sha256: crypto.createHash("sha256").update(executable).digest("hex"),
      loadAddress: "0x0c010000",
    },
  ],
  evidenceBoundary: (
    "This report separates four direct actor-state operations whose exact "
    + "field writes and first native consumers are proven. It deliberately "
    + "does not turn retained numeric state into guessed browser behavior."
  ),
  operationFamilies,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(process.cwd(), outputPath)}: `
  + operationFamilies.map((family) => (
    `${family.operationHex}=${family.summary.occurrenceCount}`
  )).join(", "),
);
