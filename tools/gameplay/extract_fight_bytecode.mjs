#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFightBytecode,
  traceFightActionPath,
} from "../../src/FightBytecode.js";
import { MotnLoader } from "../../src/MotnLoader.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceRootCandidates = [
  process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_disc3_v2"),
].filter(Boolean);
const sourceRoot = sourceRootCandidates.find(existsSync);
if (!sourceRoot) {
  throw new Error(
    `Disc 3 extraction not found. Tried: ${sourceRootCandidates.join(", ")}`,
  );
}

const sourcePath = path.join(
  sourceRoot,
  "data/SCENE/03/MFBT/EN_RYOU.BIN",
);
const motionPath = path.join(sourceRoot, "data/MOTION/MOTION.BIN");
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "tools/evidence/ryo-fight-bytecode.json");
const sourceBytes = readFileSync(sourcePath);
const parsed = parseFightBytecode(sourceBytes);
const requestedSequenceIndices = [
  ...new Set(parsed.motionRequests.map(({ sequenceIndex }) => sequenceIndex)),
];
const motionBytes = readFileSync(motionPath);
const motion = MotnLoader.parse(motionBytes, {
  sequenceIndices: requestedSequenceIndices,
});
const sequenceByIndex = new Map(
  motion.sequences.map((sequence) => [sequence.index, sequence]),
);
const sha256 = (bytes) => (
  createHash("sha256").update(bytes).digest("hex")
);
const hex = (value, width = 8) => (
  `0x${value.toString(16).padStart(width, "0")}`
);
const motionRequests = parsed.motionRequests.map((request) => {
  const sequence = sequenceByIndex.get(request.sequenceIndex);
  return {
    ...request,
    fileOffsetHex: hex(request.fileOffset),
    scriptRelativeOffsetHex: hex(request.scriptRelativeOffset),
    rawRequestHex: hex(request.rawRequest),
    requestFlagsHex: hex(request.requestFlags, 4),
    motionIdFlagsHex: hex(request.motionIdFlags, 4),
    encodedMotionIdHex: hex(request.encodedMotionId, 4),
    motionIdHex: hex(request.motionId, 4),
    sequence: sequence
      ? {
        index: sequence.index,
        name: sequence.name,
        durationFrames: sequence.durationFrames,
        complete: Boolean(sequence.valueData?.complete),
      }
      : null,
  };
});
const tigerKnuckleRequest = motionRequests.find((request) => (
  request.fileOffset === 0x03bc
  && request.motionId === 0x0318
));
if (
  tigerKnuckleRequest?.sequence?.name
  !== "AKI_AKI_BATTLE_PANCH_JAB"
) {
  throw new Error("Native Tiger Knuckle terminal request was not recovered.");
}

const resolvedActionPath = (startFileOffset, selector) => {
  const traced = traceFightActionPath(sourceBytes, {
    startFileOffset,
    selector,
    scriptOffset: parsed.header.scriptOffset,
    commandOffset: parsed.header.commandOffset,
  });
  const request = motionRequests.find((candidate) => (
    candidate.fileOffset === traced.terminal?.fileOffset
  ));
  if (!request) {
    throw new Error(
      `No resolved motion terminal from 0x${
        startFileOffset.toString(16)
      } for selector ${selector}.`,
    );
  }
  return {
    inputSelector: selector,
    startFileOffset,
    terminalFileOffset: request.fileOffset,
    continuationFileOffset: traced.continuationFileOffset,
    motionId: request.motionId,
    sequence: request.sequence,
    instructionOffsets: traced.instructions.map(
      (instruction) => instruction.fileOffset,
    ),
  };
};

// The dynamic X trace proves Tiger Knuckle resumes at file 0x03c4. From
// there, selector 2 is the leg continuation and each opcode-0x0d target
// recovers the complete native J,K,K,K string.
const tigerStringHand = resolvedActionPath(0x03c4, 1);
const tigerStringKick = resolvedActionPath(0x03c4, 2);
const tigerStringKick2 = resolvedActionPath(
  tigerStringKick.continuationFileOffset,
  2,
);
const tigerStringKick3 = resolvedActionPath(
  tigerStringKick2.continuationFileOffset,
  2,
);
const motionRequestByOffset = new Map(motionRequests.map(
  (request) => [request.fileOffset, request],
));
const verifiedString = (input, terminalFileOffsets) => ({
  input,
  stages: terminalFileOffsets.map((terminalFileOffset) => {
    const request = motionRequestByOffset.get(terminalFileOffset);
    if (!request?.sequence) {
      throw new Error(
        `String terminal 0x${terminalFileOffset.toString(16)} has no motion.`,
      );
    }
    return {
      terminalFileOffset,
      motionId: request.motionId,
      motionIdFlags: request.motionIdFlags,
      sequence: request.sequence,
    };
  }),
});

