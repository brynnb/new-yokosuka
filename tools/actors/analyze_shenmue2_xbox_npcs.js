#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SHENMUE2_NPC_OPCODE_WORD_COUNTS,
  shenmue2NpcOpcodeWordCount,
  shenmue2NpcProgramIsAligned,
} from "../../src/Shenmue2NpcProgram.js";
import { portableProjectPath } from "../lib/portable-project-path.mjs";

const dreamcastRoot = path.resolve(
  process.argv[2]
    || ".disc-work/shenmue2-disc1-extracted/data/SCENE/01/NPC",
);
const xboxRoot = path.resolve(
  process.argv[3]
    || ".disc-work/shenmue2-xbox-extracted/Shenmue II",
);
const outputPath = path.resolve(
  process.argv[4] || "tools/evidence/shenmue2-xbox-npc-structure.json",
);
const dreamcastSource = process.argv[5] || dreamcastRoot;
const xboxNpcRoot = path.join(xboxRoot, "scene/01/npc");
const xbePath = path.join(xboxRoot, "Default.xbe");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hex(value) {
  return `0x${value.toString(16)}`;
}

function ascii(bytes) {
  return bytes.toString("ascii");
}

function exactFileComparison(filename) {
  const dreamcastPath = path.join(dreamcastRoot, filename);
  const xboxPath = path.join(xboxNpcRoot, filename);
  const dreamcast = fs.readFileSync(dreamcastPath);
  const xbox = fs.readFileSync(xboxPath);
  let firstDifference = null;
  const sharedLength = Math.min(dreamcast.length, xbox.length);
  for (let offset = 0; offset < sharedLength; offset += 1) {
    if (dreamcast[offset] !== xbox[offset]) {
      firstDifference = offset;
      break;
    }
  }
  if (firstDifference === null && dreamcast.length !== xbox.length) {
    firstDifference = sharedLength;
  }
  return {
    filename,
    identical: dreamcast.equals(xbox),
    dreamcast: { length: dreamcast.length, sha256: sha256(dreamcast) },
    xbox: { length: xbox.length, sha256: sha256(xbox) },
    firstDifference: firstDifference === null ? null : hex(firstDifference),
  };
}

