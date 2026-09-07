#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MotnLoader } from "../../src/MotnLoader.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceRootCandidates = [
  process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_disc3_v2"),
].filter(Boolean);
const captureRootCandidates = [
  process.env.SHENMUE_CAPTURE_ROOT,
  path.join(repoRoot, "captures"),
].filter(Boolean);
const sourceRoot = sourceRootCandidates.find(existsSync);
const captureRoot = captureRootCandidates.find(existsSync);
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "tools/evidence/combat-motion-manifest.json");

if (!sourceRoot) {
  throw new Error(
    `Disc 3 extraction not found. Tried: ${sourceRootCandidates.join(", ")}`,
  );
}
if (!captureRoot) {
  throw new Error(
    `Capture root not found. Tried: ${captureRootCandidates.join(", ")}`,
  );
}

const battleRoot = path.join(sourceRoot, "data/SCENE/03/MFBT");
const motionPath = path.join(battleRoot, "M_FGT1.BIN");
const globalMotionPath = path.join(sourceRoot, "data/MOTION/MOTION.BIN");
const soundBankPath = path.join(
  sourceRoot,
  "data/SCENE/03/SOUND/BATTLE_1.SND",
);
const ramPath = path.join(
  captureRoot,
  "pvr/20260728-181223-frame-78778/ram.bin",
);
for (const required of [
  motionPath,
  globalMotionPath,
  soundBankPath,
  ramPath,
]) {
  if (!existsSync(required)) throw new Error(`Required source missing: ${required}`);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const motionBytes = readFileSync(motionPath);
const motion = MotnLoader.parse(motionBytes);
const globalMotionBytes = readFileSync(globalMotionPath);
const globalMotion = MotnLoader.parse(globalMotionBytes);
const soundBankBytes = readFileSync(soundBankPath);
const ram = readFileSync(ramPath);
const dreamcastRamBase = 0x0c000000;

function playableDTPKCommands(bank) {
  const commands = new Set();
  const sequenceOffset = bank.readUInt32LE(0x2c);
  const groupCount = bank.readUInt32LE(sequenceOffset) + 1;
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const descriptorWord = bank.readUInt32LE(
      sequenceOffset + 4 + groupIndex * 4,
    );
    const groupOffset = descriptorWord & 0xffff;
    const trackCount = bank.readUInt32LE(
      sequenceOffset + groupOffset,
    ) + 1;
    for (let track = 0; track < trackCount; track += 1) {
      const trackOffset = bank.readUInt32LE(
        sequenceOffset + groupOffset + 4 + track * 4,
      );
      const entryType = bank[sequenceOffset + trackOffset + 1];
      if (![0xdc, 0xdd, 0xde, 0xdf].includes(entryType)) continue;
      commands.add(
        `${
          (descriptorWord >>> 16).toString(16).padStart(4, "0")
        }${track.toString(16).padStart(2, "0")}00`,
      );
    }
  }
  return commands;
}
const validCombatSoundCommands = playableDTPKCommands(soundBankBytes);
function nativeSoundCues(sequence) {
  return (sequence.actionMetadata?.soundCues || []).filter(
    ({ commandHex }) => validCombatSoundCommands.has(
      commandHex.toLowerCase(),
    ),
  );
}

function locate(text) {
  const offset = ram.indexOf(Buffer.from(text, "ascii"));
  if (offset < 0) throw new Error(`RAM anchor not found: ${text}`);
  return offset;
}

function asciiStrings(start, end, minimumLength = 5) {
  const strings = [];
  for (let offset = start; offset < end;) {
    while (
      offset < end
      && (ram[offset] < 0x20 || ram[offset] > 0x7e)
    ) {
      offset += 1;
    }
    const stringOffset = offset;
    while (
      offset < end
      && ram[offset] >= 0x20
      && ram[offset] <= 0x7e
    ) {
      offset += 1;
    }
    if (offset - stringOffset >= minimumLength) {
      strings.push({
        offset: stringOffset,
        runtimeAddress: dreamcastRamBase + stringOffset,
        text: ram.subarray(stringOffset, offset).toString("ascii"),
      });
    }
  }
  return strings;
}

