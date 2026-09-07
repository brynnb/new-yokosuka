#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  parseAuthSequence,
  resolveAuthMotions,
  resolveAuthSoundMotions,
} from "../lib/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";

function firstExisting(candidates, label) {
  const found = candidates
    .filter(Boolean)
    .map((candidate) => path.resolve(candidate))
    .find(fs.existsSync);
  if (!found) {
    throw new Error(`${label} not found. Tried: ${candidates.join(", ")}`);
  }
  return found;
}

const exactRoot = firstExisting([
  process.env.SHENMUE_D000_EXACT_ROOT,
  ".disc-work/exact/d000",
], "D000 exact extraction");
const sourceRoot = path.join(exactRoot, "unpacked/DJHN");
const motionPath = path.join(sourceRoot, "M_01JUCE.MOTN");
const mapinfoPath = path.join(exactRoot, "MAPINFO.BIN");
const dispatchPath = firstExisting([
  process.env.SHENMUE_D000_DISPATCH_CALLS,
  ".disc-work/d000-dispatch-calls.json",
], "D000 dispatch call evidence");
const audioBankPath = firstExisting([
  process.env.SHENMUE_A1_YANJI_BANK,
  "extracted_files/data/SCENE/01/SOUND/A1_YANJI.SND",
], "A1_YANJI.SND");
const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-vending-interaction.json",
);
const failures = [];

function arrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fileEvidence(filename, logicalPath = path.relative(process.cwd(), filename)) {
  const bytes = fs.readFileSync(filename);
  return {
    path: logicalPath,
    byteLength: bytes.length,
    sha256: sha256(bytes),
  };
}

const motionBytes = fs.readFileSync(motionPath);
const mapinfo = fs.readFileSync(mapinfoPath);
const motionPackage = MotnLoader.parse(arrayBuffer(motionBytes));
if (motionPackage.sequences.length !== 26) {
  failures.push(
    `M_01JUCE has ${motionPackage.sequences.length} sequences, expected 26`,
  );
}
if (
  motionPackage.sequences.some(
    (sequence) => !sequence.valid || !sequence.valueData?.complete,
  )
) {
  failures.push("M_01JUCE contains an invalid or incomplete sequence");
}

const expectedEventCounts = [2, 2, 6, 2, 2, 2, 5];
const authoredSequences = [];
for (let number = 1; number <= 7; number += 1) {
  const filename = path.join(sourceRoot, `SEQDATA${number}.AUTH`);
  const bytes = fs.readFileSync(filename);
  const parsed = parseAuthSequence(arrayBuffer(bytes));
  const motions = resolveAuthMotions(parsed, motionPackage);
  const sounds = resolveAuthSoundMotions(parsed, motionPackage);
  if (motions.length !== expectedEventCounts[number - 1]) {
    failures.push(
      `SEQDATA${number} has ${motions.length} motion events, `
      + `expected ${expectedEventCounts[number - 1]}`,
    );
  }
  if (motions.some((event) => !event.motionValid)) {
    failures.push(`SEQDATA${number} has an unresolved MOTN reference`);
  }
  if (!parsed.timelineComplete) {
    failures.push(`SEQDATA${number} has an incomplete ASEQ timeline parse`);
  }
  if (sounds.some((event) => !event.motionFrameResolved)) {
    failures.push(
      `SEQDATA${number} has a sound outside its actor's motion interval`,
    );
  }
  if (
    motions.some(
      (event) => (
        event.startFrame > event.endFrame
        || event.endFrame > event.motionDurationFrames
      ),
    )
  ) {
    failures.push(`SEQDATA${number} has an invalid authored frame interval`);
  }
  authoredSequences.push({
    number,
    source: fileEvidence(
      filename,
      `.disc-work/exact/d000/unpacked/DJHN/SEQDATA${number}.AUTH`,
    ),
    durationFrames: parsed.durationFrames,
    actors: parsed.actors,
    motions: motions.map((event) => ({
      recordOffset: `0x${event.recordOffset.toString(16)}`,
      timelineFrame: event.timelineFrame,
      actorTag: event.actorTag,
      motionId: `0x${event.motionId.toString(16).padStart(4, "0")}`,
      motionBank: event.motionBank,
      sequenceNumber: event.sequenceNumber,
      sequenceIndex: event.sequenceIndex,
      motionName: event.motionName,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
      motionDurationFrames: event.motionDurationFrames,
      clippedAtStart: event.startFrame !== 0,
      clippedAtEnd: event.endFrame !== event.motionDurationFrames,
    })),
    sounds: sounds.map((event) => ({
      recordOffset: `0x${event.recordOffset.toString(16)}`,
      frame: event.frame,
      actorTag: event.actorTag,
      commandHex: event.commandHex,
      eventIndex: event.eventIndex,
      stop: event.stop,
      motionRecordOffset: event.motionRecordOffset === null
        ? null
        : `0x${event.motionRecordOffset.toString(16)}`,
      motionTimelineFrame: event.motionTimelineFrame,
      motionName: event.motionName,
      motionLocalFrame: event.motionLocalFrame,
      motionFrameResolved: event.motionFrameResolved,
    })),
  });
}