function parseXbe(bytes) {
  if (ascii(bytes.subarray(0, 4)) !== "XBEH") {
    throw new Error("Default.xbe has no XBEH header.");
  }
  const baseAddress = bytes.readUInt32LE(0x104);
  const headerSize = bytes.readUInt32LE(0x108);
  const sectionCount = bytes.readUInt32LE(0x11c);
  const sectionTableAddress = bytes.readUInt32LE(0x120);
  const addressToHeaderOffset = (address) => {
    const offset = address - baseAddress;
    return offset >= 0 && offset < headerSize ? offset : null;
  };
  const sectionTableOffset = addressToHeaderOffset(sectionTableAddress);
  if (sectionTableOffset === null) {
    throw new Error("XBE section table is outside its headers.");
  }
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const offset = sectionTableOffset + index * 0x38;
    const nameOffset = addressToHeaderOffset(bytes.readUInt32LE(offset + 20));
    if (nameOffset === null) throw new Error(`XBE section ${index} has no name.`);
    const nameEnd = bytes.indexOf(0, nameOffset);
    return {
      index,
      name: ascii(bytes.subarray(nameOffset, nameEnd)),
      flags: hex(bytes.readUInt32LE(offset)),
      virtualAddress: bytes.readUInt32LE(offset + 4),
      virtualSize: bytes.readUInt32LE(offset + 8),
      rawOffset: bytes.readUInt32LE(offset + 12),
      rawSize: bytes.readUInt32LE(offset + 16),
    };
  });
  const fileOffsetToAddress = (offset) => {
    const section = sections.find((candidate) => (
      offset >= candidate.rawOffset
      && offset < candidate.rawOffset + candidate.rawSize
    ));
    return section
      ? section.virtualAddress + offset - section.rawOffset
      : null;
  };
  const addressToFileOffset = (address) => {
    const section = sections.find((candidate) => (
      address >= candidate.virtualAddress
      && address < candidate.virtualAddress + candidate.virtualSize
    ));
    if (!section) return null;
    const offset = section.rawOffset + address - section.virtualAddress;
    return offset < section.rawOffset + section.rawSize ? offset : null;
  };
  const npcOpcodeWordCountAddress = 0x4ec108;
  const npcOpcodeWordCountOffset = addressToFileOffset(
    npcOpcodeWordCountAddress,
  );
  if (npcOpcodeWordCountOffset === null) {
    throw new Error("Default.xbe has no mapped NPC opcode-width table.");
  }
  const nativeNpcOpcodeWordCounts = [...bytes.subarray(
    npcOpcodeWordCountOffset,
    npcOpcodeWordCountOffset + SHENMUE2_NPC_OPCODE_WORD_COUNTS.length,
  )];
  if (
    nativeNpcOpcodeWordCounts.length !== SHENMUE2_NPC_OPCODE_WORD_COUNTS.length
    || nativeNpcOpcodeWordCounts.some(
      (wordCount, opcode) => (
        wordCount !== SHENMUE2_NPC_OPCODE_WORD_COUNTS[opcode]
      ),
    )
  ) {
    throw new Error("Default.xbe NPC opcode-width table changed unexpectedly.");
  }
  const stringBytes = Buffer.from("NPC.BIN\0", "ascii");
  const stringOffset = bytes.indexOf(stringBytes);
  if (stringOffset < 0) throw new Error("Default.xbe contains no NPC.BIN string.");
  const stringAddress = fileOffsetToAddress(stringOffset);
  const pointer = Buffer.alloc(4);
  pointer.writeUInt32LE(stringAddress);
  const pointerOffsets = [];
  for (let cursor = 0; cursor <= bytes.length - 4;) {
    const found = bytes.indexOf(pointer, cursor);
    if (found < 0) break;
    pointerOffsets.push(found);
    cursor = found + 1;
  }
  return {
    baseAddress: hex(baseAddress),
    headerSize,
    sections: sections.map((section) => ({
      ...section,
      virtualAddress: hex(section.virtualAddress),
      virtualSize: hex(section.virtualSize),
      rawOffset: hex(section.rawOffset),
      rawSize: hex(section.rawSize),
    })),
    npcBinString: {
      fileOffset: hex(stringOffset),
      virtualAddress: hex(stringAddress),
      pointerReferences: pointerOffsets.map((offset) => ({
        fileOffset: hex(offset),
        virtualAddress: hex(fileOffsetToAddress(offset) ?? offset),
      })),
    },
    npcOpcodeWordCounts: {
      virtualAddress: hex(npcOpcodeWordCountAddress),
      fileOffset: hex(npcOpcodeWordCountOffset),
      entryCount: nativeNpcOpcodeWordCounts.length,
      unit: "32-bit words",
      values: nativeNpcOpcodeWordCounts,
    },
    staticCodeSites: [
      {
        virtualAddress: "0xa0a0d",
        bytes: "68 b4 25 47 00",
        observation: (
          "pushes the NPC.BIN string address, then calls 0x59477 and "
          + "0x2cd380 during NPC subsystem initialization"
        ),
      },
      {
        virtualAddress: "0xa0796",
        bytes: "6b c0 4c",
        observation: (
          "multiplies a native index by 0x4c (76), matching the exact "
          + "NPC route-record stride"
        ),
      },
      {
        virtualAddress: "0x2552b7",
        bytes: "68 b4 25 47 00",
        observation: (
          "pushes the same NPC.BIN string when the active area code is AR02"
        ),
      },
      {
        virtualAddress: "0x5f89a",
        bytes: "8b 48 08 0f b7 40 04 53 83 c9 20 51 50 56",
        observation: (
          "opcode 0x2d reads a uint16 motion ID at command +4 and flags at "
          + "command +8, ORs flags with 0x20, calls actor-layer installer "
          + "0x5be43 with layer index 1, then advances 12 bytes"
        ),
      },
      {
        virtualAddress: "0x5be43",
        observation: (
          "installs motion-layer records at actor +0x2c0 with stride 8; "
          + "bits 0x02, 0x04, 0x08, and 0x10 select controller groups and "
          + "earlier actor layers take precedence"
        ),
      },
      {
        virtualAddress: "0x5bf1e",
        observation: (
          "iterates native motion slots 1 through 4, requests a layer motion "
          + "through 0x5307b only when its corresponding group bit is set, "
          + "then applies that layer's playback position through 0x53359"
        ),
      },
    ],
  };
}