const categoryRegions = [
  ["hand", "Tiger Knuckle", "Crescent Kick"],
  ["leg", "Crescent Kick", "Overthrow"],
  ["throw", "Overthrow", "The Tiger Knuckle"],
];
const moveNames = categoryRegions.flatMap(([category, start, end]) => (
  asciiStrings(locate(start), locate(end))
    .filter(({ text }) => /^[A-Za-z][A-Za-z ]+$/.test(text))
    .map((entry) => ({ ...entry, category }))
));
const descriptions = asciiStrings(
  locate("The Tiger Knuckle"),
  locate("No Set DefaultWeatherArea"),
  20,
).map((entry) => ({
  ...entry,
  text: entry.text.replace(/\s+/g, " ").trim(),
}));

if (moveNames.length !== 51 || descriptions.length !== moveNames.length) {
  throw new Error(
    `Unexpected move catalogue: ${moveNames.length} names, `
    + `${descriptions.length} descriptions`,
  );
}

// Each category has:
// - a 12-byte move record table (JP pointer, EN pointer, command index);
// - a pointer array for the rendered WAZA.FON command glyph strings; and
// - a parallel seven-byte engine command record (length plus six opcodes).
const commandPointerTables = Object.freeze({
  hand: Object.freeze({
    recordOffset: 0x29fe7c,
    recordCount: 19,
    pointerOffset: 0x29ff60,
    pointerCount: 17,
    compactOffset: 0x29ffa4,
  }),
  leg: Object.freeze({
    recordOffset: 0x2a001c,
    recordCount: 18,
    pointerOffset: 0x2a00f4,
    pointerCount: 16,
    compactOffset: 0x2a0134,
  }),
  throw: Object.freeze({
    recordOffset: 0x2a01a4,
    recordCount: 14,
    pointerOffset: 0x2a024c,
    pointerCount: 14,
    compactOffset: 0x2a0284,
  }),
});
const commandGlyphs = Object.fromEntries(Object.entries(commandPointerTables)
  .map(([category, table]) => {
    const entries = Array.from({ length: table.pointerCount }, (_, index) => {
      const pointer = ram.readUInt32LE(table.pointerOffset + index * 4);
      const offset = pointer - dreamcastRamBase;
      if (offset < 0 || offset >= ram.length) {
        throw new Error(
          `${category} command ${index} has invalid pointer 0x${
            pointer.toString(16)
          }`,
        );
      }
      let end = offset;
      while (end < ram.length && ram[end] !== 0) end += 1;
      const bytes = [...ram.subarray(offset, end)];
      return {
        pointer,
        bytes,
        hex: bytes.map((value) => value.toString(16).padStart(2, "0")).join(""),
      };
    });
    return [category, entries];
  }));
const moveRecords = Object.fromEntries(Object.entries(commandPointerTables)
  .map(([category, table]) => [
    category,
    Array.from({ length: table.recordCount }, (_, index) => {
      const offset = table.recordOffset + index * 12;
      return {
        japaneseNamePointer: ram.readUInt32LE(offset),
        englishNamePointer: ram.readUInt32LE(offset + 4),
        commandIndex: ram.readUInt32LE(offset + 8),
      };
    }),
  ]));