const dispatch = JSON.parse(fs.readFileSync(dispatchPath, "utf8"));
function callAt(offset, operationHex, expectedArguments) {
  const callFileOffset = `0x${offset.toString(16)}`;
  const call = dispatch.calls.find(
    (candidate) => candidate.callFileOffset === callFileOffset,
  );
  const argumentsInNativeOrder = call?.arguments.map(
    (argument) => argument.ascii ?? argument.value ?? argument.kind,
  );
  if (
    call?.operationHex !== operationHex
    || JSON.stringify(argumentsInNativeOrder)
      !== JSON.stringify(expectedArguments)
  ) {
    failures.push(
      `${callFileOffset} differs from expected ${operationHex} `
      + JSON.stringify(expectedArguments),
    );
  }
  return {
    callFileOffset,
    operationHex: call?.operationHex || null,
    argumentsInNativeOrder: argumentsInNativeOrder || [],
  };
}

const canAttachmentCalls = [
  callAt(0x89302, "0x001f", ["CAN1", 1]),
  callAt(0x89392, "0x00e6", ["CAN1", "AKIR", 18, "runtime", "runtime"]),
  callAt(0x893f2, "0x001b", ["CAN1"]),
  callAt(0x8948e, "0x00e6", ["CAN1", "YKHI", 18, "runtime", "runtime"]),
  callAt(0x89ed6, "0x001f", ["CAN1", 1]),
  callAt(0x89f66, "0x00e6", ["CAN1", "AKIR", 18, "runtime", "runtime"]),
  callAt(0x8a0e2, "0x00e6", ["CAN1", "YKHI", 18, "runtime", "runtime"]),
];

const cinematicCanGrip = {
  callFileOffset: "0x89392",
  parentTag: "AKIR",
  modelControlId: 18,
  translationLiteralOffsets: ["0x893ac", "0x893b0", "0x893b4"],
  rotationLiteralOffsets: ["0x893b8", "0x893bc", "0x893c0"],
  translation: [0x893ac, 0x893b0, 0x893b4].map(offset => mapinfo.readFloatLE(offset)),
  rotationRaw: [0x893b8, 0x893bc, 0x893c0].map(offset => mapinfo.readInt32LE(offset)),
  scope: "DJHN cinematic CAN1 grip; browser reuse with solo M_DJUC motions is rendered-checked, not proof of the native free-roam controller's arguments",
};

const stateCalls = [
  callAt(0xd064, "0x0060", [2, "runtime"]),
  callAt(0xd0bc, "0x0060", [2, "runtime"]),
  callAt(0xd1ba, "0x005f", [2]),
  callAt(0xd3ac, "0x005f", [2]),
  callAt(0xd50c, "0x005f", [2]),
  callAt(0xd684, "0x005f", [2]),
  callAt(0x8c900, "0x005f", [2]),
  callAt(0x8cbb4, "0x0060", [2, "runtime"]),
  callAt(0x8cfd0, "0x005f", [2]),
  callAt(0x8d1d0, "0x0060", [2, "runtime"]),
];

function requireWord(offset, expected, label) {
  const actual = mapinfo.readUInt16LE(offset);
  if (actual !== expected) {
    failures.push(
      `${label} word at 0x${offset.toString(16)} is `
      + `0x${actual.toString(16)}, expected 0x${expected.toString(16)}`,
    );
  }
  return `0x${actual.toString(16).padStart(4, "0")}`;
}

const currencyMutation = {
  selector: 2,
  unitAmount: 100,
  subtractRoutine: {
    localLoad: requireWord(0xd04c, 0x55e2, "currency load"),
    immediate: requireWord(0xd04e, 0xe664, "subtract 100 immediate"),
    arithmetic: requireWord(0xd050, 0x3568, "subtract 100"),
    writeCall: "0xd064",
  },
  refundRoutine: {
    localLoad: requireWord(0xd0a4, 0x55e2, "refund load"),
    immediate: requireWord(0xd0a6, 0xe664, "add 100 immediate"),
    arithmetic: requireWord(0xd0a8, 0x356c, "add 100"),
    writeCall: "0xd0bc",
  },
  affordabilityBranch: {
    loadedSelectorCall: "0xd1ba",
    immediate: requireWord(0xd22a, 0xe563, "compare against 99"),
    comparison: requireWord(0xd22c, 0x3457, "greater-than comparison"),
  },
  debugLabel: mapinfo.toString("ascii", 0xa3449, 0xa3471),
};
if (!currencyMutation.debugLabel.startsWith(
  "vendmachine exit is MONEY_LOCK -> %d,%d",
)) {
  failures.push("vending MONEY_LOCK diagnostic changed or is missing");
}