function parseNpcContainer(bytes, filename) {
  const actorCount = bytes.readUInt32LE(8);
  const actorTableOffset = bytes.readUInt32LE(12);
  const nodeCount = bytes.readUInt32LE(16);
  const nodeOffset = bytes.readUInt32LE(20);
  const routeCount = bytes.readUInt32LE(24);
  const routeOffset = bytes.readUInt32LE(28);
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const offset = nodeOffset + index * 68;
    return {
      index,
      id: ascii(bytes.subarray(offset, offset + 4)),
      sourceOffset: offset,
      position: [
        bytes.readFloatLE(offset + 52),
        bytes.readFloatLE(offset + 56),
        bytes.readFloatLE(offset + 60),
      ],
    };
  });
  const actorOffsets = Array.from({ length: actorCount }, (_, index) => (
    actorTableOffset + bytes.readUInt32LE(actorTableOffset + index * 4)
  ));
  const actorEnds = [...actorOffsets.slice(1), nodeOffset];
  const actors = actorOffsets.map((offset, index) => {
    const end = actorEnds[index];
    const words = Array.from(
      { length: (end - offset) / 4 },
      (_, wordIndex) => bytes.readUInt32LE(offset + wordIndex * 4),
    );
    const terminators = words
      .map((word, wordIndex) => (word === 0xffffffff ? wordIndex : -1))
      .filter((wordIndex) => wordIndex >= 0);
    const blockStarts = [15, ...terminators.map((wordIndex) => wordIndex + 1)];
    const blockEnds = terminators;
    const programs = [];
    for (let blockIndex = 0; blockIndex < blockEnds.length; blockIndex += 1) {
      const startWord = blockStarts[blockIndex];
      const endWord = blockEnds[blockIndex];
      let placementWord = -1;
      for (let cursor = startWord; cursor + 1 < endWord; cursor += 1) {
        if (words[cursor] !== 3 || words[cursor + 1] >= nodeCount) continue;
        if (!shenmue2NpcProgramIsAligned(words, cursor, endWord)) continue;
        const node = nodes[words[cursor + 1]];
        if (/^[A-Z0-9_]{4}$/.test(node.id)) {
          placementWord = cursor;
          break;
        }
      }
      if (placementWord < 0) continue;
      const nodeReferences = [];
      const packedTimes = [];
      const operations = [];
      for (let cursor = placementWord; cursor < endWord;) {
        const opcode = words[cursor];
        const wordCount = shenmue2NpcOpcodeWordCount(opcode);
        if (wordCount === null || cursor + wordCount > endWord) {
          throw new Error(
            `Invalid NPC opcode 0x${opcode.toString(16)} at `
            + `0x${(offset + cursor * 4).toString(16)}.`,
          );
        }
        operations.push({
          opcode: hex(opcode),
          arguments: words.slice(cursor + 1, cursor + wordCount).map(hex),
          sourceOffset: hex(offset + cursor * 4),
        });
        if (opcode === 1 || opcode === 2) {
          const packed = words[cursor + 1];
          const hour = packed >>> 8;
          const minute = packed & 0xff;
          if (hour < 24 && minute < 60) {
            packedTimes.push({
              opcode,
              packed: hex(packed),
              hour,
              minute,
              second: hour * 3600 + minute * 60,
              sourceOffset: hex(offset + cursor * 4),
            });
          }
        } else if (opcode === 3) {
          const nodeIndex = words[cursor + 1];
          if (nodeIndex < nodeCount) {
            const node = nodes[nodeIndex];
            nodeReferences.push({
              opcode,
              index: node.index,
              id: node.id,
              position: node.position,
              nodeSourceOffset: hex(node.sourceOffset),
              sourceOffset: hex(offset + cursor * 4),
            });
          }
        } else if (opcode === 4 || opcode === 0x12) {
          const nodeIndex = words[cursor + 1];
          if (nodeIndex < nodeCount) {
            const node = nodes[nodeIndex];
            nodeReferences.push({
              opcode,
              weight: bytes.readFloatLE(offset + (cursor + 2) * 4),
              index: node.index,
              id: node.id,
              position: node.position,
              nodeSourceOffset: hex(node.sourceOffset),
              sourceOffset: hex(offset + cursor * 4),
            });
          }
        }
        cursor += wordCount;
      }
      if (!nodeReferences.length) continue;
      programs.push({
        blockIndex,
        sourceOffset: hex(offset + placementWord * 4),
        sourceEnd: hex(offset + endWord * 4 + 4),
        leadingSelectorWords: words
          .slice(startWord, placementWord)
          .map(hex),
        nodeReferences,
        packedTimes,
        operations,
      });
    }
    return {
      index,
      actorCode: ascii(bytes.subarray(offset, offset + 4)),
      sourceOffset: hex(offset),
      byteLength: end - offset,
      headerBytes: bytes.subarray(offset + 4, offset + 60).toString("hex"),
      programCount: programs.length,
      programs,
    };
  });
  return {
    filename,
    length: bytes.length,
    sha256: sha256(bytes),
    header: {
      actorCount,
      actorTableOffset: hex(actorTableOffset),
      nodeCount,
      nodeOffset: hex(nodeOffset),
      routeCount,
      routeOffset: hex(routeOffset),
      actorPointerEncoding: "file offset relative to actorTableOffset",
      actorFixedHeaderBytes: 60,
      nodeRecordBytes: 68,
      routeRecordBytes: 76,
    },
    actors,
  };
}