const evidence = {
  schema: "new-yokosuka-fight-bytecode-v1",
  generatedBy: "tools/gameplay/extract_fight_bytecode.mjs",
  provenance: {
    source: path.relative(repoRoot, sourcePath),
    byteLength: sourceBytes.length,
    sha256: sha256(sourceBytes),
    globalMotionSource: path.relative(repoRoot, motionPath),
    globalMotionSha256: sha256(motionBytes),
    runtimeContainer: {
      signature: "FIGHT",
      wrapperByteLength: 0x34,
      wrappedByteLength: sourceBytes.length + 0x34,
      payloadIdentity: (
        "EN_RYOU.BIN+0x14 through EOF exactly matches the captured "
        + "runtime FIGHT payload at 0x0cabcd94"
      ),
    },
  },
  fighterKind: parsed.fighterKind,
  header: parsed.header,
  sections: parsed.sections,
  entryDispatch: parsed.entryDispatch,
  commandRecordCount: parsed.commandRecords.length,
  commandRecords: parsed.commandRecords,
  motionRequestCount: motionRequests.length,
  motionRequests,
  verifiedPaths: {
    tigerKnuckle: {
      input: "Dreamcast X",
      entrySelector: 1,
      nativeMoveCode: 0,
      dynamicTraceFighterBase: "0x0cabfba0",
      terminalOpcode: 5,
      terminalFileOffset: tigerKnuckleRequest.fileOffset,
      motionId: tigerKnuckleRequest.motionId,
      sequence: tigerKnuckleRequest.sequence,
    },
    crescentKick: {
      input: "Dreamcast A",
      entrySelector: 2,
      dynamicTraceFighterBase: "0x0cabfba0",
      terminalOpcode: 5,
      terminalFileOffset: 0x0928,
      motionId: 0x0366,
      sequence: motionRequests.find(
        (request) => request.fileOffset === 0x0928,
      )?.sequence || null,
    },
    bigWheelExpert: {
      input: "Dreamcast X+A simultaneous",
      entrySelector: 3,
      dynamicTraceFighterBase: "0x0cabfba0",
      terminalOpcode: 5,
      terminalFileOffset: 0x11c8,
      motionId: 0x0593,
      sequence: motionRequests.find(
        (request) => request.fileOffset === 0x11c8,
      )?.sequence || null,
    },
    throwAcquisition: {
      input: "Dreamcast B",
      entrySelector: 4,
      dynamicTraceFighterBase: "0x0cabfba0",
      distanceDiscriminator: {
        opcode: 0x1b,
        fileOffset: 0x0e4c,
        rawFixed16_16: 0x00016666,
        distance: 0x00016666 / 0x10000,
        comparison: "opponentDistance < distance",
        shortRequestFileOffset: 0x0e58,
        longFallbackRequestFileOffset: 0x0e64,
      },
      rangeBranches: [
        {
          terminalFileOffset: 0x0e58,
          motionId: 0x05d9,
          sequence: motionRequests.find(
            (request) => request.fileOffset === 0x0e58,
          )?.sequence || null,
        },
        {
          terminalFileOffset: 0x0e64,
          motionId: 0x05e4,
          sequence: motionRequests.find(
            (request) => request.fileOffset === 0x0e64,
          )?.sequence || null,
        },
      ],
    },
    tigerMaelstrom: {
      input: [
        "Dreamcast X",
        "Dreamcast A",
        "Dreamcast A",
        "Dreamcast A",
      ],
      initial: {
        terminalFileOffset: tigerKnuckleRequest.fileOffset,
        motionId: tigerKnuckleRequest.motionId,
        sequence: tigerKnuckleRequest.sequence,
        continuationFileOffset: 0x03c4,
      },
      stages: [
        tigerStringKick,
        tigerStringKick2,
        tigerStringKick3,
      ],
      alternateFirstContinuation: tigerStringHand,
    },
  },
  verifiedStrings: {
    tigerFlurry: verifiedString(
      ["hand", "hand", "hand", "hand", "hand", "hand", "hand", "hand"],
      [0x03bc, 0x03ec, 0x04d4, 0x0580, 0x05b8, 0x05e0, 0x0608, 0x0624],
    ),
    katanaRush: verifiedString(
      ["hand", "hand", "up", "hand", "hand"],
      [0x03bc, 0x03ec, 0x0484, 0x04a8],
    ),
    flyingKneeFourHitter: verifiedString(
      ["hand", "hand", "up", "hand", "leg"],
      [0x03bc, 0x03ec, 0x0484, 0x04b8],
    ),
    tigersRage: verifiedString(
      ["hand", "hand", "leg"],
      [0x03bc, 0x03ec, 0x0550],
    ),
    eyeOfTheTigerStorm: verifiedString(
      ["hand", "hand", "hand", "leg"],
      [0x03bc, 0x03ec, 0x04d4, 0x0590],
    ),
    theReaper: verifiedString(
      ["hand", "hand", "down", "leg", "leg", "leg"],
      [0x03bc, 0x03ec, 0x04fc, 0x0524, 0x0540],
    ),
    tigerMaelstrom: verifiedString(
      ["hand", "leg", "leg", "leg"],
      [0x03bc, 0x0404, 0x042c, 0x0448],
    ),
    crescentCyclone: verifiedString(
      ["leg", "leg", "leg"],
      [0x0928, 0x0a44, 0x0a60],
    ),
    tigerClaw: verifiedString(
      ["leg", "hand", "hand", "hand", "hand", "hand", "hand"],
      [0x0928, 0x0958, 0x0988, 0x09c0, 0x09e8, 0x0a10, 0x0a2c],
    ),
    whirlingFury: verifiedString(
      ["leg", "hand", "leg"],
      [0x0928, 0x0958, 0x0998],
    ),
  },
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(repoRoot, outputPath)}: `
  + `${parsed.commandRecords.length} commands, `
  + `${motionRequests.length} motion requests`,
);