const resourceCluster = {
  mapinfoRange: {
    startOffset: "0xb1884",
    endOffsetExclusive: "0xb1a20",
  },
  authPackages: Array.from(
    { length: 7 },
    (_, index) => ({
      name: `DJHN_${String(index + 1).padStart(2, "0")}`,
      firstOffset: `0x${mapinfo.indexOf(
        Buffer.from(`DJHN_${String(index + 1).padStart(2, "0")}\0`),
        0xb1884,
      ).toString(16)}`,
    }),
  ),
  motionPackage: {
    name: "DJHN_MOT",
    offset: `0x${mapinfo.indexOf(Buffer.from("DJHN_MOT\0"), 0xb19c0)
      .toString(16)}`,
  },
  soundBank: {
    name: "a1_yanji.snd",
    offset: `0x${mapinfo.indexOf(Buffer.from("a1_yanji.snd\0"), 0xb1a00)
      .toString(16)}`,
    source: fileEvidence(
      audioBankPath,
      "extracted_files/data/SCENE/01/SOUND/A1_YANJI.SND",
    ),
    commandGroup: "a904",
    playableCommands: {
      first: "a9040000",
      last: "a9041700",
      count: 24,
    },
  },
  followingModel: {
    name: "01JUCEA",
    offset: `0x${mapinfo.indexOf(Buffer.from("01JUCEA\0"), 0xb1a10)
      .toString(16)}`,
  },
};
if (
  resourceCluster.soundBank.offset !== "0xb1a09"
  || resourceCluster.motionPackage.offset !== "0xb1a00"
  || resourceCluster.followingModel.offset !== "0xb1a16"
) {
  failures.push("DJHN resource cluster offsets differ from the verified layout");
}

const report = {
  schema: "new-yokosuka-d000-vending-interaction-v2",
  source: {
    motion: fileEvidence(
      motionPath,
      ".disc-work/exact/d000/unpacked/DJHN/M_01JUCE.MOTN",
    ),
    mapinfo: fileEvidence(mapinfoPath, ".disc-work/exact/d000/MAPINFO.BIN"),
    authDirectory: ".disc-work/exact/d000/unpacked/DJHN",
    dispatch: ".disc-work/d000-dispatch-calls.json",
  },
  motionSequenceCount: motionPackage.sequences.length,
  authoredSequences,
  resourceCluster,
  canAttachmentCalls,
  cinematicCanGrip,
  stateCalls,
  currencyMutation,
  exactConclusions: [
    "ASEQ 0x0503 records identify actor, one-based MOTN sequence, and exact frame interval.",
    "ASEQ 0x0306 records identify an authored global timeline frame, actor, exact four-byte native sound command, and event index.",
    "ASEQ groups can contain multiple records at one frame; record type high bytes encode length and permit an exact sequential parse.",
    "Every DJHN sound resolves to the named actor's active MOTN sequence and exact local frame by applying the authored motion timeline offset.",
    "The ffffffff sound command is an authored stop/clear sentinel, not a playable track.",
    "All seven DJHN AUTH files resolve every actor motion to complete M_01JUCE data.",
    "D000 MAPINFO places DJHN_01 through DJHN_07, DJHN_MOT, and a1_yanji.snd in one resource cluster, linking the AUTH sound commands to A1_YANJI.SND.",
    "CAN1 is enabled, attached to actor model-control 18, detached, and reattached by the native routine.",
    "The VEND module reads global-state selector 2, checks it against 99, subtracts 100 on purchase, and adds 100 on refund.",
    "The adjacent native diagnostic names the failed branch MONEY_LOCK, independently identifying selector 2 as the currency balance.",
  ],
  browserStatus: {
    currentlyImplemented: [
      "server-authoritative 100-yen purchase and affordability check",
      "atomic Yen debit, purchase ledger, and Winning Can inventory grant",
      "source-native M_DJUC drinking motions and original can models",
      "CAN1-equivalent attachment to AKIR model-control 18 during drinking",
    ],
    unresolved: [
      "mapping sound frames from the long DJHN cinematic motions onto the browser's separate AKI_IRERU_COIN, AKI_TORU_JUICE, and AKI_NOMU_JUICE motions",
      "browser playback of AUTH cues remains disabled until that cross-motion mapping is proven",
      "full AUTH camera, Yukawa, dialogue, and branch staging",
      "native free-roam CAN1 grip arguments, pickup/release frame events and flight controller (browser uses the verified cinematic grip and separately staged release/flight)",
      "animated native refund branch; failed server transactions never debit",
    ],
  },
  failures,
  status: failures.length === 0 ? "verified" : "failed",
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.status}: ${authoredSequences.length} AUTH sequences, `
  + `${authoredSequences.reduce(
    (sum, sequence) => sum + sequence.motions.length,
    0,
  )} exact motion events, ${authoredSequences.reduce(
    (sum, sequence) => sum + sequence.sounds.length,
    0,
  )} exact sound events`,
);
if (failures.length > 0) process.exitCode = 1;