const knownCommandGlyphs = Object.freeze({
  // Verified against the native Moves Scroll rendering. These are vertical
  // arrows, not left/right arrows.
  b0ce: "up",
  b0d8: "down",
  b0e6: "plus",
  b0e9: "hand",
  b0ed: "leg",
  b1ef: "throw",
  b2b0: "run",
  b4aa: "guard",
  b1f8: "position:b1f8",
  b2ab: "position:b2ab",
});
const compactCommandTokens = Object.freeze({
  0: "hand",
  1: "leg",
  2: "up",
  3: "down",
  4: "run",
  5: "throw",
  6: "guard",
  7: "plus",
});
const compactCommandGlyphs = Object.freeze({
  0: "b0e9",
  1: "b0ed",
  2: "b0ce",
  3: "b0d8",
  4: "b2b0",
  5: "b1ef",
  6: "b4aa",
  7: "b0e6",
});
const compactCommands = Object.fromEntries(Object.entries(commandPointerTables)
  .map(([category, table]) => [
    category,
    Array.from({ length: table.pointerCount }, (_, index) => {
      const offset = table.compactOffset + index * 7;
      const bytes = [...ram.subarray(offset, offset + 7)];
      const tokenCount = bytes[0];
      if (tokenCount < 1 || tokenCount > 6) {
        throw new Error(
          `${category} compact command ${index} has length ${tokenCount}`,
        );
      }
      const opcodes = bytes.slice(1, tokenCount + 1);
      for (const opcode of opcodes) {
        if (!compactCommandTokens[opcode]) {
          throw new Error(
            `${category} compact command ${index} has opcode ${opcode}`,
          );
        }
      }
      return {
        runtimeAddress: dreamcastRamBase + offset,
        bytes,
        tokenCount,
        opcodes,
        tokens: opcodes.map((opcode) => compactCommandTokens[opcode]),
      };
    }),
  ]));

// FUN_0c1b1dd4 resolves a one-based category plus canonical move index
// through this pointer table. Each 12-byte definition supplies the global
// MOTION.BIN sequence ID at +4, or the +6 alternative once proficiency is
// greater than 0x37.
const moveDefinitionPointerOffset = 0x29fd4c;
const moveDefinitionTables = Object.freeze({
  hand: Object.freeze({
    categoryId: 1,
    offset: 0x29fae8,
    count: 19,
  }),
  leg: Object.freeze({
    categoryId: 2,
    offset: 0x29fbcc,
    count: 18,
  }),
  throw: Object.freeze({
    categoryId: 3,
    offset: 0x29fca4,
    count: 14,
  }),
});
for (const [category, table] of Object.entries(moveDefinitionTables)) {
  const pointer = ram.readUInt32LE(
    moveDefinitionPointerOffset + table.categoryId * 4,
  );
  const expected = dreamcastRamBase + table.offset;
  if (pointer !== expected) {
    throw new Error(
      `${category} move definitions point to 0x${pointer.toString(16)}, `
      + `expected 0x${expected.toString(16)}`,
    );
  }
}
const moveDefinitions = Object.fromEntries(Object.entries(moveDefinitionTables)
  .map(([category, table]) => [
    category,
    Array.from({ length: table.count }, (_, index) => {
      const offset = table.offset + index * 12;
      const words = Array.from(
        { length: 6 },
        (_, wordIndex) => ram.readUInt16LE(offset + wordIndex * 2),
      );
      const primaryMotionId = words[2];
      const highProficiencyMotionId = words[3] || null;
      // The process-wide registered range is (0x0000, 0x0618), with
      // exclusive bounds and one-based request IDs.
      const primary = globalMotion.sequences[primaryMotionId - 1];
      const highProficiency = highProficiencyMotionId === null
        ? null
        : globalMotion.sequences[highProficiencyMotionId - 1];
      if (
        !primary
        || primary.index !== primaryMotionId - 1
        || !primary.valueData?.complete
      ) {
        throw new Error(
          `${category} move ${index} has invalid primary motion `
          + `0x${primaryMotionId.toString(16)}`,
        );
      }
      if (
        highProficiencyMotionId !== null
        && (
          !highProficiency
          || highProficiency.index !== highProficiencyMotionId - 1
          || !highProficiency.valueData?.complete
        )
      ) {
        throw new Error(
          `${category} move ${index} has invalid high-proficiency motion `
          + `0x${highProficiencyMotionId.toString(16)}`,
        );
      }
      const sequenceEvidence = (motionId, sequence) => sequence && ({
        motionId,
        sequenceIndex: sequence.index,
        name: sequence.name,
        durationFrames: sequence.durationFrames,
        actionMetadataOffset: sequence.actionMetadataOffset,
        nativeSoundCues: nativeSoundCues(sequence),
        directHitPhaseFrames:
          sequence.actionMetadata?.directHitPhaseFrames || null,
        directAttackParameters:
          sequence.actionMetadata?.directAttackParameters || null,
        embeddedHitPhaseFrames:
          sequence.actionMetadata?.embeddedHitPhaseFrames || null,
        embeddedAttackParameters:
          sequence.actionMetadata?.embeddedAttackParameters || null,
        dataOffset: sequence.dataOffset,
        dataLength: sequence.rawDataLength,
        complete: Boolean(sequence.valueData?.complete),
      });
      return {
        runtimeAddress: dreamcastRamBase + offset,
        rawWords: words,
        flags0: words[0],
        flags1: words[1],
        primary: sequenceEvidence(primaryMotionId, primary),
        highProficiency: sequenceEvidence(
          highProficiencyMotionId,
          highProficiency,
        ),
        moveCode: words[4],
        trailingWord: words[5],
      };
    }),
  ]));

