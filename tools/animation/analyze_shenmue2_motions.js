#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Shenmue2MotLoader } from "../../src/Shenmue2MotLoader.js";

const motionDirectory = path.resolve(
  process.argv[2] || "play/assets/shenmue2-motion",
);
const executablePath = path.resolve(
  process.argv[3] || ".disc-work/shenmue2-disc1-native/1ST_READ.BIN",
);
const outputPath = path.resolve(
  process.argv[4] || "tools/evidence/shenmue2-motion-format.json",
);
const xboxExecutablePath = path.resolve(
  process.argv[5]
    || ".disc-work/shenmue2-xbox-extracted/Shenmue II/Default.xbe",
);
const selectorTracePath = path.resolve(
  process.argv[6] || "captures/analysis/s2-motion-selector-entry.csv",
);

const DREAMCAST_EXECUTABLE_BASE = 0x8c010000;

function executableOffset(virtualAddress) {
  const offset = virtualAddress - DREAMCAST_EXECUTABLE_BASE;
  if (offset < 0 || offset >= executable.length) {
    throw new RangeError(
      `Dreamcast address 0x${virtualAddress.toString(16)} is outside 1ST_READ.BIN`,
    );
  }
  return offset;
}

function executableU16(virtualAddress) {
  return executable.readUInt16LE(executableOffset(virtualAddress));
}

function executableU32(virtualAddress) {
  return executable.readUInt32LE(executableOffset(virtualAddress));
}

function nativeSlotTraceEvidence() {
  if (!fs.existsSync(selectorTracePath)) return null;
  const bytes = fs.readFileSync(selectorTracePath);
  const [header, ...lines] = bytes.toString("utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  const columnIndex = new Map(columns.map((name, index) => [name, index]));
  const field = (row, name) => row[columnIndex.get(name)];
  const rows = lines.map((line) => line.split(","));
  const observations = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      field(row, "pc") !== "8c0ed120"
      || field(row, "pr") !== "8c0ef2e8"
      || field(row, "r9") !== "00000004"
      || !field(row, "r4").startsWith("000080")
    ) continue;
    for (
      let nextIndex = index + 1;
      nextIndex < Math.min(rows.length, index + 100);
      nextIndex += 1
    ) {
      const next = rows[nextIndex];
      if (
        field(next, "pc") !== "8c0ed160"
        || field(next, "r10") !== field(row, "r10")
      ) continue;
      observations.push({
        actorRuntimeAddress: `0x${field(row, "r10")}`,
        slot: Number.parseInt(field(row, "r9"), 16),
        retainedMotionId: `0x${field(row, "r4").slice(-4)}`,
        subsequentlyEvaluatedMotionId: `0x${field(next, "r5").slice(-4)}`,
        cycleDelta: Number(field(next, "cycles")) - Number(field(row, "cycles")),
      });
      break;
    }
  }
  return {
    filename: path.basename(selectorTracePath),
    byteLength: bytes.length,
    sha256: sha256(bytes),
    observations,
  };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function bankEvidence(filename) {
  const bytes = fs.readFileSync(path.join(motionDirectory, filename));
  const parsed = Shenmue2MotLoader.parse(bytes);
  let duplicateInteriorFrameCurveCount = 0;
  let separateOutgoingTangentKeyCount = 0;
  let keyCount = 0;
  for (const sequence of parsed.sequences) {
    for (const curve of sequence.curves || []) {
      const interior = curve.samples.slice(1, -1);
      const frames = new Set();
      if (interior.some(({ frame }) => {
        if (frames.has(frame)) return true;
        frames.add(frame);
        return false;
      })) duplicateInteriorFrameCurveCount += 1;
      for (const sample of curve.samples) {
        keyCount += 1;
        if (sample.hasSeparateOutgoingTangent) {
          separateOutgoingTangentKeyCount += 1;
        }
      }
    }
  }
  return {
    filename,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    sequenceCount: parsed.header.sequenceCount,
    uniqueSequenceDataCount: new Set(
      parsed.sequences.map(({ dataOffset }) => dataOffset),
    ).size,
    validSequenceCount: parsed.sequences.filter(({ valid }) => valid).length,
    nativeMotionIdRange: {
      lowerExclusive: `0x${parsed.header.motionIdLowerBound.toString(16)}`,
      upperExclusive: `0x${parsed.header.motionIdUpperBound.toString(16)}`,
      first: `0x${(parsed.header.motionIdLowerBound + 1).toString(16)}`,
      last: `0x${(parsed.header.motionIdUpperBound - 1).toString(16)}`,
    },
    keyCount,
    separateOutgoingTangentKeyCount,
    duplicateInteriorFrameCurveCount,
  };
}

