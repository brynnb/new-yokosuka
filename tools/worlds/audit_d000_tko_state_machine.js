#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const mapinfoPath = path.resolve(
  args.shift() || ".disc-work/exact/d000/MAPINFO.BIN",
);
let dispatchCallsPath = path.resolve(".disc-work/d000-dispatch-calls.json");
let outputPath = path.resolve(
  "tools/evidence/d000-tko-state-machine.json",
);
while (args.length > 0) {
  const argument = args.shift();
  if (argument === "--dispatch-calls") {
    dispatchCallsPath = path.resolve(args.shift());
  } else if (argument === "--out") {
    outputPath = path.resolve(args.shift());
  } else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}

const mapinfo = fs.readFileSync(mapinfoPath);
const dispatchCalls = JSON.parse(fs.readFileSync(dispatchCallsPath, "utf8"));

function hex(value, width = 0) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function assertWord(offset, expected) {
  const actual = mapinfo.readUInt16LE(offset);
  if (actual !== expected) {
    throw new Error(
      `${hex(offset)}: expected SH-4 word ${hex(expected, 4)}, `
      + `found ${hex(actual, 4)}`,
    );
  }
}

function hashRange(start, end) {
  return {
    start: hex(start),
    endExclusive: hex(end),
    byteLength: end - start,
    sha256: crypto
      .createHash("sha256")
      .update(mapinfo.subarray(start, end))
      .digest("hex"),
  };
}

function dispatchCallAt(offset, operationHex) {
  const offsetHex = hex(offset);
  const call = dispatchCalls.calls.find(
    (candidate) => candidate.callFileOffset === offsetHex,
  );
  if (!call) throw new Error(`Missing dispatcher call at ${offsetHex}`);
  if (call.operationHex !== operationHex) {
    throw new Error(
      `${offsetHex}: expected operation ${operationHex}, `
      + `found ${call.operationHex}`,
    );
  }
  return call;
}

// The caller pushes (start minute, end hour, end minute, start hour) before
// invoking the shared clock-window predicate at 0x7ed70. Its comparison
// sequence normalizes hours below 06:00 by adding 24, then evaluates
// start <= current < end, including minute comparisons at both boundaries.
for (const [offset, word] of [
  [0x690ea, 0xe400], // mov #0,r4  (start minute)
  [0x690ec, 0xe513], // mov #19,r5 (end hour)
  [0x690ee, 0xe600], // mov #0,r6  (end minute)
  [0x690f0, 0xe707], // mov #7,r7  (start hour)
  [0x690fc, 0x0103], // bsrf r1
]) {
  assertWord(offset, word);
}

const storySelectors = [
  {
    selector: 0,
    primaryTag: "TKOK",
    transitionTag: "TKOM",
    variableId: 0x2f3,
    callOffset: 0x6917c,
  },
  {
    selector: 1,
    primaryTag: "TKOL",
    transitionTag: "TKON",
    variableId: 0x298,
    callOffset: 0x6934e,
  },
].map((selector) => {
  const call = dispatchCallAt(selector.callOffset, "0x009a");
  const constants = call.arguments.map((argument) => argument.value);
  if (
    call.arguments[0]?.kind !== "runtime"
    || constants[1] !== 4
    || constants[2] !== selector.variableId
  ) {
    throw new Error(
      `${hex(selector.callOffset)} does not match the expected `
      + `${hex(selector.variableId)} variable read`,
    );
  }
  return {
    selector: selector.selector,
    tags: {
      primary: selector.primaryTag,
      transition: selector.transitionTag,
    },
    variableRead: {
      operation: call.operationHex,
      callFileOffset: call.callFileOffset,
      variableId: hex(selector.variableId, 4),
      valueType: 4,
      resultMask: hex(2),
    },
  };
});

const report = {
  schema: "new-yokosuka-d000-tko-state-machine-v1",
  source: {
    mapinfo: path.relative(process.cwd(), mapinfoPath),
    dispatchCalls: path.relative(process.cwd(), dispatchCallsPath),
  },
  routines: {
    pairTransition: hashRange(0x68aee, 0x68dea),
    stateEvaluator: hashRange(0x68f5c, 0x69784),
    clockWindowPredicate: hashRange(0x7ed70, 0x7ee88),
  },
  clockWindow: {
    callFileOffset: hex(0x690fc),
    start: { hour: 7, minute: 0 },
    end: { hour: 19, minute: 0 },
    boundary: "start-inclusive, end-exclusive",
    dayBoundaryHour: 6,
    sourceClock: {
      hourOffset: "scene-context + 0xcc",
      minuteOffset: "scene-context + 0xcd",
    },
  },
  storySelectors,
  exactRecoveredSemantics: [
    "The TKO pair controller reads two independent typed scene variables.",
    "Each variable selects between one primary and one transition object tag.",
    "The controller also evaluates the in-game clock inside [07:00, 19:00).",
    "The pair transition uses the recovered node-152 spin/slowdown and "
      + "0x001f/0x00a8 enable-state routes.",
  ],
  remainingBoundary: [
    "The browser has no Shenmue story-variable service for IDs 0x02f3/0x0298.",
    "The browser's shared game clock supplies time, but the exact transition "
      + "is retained in its captured initial state until the two authoritative "
      + "scene-variable values are available; no click trigger is invented.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