const throwVictimMotionNames = Object.freeze({
  "Swallow Flip": "YKI_AKI_NGR_INASI",
  Overthrow: "YKI_AKI_NGR_SEOI",
  "Sweep Throw": "YKI_AKI_NGR_UCH",
  "Vortex Throw": "YKI_AKI_NGR_JUDO_TM",
  "Mist Reaper": "YKI_AKI_NGR_JUDO_OG",
  "Demon Drop": "YKI_AKI_NGR_MAKINAGE",
  "Shoulder Buster": "YKI_AKI_NGR_WUDE1",
  "Tengu Drop": "YKI_AKI_NGR_BKFRIP",
  DarksideHazuki: "YKI_AKI_NAGERARE_YOKO1_R",
  BackTwistDrop: "YKI_AKI_NAGERARE_BACK1_BD",
  "Shadow Step": "YKI_AKI_NGR_MRK1",
  "Arm Break Fire": "YKI_AKI_NGR_SP1_ELB",
  "Tiger Storm": "YKI_AKI_NGR_HED_1",
  "Shadow Blade": "YKI_AKI_NGR_MRK1",
  "Cross Charge": "YKI_AKI_NGR_FROU",
});
const highProficiencyVictimMotionNames = Object.freeze({
  "Tiger Storm": "YKI_AKI_NGR_HED_2_S1",
});
function globalSequenceEvidence(name) {
  if (!name) return null;
  const sequence = globalMotion.sequences.find(
    (candidate) => candidate.name === name,
  );
  if (!sequence?.valueData?.complete) {
    throw new Error(`Global victim motion is missing or incomplete: ${name}`);
  }
  return {
    sequenceIndex: sequence.index,
    name: sequence.name,
    durationFrames: sequence.durationFrames,
    actionMetadataOffset: sequence.actionMetadataOffset,
    nativeSoundCues: nativeSoundCues(sequence),
    dataOffset: sequence.dataOffset,
    dataLength: sequence.rawDataLength,
    complete: true,
  };
}

const readBigEndianU32 = (bytes, offset) => bytes.readUInt32BE(offset);
const enemyFiles = readdirSync(battleRoot)
  .filter((name) => /^EN_.*\.BIN$/i.test(name))
  .sort()
  .map((name) => {
    const bytes = readFileSync(path.join(battleRoot, name));
    return {
      name,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      headerWordsBigEndian: Array.from(
        { length: Math.min(5, Math.floor(bytes.length / 4)) },
        (_, index) => readBigEndianU32(bytes, index * 4),
      ),
    };
  });