const executable = fs.readFileSync(executablePath);
const xboxExecutable = fs.readFileSync(xboxExecutablePath);
// The audited Xbox .rdata section maps these virtual addresses with
// rawOffset = virtualAddress - 0xd280.
const xboxWords = (virtualAddress, count) => Array.from(
  { length: count },
  (_, index) => xboxExecutable.readUInt16LE(
    virtualAddress - 0xd280 + index * 2,
  ),
);
const evidence = {
  schema: "new-yokosuka-shenmue2-compact-motion-evidence-v6",
  executable: {
    filename: path.basename(executablePath),
    byteLength: executable.length,
    sha256: sha256(executable),
  },
  xboxExecutable: {
    filename: path.basename(xboxExecutablePath),
    byteLength: xboxExecutable.length,
    sha256: sha256(xboxExecutable),
  },
  nativeFunctions: {
    compactCurveReader: "0x8c1cda80",
    compactCurveSkipper: "0x8c1cddb0",
    halfFloatDecoder: "0x8c1ce0e0",
    encodedMotionResolver: "0x8c04de78",
    xboxCompactControllerEvaluator: "0x1abd50",
    xboxMotionFamilyResolver: "0x58b4c",
    xboxSteadyLocomotionSelector: "0x60ed3",
    xboxAlternateLocomotionSelector: "0x60ef0",
    xboxLocomotionTransitionSelector: "0x60f0d",
    xboxProfileSelector: "0x6129d",
    xboxIdleSelector: "0x612e4",
    xboxNpcOpcodeDispatcher: "0x5efd6",
    xboxNpcOpcode2dCase: "0x5f89a",
    xboxActorMotionLayerInstaller: "0x5be43",
    xboxActorMotionLayerEvaluator: "0x5bea8",
    xboxRequestMotionSlot: "0x5307b",
    xboxSetMotionSlotPlaybackPosition: "0x53359",
    buildCompactMotionSlotPointers: "0x8c0ef9a0",
    updateMotionSlots: "0x8c0ef220",
    dispatchMotionSlot: "0x8c1cd920",
    applyAllMotionSlots: "0x8c1ce2e0",
  },
  format: {
    framesPerSecond: 30,
    controllerCount: 22,
    rootTranslationChannels: ["x", "y", "z"],
    controllerRotationChannels: ["rx", "ry", "rz"],
    curveCount: 69,
    sequenceHeaderByteLength: 78,
    interiorCountEncoding: "69 unsigned bytes followed by one alignment byte",
    keyEncoding: [
      "uint16 value word",
      "uint16 incoming/shared tangent word",
      "optional uint16 outgoing tangent when value word bit zero is set",
    ],
    timing: (
      "first and last frames implicit; interior frames are uint16; the final "
      + "implicit key is durationFrames - 1, matching native frame indexing"
    ),
    interpolation: "cubic Hermite with tangents scaled to seconds at 30 Hz",
  },
  selectorEvidence: [
    { motionId: "0x80c3", bank: "NPC.MOT", sequenceIndex: 194 },
    { motionId: "0x80d1", bank: "NPC.MOT", sequenceIndex: 208 },
    { motionId: "0xe024", bank: "NPC_TBL.MOT", sequenceIndex: 35 },
    { motionId: "0xf03e", bank: "MOTION.MOT", sequenceIndex: 61 },
  ],
  nativeMotionSlots: {
    count: 5,
    updateLoop: {
      function: "0x8c0ef220",
      prologueWords: Array.from({ length: 8 }, (_, index) => (
        `0x${executableU16(0x8c0ef220 + index * 2)
          .toString(16).padStart(4, "0")}`
      )),
      structureOffsets: {
        flags: `0x${executableU16(0x8c0ef37c).toString(16)}`,
        currentMotionIds: `0x${executableU16(0x8c0ef380).toString(16)}`,
        requestedMotionIds: `0x${executableU16(0x8c0ef37e).toString(16)}`,
        blendCounters: `0x${executableU16(0x8c0ef384).toString(16)}`,
        blendDurations: `0x${executableU16(0x8c0ef382).toString(16)}`,
      },
      defaultBlendFrames: 8,
      defaultBlendFrameInstructions: ["0x8c0ef452", "0x8c0ef78c"],
    },
    dispatcher: {
      function: "0x8c1cd920",
      poseBufferOffsets: [0x8, 0x0e18, 0x11a8, 0x1578, 0x1af8]
        .map((value) => `0x${value.toString(16)}`),
      slot34Installer: `0x${executableU32(0x8c1cda4c).toString(16)}`,
      slot4InstallerFlag: "input flags OR 0x4",
      applicationOrder: [0, 1, 2, 3, 4],
      conclusion: [
        "slot 4 is a retained, separately evaluated pose buffer",
        "slot 4 is applied after the ordinary locomotion slots",
        "a slot-4 schedule pose must not replace the active locomotion clip",
        "actor motion layers select native slots 1 through 4 with mask bits 0x02 through 0x10",
      ],
    },
    runtimeTrace: nativeSlotTraceEvidence(),
  },
  nativeActorMotionLayers: {
    opcode2dCommandWords: ["opcode 0x2d", "uint16 motion ID", "flags"],
    actorLayerIndex: 1,
    layerRecordOffset: "0x2c0",
    layerRecordStride: 8,
    motionIdOffsetWithinLayer: 2,
    controllerGroupMask: "flags & 0x1e",
    nativeSlotBits: {
      "0x02": 1,
      "0x04": 2,
      "0x08": 3,
      "0x10": 4,
    },
    precedence: (
      "earlier actor layers remove their controller-group bits from later "
      + "layers before each selected native motion slot is requested"
    ),
    ordinaryCompactCurvePartitions: {
      sourceFunction: "0x8c0ef9a0",
      curveCountsBySlot: [27, 9, 9, 12, 12],
      controllerIndicesBySlot: [
        [0, 1, 2, 3, 4, 5, 6, 7],
        [8, 9, 10],
        [11, 12, 13],
        [14, 15, 16, 17],
        [18, 19, 20, 21],
      ],
      slot4CurveRange: [57, 68],
      note: (
        "curve indices 0..2 are root XYZ; subsequent triplets are compact "
        + "controller rotations"
      ),
    },
  },
  nativeNpcSelectors: {
    bodyFamilyTableVirtualAddress: "0x4ec000",
    bodyFamilyTable: Array.from(
      xboxExecutable.subarray(0x4ec000 - 0xd280, 0x4ec000 - 0xd280 + 97),
      (value, bodyValue) => ({
        bodyValue,
        motionFamilyIndex: value > 0x7f ? value - 0x100 : value,
      }),
    ),
    steadyLocomotion: {
      function: "0x60ed3",
      tableVirtualAddress: "0x4ec158",
      motionIds: xboxWords(0x4ec158, 16).map((value) => (
        `0x${value.toString(16).padStart(4, "0")}`
      )),
    },
    alternateLocomotion: {
      function: "0x60ef0",
      tableVirtualAddress: "0x4ec178",
      motionIds: xboxWords(0x4ec178, 16).map((value) => (
        `0x${value.toString(16).padStart(4, "0")}`
      )),
    },
    transition: {
      function: "0x60f0d",
      note: "jump-table selector; family 8 is model-name dependent",
      motionIds: [
        0xf03f, 0xf05f, 0xf07f, 0xf057,
        0xf09f, 0xf0d2, 0xf061, 0xf087,
        null, 0xf079, 0xf059, 0xf0a8,
        0xf0a5, 0xf0a7, 0xf0ea, 0xf085,
      ].map((value) => value === null
        ? null
        : `0x${value.toString(16).padStart(4, "0")}`),
    },
    profileIdle: {
      function: "0x612e4",
      tableVirtualAddress: "0x4ec588",
      dimensions: ["modelVariant:3", "ageSexCategory:6", "subtype:3"],
      fallbackMotionId: "0x8023",
      motionIds: xboxWords(0x4ec588, 54).map((value) => (
        `0x${value.toString(16).padStart(4, "0")}`
      )),
    },
  },
  banks: [
    bankEvidence("NPC.MOT"),
    bankEvidence("NPC_TBL.MOT"),
    bankEvidence("MOTION.MOT"),
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...evidence }, null, 2));