const xbeBytes = fs.readFileSync(xbePath);
const dreamcastNames = fs.readdirSync(dreamcastRoot)
  .filter((filename) => /^NPC.*\.BIN$/i.test(filename))
  .sort();
const commonNames = dreamcastNames.filter(
  (filename) => fs.existsSync(path.join(xboxNpcRoot, filename)),
);
const primaryNpc = fs.readFileSync(path.join(dreamcastRoot, "NPC.BIN"));
const report = {
  schema: "new-yokosuka-shenmue2-xbox-npc-structure-v3",
  generatedFrom: {
    dreamcastNpcSource: portableProjectPath(dreamcastSource),
    xboxRoot: portableProjectPath(xboxRoot),
    defaultXbe: {
      length: xbeBytes.length,
      sha256: sha256(xbeBytes),
    },
  },
  safety: "Static byte parsing only; no extracted executable was run.",
  conclusions: {
    proven: [
      "Area-specific Xbox and Dreamcast NPC containers listed as identical are byte-for-byte equal.",
      "The actor section is a relative-pointer table of variable-length records beginning with a four-byte HUMANS logical actor code.",
      "Navigation nodes are 68 bytes and route records are 76 bytes.",
      "Actor program records contain navigation-node references and packed hour/minute values; their source offsets are retained below.",
      "Default.xbe contains a complete 59-entry NPC command-width table at 0x4ec108; parsing with those native widths reaches every program terminator without desynchronizing.",
      "Opcode 0x2d is exactly three words: opcode, motion ID, and controller-group flags; the observed 0x10 is its flags operand rather than a separate opcode.",
      "Opcode 0x2d installs actor layer 1, whose group-mask bits route motions independently into native motion slots 1 through 4.",
    ],
    unresolved: [
      "The selector words between actor programs and their story-state conditions.",
      "The semantic meaning of actor opcodes whose serialized argument widths are now known but whose handlers have not yet been decoded.",
      "Whether every packed time is an activation, release, or deactivation boundary.",
    ],
  },
  xboxExecutable: parseXbe(xbeBytes),
  comparisons: commonNames.map(exactFileComparison),
  dreamcastNpc: parseNpcContainer(primaryNpc, "NPC.BIN"),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  comparisons: report.comparisons.length,
  identical: report.comparisons.filter((row) => row.identical).length,
  actors: report.dreamcastNpc.header.actorCount,
}, null, 2));