const enRyouPath = path.join(battleRoot, "EN_RYOU.BIN");
const enRyouBytes = readFileSync(enRyouPath);
function confirmedEnMotionRequest(offset, expectedName) {
  if (
    enRyouBytes[offset] !== 0x05
    || enRyouBytes.readUIntBE(offset + 1, 3) !== 0
  ) {
    throw new Error(
      `EN_RYOU expected motion request is missing at 0x${
        offset.toString(16)
      }`,
    );
  }
  const request = enRyouBytes.readUInt32BE(offset + 4);
  const sequenceIndex = request & 0x7fff;
  const sequence = globalMotion.sequences[sequenceIndex];
  if (sequence?.name !== expectedName) {
    throw new Error(
      `EN_RYOU request 0x${request.toString(16)} resolved to ${
        sequence?.name || "nothing"
      }, expected ${expectedName}`,
    );
  }
  return {
    bytecodeOffset: offset,
    request,
    requestFlags: (request & 0xffff8000) >>> 0,
    ...globalSequenceEvidence(expectedName),
  };
}

const nativeFollowupChains = {
  swallowFlip: {
    label: "Swallow Flip",
    sourceProgram: path.relative(repoRoot, enRyouPath),
    nativeMoveDefinitionFlags: [0, 16448],
    externalInputCorroboration: {
      url: "https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404",
      sequence: [
        ["down", "hand", "leg"],
        ["hand"],
      ],
      condition: "intercept an incoming attack",
    },
    stages: [
      {
        id: "swallowFlip",
        role: "counter-intercept",
        actorMotion: confirmedEnMotionRequest(
          0x0000036c,
          "AKI_AKI_NGS_INASI",
        ),
        victimMotion: globalSequenceEvidence("YKI_AKI_NGR_INASI"),
      },
      {
        id: "swallowFlipThrow",
        role: "automatic-catalogue-primary-flip",
        actorMotion: globalSequenceEvidence("AKI_AKI_NGS_ENSEI_MK"),
        victimMotion: confirmedEnMotionRequest(
          0x00000344,
          "YKI_AKI_NGR_ENSEI",
        ),
      },
      {
        id: "swallowFlipPunch",
        role: "optional-input-gated-ground-strike",
        actorMotion: globalSequenceEvidence("AKI_AKI_NGS_ENSEI_PNC"),
        victimMotion: globalSequenceEvidence("YKI_AKI_NGR_ENSEI_PNC"),
      },
    ],
    observedAlternatePair: {
      actorMotion: globalSequenceEvidence("AKI_AKI_NGS_ENSEI_KKT"),
      victimMotion: globalSequenceEvidence("YKI_AKI_NGR_ENSEI_KKT"),
      exactBranchCondition: null,
    },
  },
  pitBlow: {
    label: "Pit Blow",
    sourceProgram: path.relative(repoRoot, enRyouPath),
    nativeMoveDefinitionFlags: [0, 128],
    minimumProficiency: 56,
    externalInputCorroboration: {
      url: "https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/25383",
      sequence: [
        ["up", "hand"],
        ["hand"],
      ],
    },
    stages: [
      {
        id: "pitBlow",
        role: "catalogue-primary",
        actorMotion: globalSequenceEvidence(
          "AKI_AKI_KONGO_TYUKEN_Y_MID",
        ),
        highProficiencyActorMotion: globalSequenceEvidence(
          "AKI_AKI_KONGO_TYUKEN_MID",
        ),
      },
      {
        id: "pitBlowElbow",
        role: "input-and-proficiency-gated-continuation",
        actorMotion: confirmedEnMotionRequest(
          0x00000884,
          "AKI_AKI_KONGO_TYUKEN_C_MID",
        ),
      },
    ],
    observedAlternates: [
      confirmedEnMotionRequest(
        0x000001f8,
        "AKI_AKI_KONGO_TYUKEN_B_MID",
      ),
      confirmedEnMotionRequest(
        0x00000200,
        "AKI_AKI_KONGO_TYUKEN_Y_B_MID",
      ),
    ],
  },
  tornadoKick: {
    label: "Tornado Kick",
    sourceProgram: path.relative(repoRoot, enRyouPath),
    nativeMoveDefinitionFlags: [0, 256],
    externalInputCorroboration: {
      url: "https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/25383",
      sequence: [
        ["up", "up", "leg"],
        ["leg"],
      ],
    },
    stages: [
      {
        id: "tornadoKick",
        role: "first-kick-entry",
        actorMotion: globalSequenceEvidence(
          "AKI_AKI_BAT_KICK_NIREN1_TOP",
        ),
      },
      {
        id: "tornadoKickFinish",
        role: "catalogue-primary-input-gated-continuation",
        actorMotion: globalSequenceEvidence(
          "AKI_AKI_BAT_KICK_NIREN1_TOP_MK",
        ),
      },
    ],
    observedAlternateRequest: confirmedEnMotionRequest(
      0x0000075c,
      "AKI_AKI_BAT_KICK_NIREN2_TOP",
    ),
  },
  armBreakFire: {
    label: "Arm Break Fire",
    sourceProgram: path.relative(repoRoot, enRyouPath),
    nativeMoveDefinitionFlags: [8192, 0],
    externalInputCorroboration: {
      url: "https://gamefaqs.gamespot.com/dreamcast/198621-shenmue/faqs/72404",
      sequence: [
        ["up", "down", "down", "throw"],
        ["hand"],
        ["hand", "plus", "leg"],
      ],
    },
    stages: [
      {
        id: "armBreakFire",
        role: "catalogue-primary",
        actorMotion: globalSequenceEvidence("AKI_AKI_NGS_SP1_ELB"),
        victimMotion: globalSequenceEvidence("YKI_AKI_NGR_SP1_ELB"),
      },
      {
        id: "armBreakChestStrike",
        role: "first-input-gated-continuation",
        actorMotion: confirmedEnMotionRequest(
          0x00000c14,
          "AKI_AKI_NGS_SP2_WAK",
        ),
        victimMotion: globalSequenceEvidence("YKI_AKI_NGR_SP2_WAK"),
      },
      {
        id: "armBreakFireFinish",
        role: "second-input-gated-continuation",
        actorMotion: confirmedEnMotionRequest(
          0x00000c48,
          "AKI_AKI_NGS_SP3_GJJ",
        ),
        victimMotion: globalSequenceEvidence("YKI_AKI_NGR_SP3_GJJ"),
      },
    ],
  },
};

