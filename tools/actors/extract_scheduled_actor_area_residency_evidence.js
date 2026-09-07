#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  OPERATION_08_ACTOR_AREA_CODE_OFFSET,
  OPERATION_08_ACTOR_POSITION_OFFSET,
  OPERATION_08_HANDLER_ADDRESS,
  OPERATION_08_LINKED_ACTOR_POINTER_OFFSET,
  SCHEDULED_ACTOR_LINK_INITIALIZER_ADDRESS,
  SCHEDULED_ACTOR_LINK_UPDATE_ADDRESS,
  SCHEDULED_ACTOR_LOOKUP_ADDRESS,
  SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS,
  SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS,
  SCHEDULED_ACTOR_RECORD_STRIDE,
} from "../lib/scheduler_descriptor_layout.js";

const manifestPath = path.resolve(
  process.argv[2] || "play/data/scheduled-actors.json",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/exact/1ST_READ.BIN",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-area-residency-evidence.json",
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
    throw new Error(`Executable address 0x${runtimeAddress.toString(16)} is outside 1ST_READ.BIN`);
  }
  return executable.subarray(offset, offset + byteLength);
}

function requireHex(runtimeAddress, expectedHex, label) {
  const actual = bytesAt(runtimeAddress, expectedHex.length / 2).toString("hex");
  if (actual !== expectedHex) {
    throw new Error(`${label} changed at 0x${runtimeAddress.toString(16)}`);
  }
}

// These checks deliberately cover the writes and comparisons used as evidence,
// rather than relying on Ghidra's imperfect decompilation of the large switch.
requireHex(
  address(OPERATION_08_HANDLER_ADDRESS),
  "f264e3524153303209894150031e24c708f424e047fe28e047fe2ce047fef263a5a00873",
  "operation 0x08 handler",
);
requireHex(
  address(SCHEDULED_ACTOR_LOOKUP_ADDRESS),
  "0fd200e70dd322601540208f326552666826178961524032148b0b0053606c0194fe8001",
  "resident actor lookup",
);
requireHex(
  0x0c11b726,
  "e353d35220331489",
  "linked actor update area comparison",
);
requireHex(
  0x0c11bfd0,
  "e352d3533032098b",
  "linked actor acquisition area comparison",
);

const literal32 = (runtimeAddress) => bytesAt(runtimeAddress, 4).readUInt32LE(0);
const literal16 = (runtimeAddress) => bytesAt(runtimeAddress, 2).readUInt16LE(0);
if (
  literal32(0x0c11bf98)
    !== address(SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS)
  || literal32(0x0c11bf9c)
    !== address(SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS)
  || literal16(0x0c11c0b0) !== SCHEDULED_ACTOR_RECORD_STRIDE
) {
  throw new Error("Resident scheduled-actor registry literals changed");
}

const operations = [];
for (const actor of manifest.actors) {
  for (const variant of actor.scheduleVariants) {
    for (const journey of variant.journeys) {
      for (let index = 0; index < journey.operations.length; index++) {
        const operation = journey.operations[index];
        if (operation.operation !== 0x08) continue;
        operations.push({
          actorCode: actor.actorCode,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          journeyStartSecond: journey.startSecond,
          journeyStartTime: journey.startTime,
          operationFileOffset: operation.fileOffset,
          areaCode: operation.area,
          previousOperation: journey.operations[index - 1]?.operation ?? null,
          nextOperation: journey.operations[index + 1]?.operation ?? null,
        });
      }
    }
  }
}

const countBy = (selector) => Object.fromEntries(
  [...Map.groupBy(operations, selector).entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, members]) => [key, members.length]),
);

const report = {
  schema: "new-yokosuka-scheduled-actor-area-residency-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), manifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "Operation 0x08 writes its four-character area operand to scheduled "
    + "actor +0x0c. "
    + "When the value changes, the handler clears actor XYZ at +0x24, "
    + "+0x28, and +0x2c. Native lookup 0x0c11bf5c resolves a linked actor "
    + "by its four-character definition code from the resident 0x1f0-byte "
    + "actor-record array. Both linked-actor acquisition at 0x0c11bfb0 and "
    + "linked-actor movement update at 0x0c11b63c require the owner and "
    + "target +0x0c values to match; mismatch prevents or cancels the link. "
    + "This proves a same-area residency gate for linked scheduled actors. "
    + "It does not assign any semantics to the separate numeric operation "
    + "0x09 actor state."
  ),
  nativeEvidence: {
    handlerAddress: OPERATION_08_HANDLER_ADDRESS,
    actorAreaCodeOffset: OPERATION_08_ACTOR_AREA_CODE_OFFSET,
    actorPositionOffset: OPERATION_08_ACTOR_POSITION_OFFSET,
    linkedActorPointerOffset: OPERATION_08_LINKED_ACTOR_POINTER_OFFSET,
    residentActorLookupAddress: SCHEDULED_ACTOR_LOOKUP_ADDRESS,
    linkedActorInitializerAddress: SCHEDULED_ACTOR_LINK_INITIALIZER_ADDRESS,
    linkedActorUpdateAddress: SCHEDULED_ACTOR_LINK_UPDATE_ADDRESS,
    linkedActorUpdateAreaComparisonAddress: "0x0c11b726",
    linkedActorAcquisitionAreaComparisonAddress: "0x0c11bfd0",
    actorRecordArrayPointerAddress:
      SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS,
    actorRecordCountAddress: SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS,
    actorRecordStride: SCHEDULED_ACTOR_RECORD_STRIDE,
    linkedActorLookupKey: "four-character actor code at definition +0x04",
    mismatchBehavior: "reject acquisition or clear actor +0x7c link",
  },
  summary: {
    operationCount: operations.length,
    actorCodeCount: new Set(operations.map((operation) => operation.actorCode))
      .size,
    sourceProgramVariantCount: new Set(
      operations.map((operation) => operation.sourceProgramByteSha256),
    ).size,
    areaCodeCounts: countBy((operation) => operation.areaCode),
    previousOperationCounts: countBy(
      (operation) => operation.previousOperation ?? "none",
    ),
    nextOperationCounts: countBy(
      (operation) => operation.nextOperation ?? "none",
    ),
  },
  operations,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(process.cwd(), outputPath)}: `
  + `${operations.length} operation-0x08 records across `
  + `${report.summary.actorCodeCount} actors.`,
);