const evidence = {
  schema: "new-yokosuka-combat-evidence-v1",
  generatedBy: "tools/gameplay/build_combat_evidence.mjs",
  provenance: {
    motion: path.relative(repoRoot, motionPath),
    soundBank: path.relative(repoRoot, soundBankPath),
    soundBankSha256: sha256(soundBankBytes),
    playableCombatSoundCommandCount: validCombatSoundCommands.size,
    ramCapture: path.relative(repoRoot, ramPath),
    ramCaptureFrame: 78778,
    dreamcastRamBase,
    notes: [
      "Animation names and curve metadata are decoded directly from M_FGT1.BIN.",
      "Ryo move animations are resolved through executable function 0x0c1b1dd4 and the global MOTION.BIN registry, not inferred from M_FGT1 names.",
      "The global MOTION.BIN sequence table's second word identifies an action-metadata record. Opcode 0x02 at metadata +0x0c supplies three native phase-frame halfwords; 44 canonical primary motions expose that record directly.",
      "MOTION/M_FGT1 action-metadata records with the native 04 05 marker carry exact AB76/AB77 DTPK group, track, and animation-frame sound cues; these mappings are extracted structurally rather than assigned by audition.",
      "Canonical move names and English descriptions are extracted from the captured original game RAM.",
      "All 51 moves are joined to their native seven-byte compact command records and displayed WAZA.FON glyph strings.",
      "Opcode 4 is the running/L-trigger modifier and opcode 6 is the guard/Y button; the two display-only positional glyphs distinguish side and rear throws.",
      "Throw victim clips are joined to complete global MOTION.BIN NGR/NAGERARE counterparts by the native NGS/NAGE naming groups; battle-controller call-site confirmation remains pending.",
      "Arm Break Fire's SP2 and SP3 actor requests are confirmed at EN_RYOU bytecode offsets 0x0c14 and 0x0c48; matching victim clips are joined by their exact SP2/SP3 sequence families.",
      "Tornado Kick is represented by its first-kick NIREN1_TOP entry and the catalogue-primary NIREN1_TOP_MK continuation; EN_RYOU also requests the NIREN2_TOP alternate at bytecode offset 0x075c.",
      "Pit Blow's KONGO_TYUKEN_C_MID continuation is requested by EN_RYOU at bytecode offset 0x0884; B and Y_B alternates occur at 0x01f8 and 0x0200.",
      "Damage, hit windows, animation selection, transitions, and AI meanings remain unverified until their native tables and code paths are decoded.",
    ],
  },
  motionBank: {
    byteLength: motionBytes.length,
    sha256: sha256(motionBytes),
    sequenceCount: motion.sequences.length,
    completeSequenceCount: motion.sequences.filter(
      (sequence) => sequence.valueData?.complete,
    ).length,
    sequences: motion.sequences.map((sequence) => ({
      index: sequence.index,
      name: sequence.name,
      durationFrames: sequence.durationFrames,
      dataOffset: sequence.dataOffset,
      dataLength: sequence.rawDataLength,
      boneCount: sequence.boneIds.length,
      channelCount: sequence.channelCount,
      complete: Boolean(sequence.valueData?.complete),
      layoutKind: sequence.layoutKind || "standard",
      nativeSoundCues: nativeSoundCues(sequence),
    })),
  },
  nativeMoveMotionRegistry: {
    source: path.relative(repoRoot, globalMotionPath),
    byteLength: globalMotionBytes.length,
    sha256: sha256(globalMotionBytes),
    sequenceCount: globalMotion.sequences.length,
    resolverFunctionRuntimeAddress: 0x0c1b1dd4,
    definitionPointerTableRuntimeAddress:
      dreamcastRamBase + moveDefinitionPointerOffset,
    recordSize: 12,
    primaryMotionIdOffset: 4,
    highProficiencyMotionIdOffset: 6,
    registeredRange: {
      lowerExclusive: 0,
      upperExclusive: 0x0618,
      requestIdsAreOneBased: true,
    },
    highProficiencyCondition: "proficiency > 0x37 and alternate ID != 0",
    categories: Object.fromEntries(Object.entries(moveDefinitionTables)
      .map(([category, table]) => [
        category,
        {
          categoryId: table.categoryId,
          runtimeAddress: dreamcastRamBase + table.offset,
          recordCount: table.count,
        },
      ])),
  },
  nativeCommandTables: {
    compactRecordSize: 7,
    compactRecordLayout: [
      "tokenCount",
      "opcode0",
      "opcode1",
      "opcode2",
      "opcode3",
      "opcode4",
      "opcode5",
    ],
    opcodeTokens: compactCommandTokens,
    opcodeGlyphs: compactCommandGlyphs,
    categories: Object.fromEntries(Object.entries(commandPointerTables)
      .map(([category, table]) => [
        category,
        {
          moveRecordRuntimeAddress: dreamcastRamBase + table.recordOffset,
          moveRecordCount: table.recordCount,
          moveRecordSize: 12,
          displayPointerTableRuntimeAddress:
            dreamcastRamBase + table.pointerOffset,
          commandRecordCount: table.pointerCount,
          compactTableRuntimeAddress:
            dreamcastRamBase + table.compactOffset,
        },
      ])),
  },
  canonicalMoves: moveNames.map((move, index) => {
    const categoryIndex = moveNames
      .slice(0, index)
      .filter((candidate) => candidate.category === move.category)
      .length;
    const record = moveRecords[move.category][categoryIndex];
    if (record.englishNamePointer !== move.runtimeAddress) {
      throw new Error(
        `${move.text} record points to 0x${
          record.englishNamePointer.toString(16)
        }, expected 0x${move.runtimeAddress.toString(16)}`,
      );
    }
    const command = commandGlyphs[move.category][record.commandIndex];
    const compactCommand = compactCommands[move.category][record.commandIndex];
    const moveDefinition = moveDefinitions[move.category][categoryIndex];
    const commandGlyphPairs = Array.from(
      { length: command.bytes.length / 2 },
      (_, pairIndex) => command.bytes
        .slice(pairIndex * 2, pairIndex * 2 + 2)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    );
    const compactGlyphPairs = compactCommand.opcodes.map(
      (opcode) => compactCommandGlyphs[opcode],
    );
    const contextualDisplayCommand = (
      move.category === "throw"
      && (record.commandIndex === 7 || record.commandIndex === 8)
    );
    if (
      !contextualDisplayCommand
      && commandGlyphPairs.join("") !== compactGlyphPairs.join("")
    ) {
      throw new Error(
        `${move.text} compact command ${
          compactGlyphPairs.join("")
        } disagrees with display glyphs ${commandGlyphPairs.join("")}`,
      );
    }
    return {
      index,
      category: move.category,
      categoryIndex,
      name: move.text,
      nameRuntimeAddress: move.runtimeAddress,
      japaneseNameRuntimeAddress: record.japaneseNamePointer,
      description: descriptions[index].text,
      descriptionRuntimeAddress: descriptions[index].runtimeAddress,
      commandGlyphRuntimeAddress: command.pointer,
      commandIndex: record.commandIndex,
      commandGlyphBytes: command.bytes,
      commandGlyphHex: command.hex,
      displayCommandTokens: commandGlyphPairs.map(
        (glyph) => knownCommandGlyphs[glyph] || `glyph:${glyph}`,
      ),
      compactCommandRuntimeAddress: compactCommand.runtimeAddress,
      compactCommandBytes: compactCommand.bytes,
      compactCommandTokenCount: compactCommand.tokenCount,
      compactCommandOpcodes: compactCommand.opcodes,
      commandTokens: compactCommand.tokens,
      commandDecoding: contextualDisplayCommand
        ? "engine-command-with-separate-positional-display-condition"
        : compactCommand.tokens.some(
          (token) => token === "run" || token === "guard",
        )
          ? "engine-command-with-running-or-guard-modifier"
          : "engine-command-common-opcodes-verified",
      moveDefinitionRuntimeAddress: moveDefinition.runtimeAddress,
      moveDefinitionRawWords: moveDefinition.rawWords,
      moveDefinitionFlags: [
        moveDefinition.flags0,
        moveDefinition.flags1,
      ],
      nativeMoveCode: moveDefinition.moveCode,
      primaryMotion: moveDefinition.primary,
      highProficiencyMotion: moveDefinition.highProficiency,
      victimMotion: globalSequenceEvidence(
        throwVictimMotionNames[move.text],
      ),
      highProficiencyVictimMotion: globalSequenceEvidence(
        highProficiencyVictimMotionNames[move.text],
      ),
    };
  }),
  nativeFollowupChains,
  enemyBattleFiles: enemyFiles,
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${motion.sequences.length} animations, `
  + `${moveNames.length} canonical moves, ${enemyFiles.length} enemy files.`,
);
