#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MotnLoader } from "../../src/MotnLoader.js";
import { portableProjectPath } from "../lib/portable-project-path.mjs";

const SCRIPT_DIRECTORY = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const DEFAULT_SOURCE_DIRECTORIES = [
  join(REPOSITORY_ROOT, "extracted_disc3_v2/data/SCENE/03/MFBT"),
];
const DEFAULT_OUTPUT = join(
  REPOSITORY_ROOT,
  "tools/evidence/enemy-battle-manifest.json",
);
const DEFAULT_MOTION_PATHS = [
  join(REPOSITORY_ROOT, ".disc-work/runtime-motion/MOTION.BIN"),
  join(REPOSITORY_ROOT, "extracted_disc3_v2/data/MOTION/MOTION.BIN"),
];

function hexadecimal(value, width = 8) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function u32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function locateSourceDirectory(explicit) {
  const candidates = explicit
    ? [resolve(explicit)]
    : DEFAULT_SOURCE_DIRECTORIES;
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `MFBT directory not found. Tried: ${candidates.join(", ")}`,
    );
  }
  return found;
}

function arrayBufferFor(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function resolveMotionNames(files) {
  const motionPath = DEFAULT_MOTION_PATHS.find(existsSync);
  if (!motionPath) return { motionPath: null, names: new Map() };
  const indices = new Set();
  for (const file of files) {
    for (const section of file.sections) {
      for (const candidate of section.motionCandidates) {
        candidate.motionIndex = candidate.decimal & 0x7fff;
        indices.add(candidate.motionIndex);
      }
    }
  }
  const motion = MotnLoader.parse(arrayBufferFor(readFileSync(motionPath)), {
    sequenceIndices: [...indices],
  });
  const names = new Map(
    motion.sequences.map((sequence) => [sequence.index, sequence.name]),
  );
  for (const file of files) {
    for (const section of file.sections) {
      for (const candidate of section.motionCandidates) {
        candidate.motionName = names.get(candidate.motionIndex) || null;
        candidate.requestFlags = hexadecimal(
          (candidate.decimal & 0xffff8000) >>> 0,
        );
      }
    }
  }
  return { motionPath, names };
}

function parseDispatchTable(buffer, dataOffset) {
  let cursor = dataOffset;
  let signature = null;
  if (buffer.subarray(cursor, cursor + 2).toString("ascii") === "GP") {
    signature = "GP";
    cursor += 4;
  }
  const entries = [];
  while (cursor + 8 <= buffer.length && buffer[cursor] === 0x0e) {
    const key = buffer.readUIntBE(cursor + 1, 3);
    const relativeTarget = buffer.readUInt16BE(cursor + 4);
    const target = dataOffset + relativeTarget;
    entries.push({
      offset: hexadecimal(cursor),
      key: hexadecimal(key, 6),
      relativeTarget: hexadecimal(relativeTarget, 4),
      target: hexadecimal(target),
      targetHasMatchingLabel: (
        target + 4 <= buffer.length
        && buffer[target] === 0x0f
        && buffer.readUIntBE(target + 1, 3) === target
      ),
    });
    cursor += 8;
  }
  return { signature, entries, byteLength: cursor - dataOffset };
}

function findSelfLabels(buffer, start, end) {
  const labels = [];
  for (let offset = start; offset + 4 <= end; offset += 4) {
    if (
      buffer[offset] === 0x0f
      && buffer.readUIntBE(offset + 1, 3) === offset
    ) {
      labels.push(hexadecimal(offset));
    }
  }
  return labels;
}

function findMotionCandidates(buffer, start, end) {
  const candidates = [];
  for (let offset = start; offset + 8 <= end; offset += 4) {
    if (
      buffer[offset] === 0x05
      && buffer.readUIntBE(offset + 1, 3) === 0
    ) {
      candidates.push({
        offset: hexadecimal(offset),
        value: hexadecimal(u32(buffer, offset + 4)),
        decimal: u32(buffer, offset + 4),
      });
    }
  }
  return candidates;
}

export function parseEnemyBattleFile(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 20) throw new Error(`${path} is too short`);
  const header = Array.from({ length: 5 }, (_, index) => u32(
    buffer,
    index * 4,
  ));
  const sectionOffsets = header.slice(1);
  const boundaries = [...sectionOffsets, buffer.length]
    .filter((value, index, values) => (
      value >= 20
      && value <= buffer.length
      && values.indexOf(value) === index
    ))
    .sort((left, right) => left - right);
  const dispatch = parseDispatchTable(buffer, sectionOffsets[0]);
  const sections = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      index,
      start: hexadecimal(start),
      end: hexadecimal(end),
      byteLength: end - start,
      selfLabels: findSelfLabels(buffer, start, end),
      motionCandidates: findMotionCandidates(buffer, start, end),
    };
  });
  return {
    file: basename(path),
    byteLength: buffer.length,
    header: {
      flags: hexadecimal(header[0]),
      sectionOffsets: sectionOffsets.map((value) => hexadecimal(value)),
    },
    dispatch,
    sections,
  };
}

function main() {
  const sourceDirectory = locateSourceDirectory(process.argv[2]);
  const output = resolve(process.argv[3] || DEFAULT_OUTPUT);
  const files = readdirSync(sourceDirectory)
    .filter((name) => /^EN_.+\.BIN$/i.test(name))
    .sort()
    .map((name) => parseEnemyBattleFile(join(sourceDirectory, name)));
  const motionNames = resolveMotionNames(files);
  const manifest = {
    schema: 1,
    generatedBy: "tools/gameplay/dump_enemy_battle_bins.mjs",
    provenance: {
      sourceDirectory: portableProjectPath(sourceDirectory),
      globalMotionBank: motionNames.motionPath
        ? portableProjectPath(motionNames.motionPath)
        : null,
      interpretation: [
        "All integers in the header are big-endian.",
        "Dispatch targets are relative to the first section offset.",
        "A target is confirmed when opcode 0x0f embeds its own file offset.",
        "Executable handler 0x0c1ae042 confirms opcode 0x05 is an eight-byte motion request and advances the EN VM program counter by eight.",
        "The request's low 15 bits index global MOTION.BIN; upper bits are retained separately as request flags.",
      ],
    },
    totals: {
      files: files.length,
      dispatchEntries: files.reduce(
        (sum, file) => sum + file.dispatch.entries.length,
        0,
      ),
      confirmedDispatchTargets: files.reduce(
        (sum, file) => sum + file.dispatch.entries.filter(
          (entry) => entry.targetHasMatchingLabel,
        ).length,
        0,
      ),
      motionCandidates: files.reduce(
        (sum, file) => sum + file.sections.reduce(
          (sectionSum, section) => (
            sectionSum + section.motionCandidates.length
          ),
          0,
        ),
        0,
      ),
      namedMotionRequests: files.reduce(
        (sum, file) => sum + file.sections.reduce(
          (sectionSum, section) => sectionSum + section.motionCandidates.filter(
            (candidate) => candidate.motionName,
          ).length,
          0,
        ),
        0,
      ),
    },
    files,
  };
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Wrote ${files.length} enemy battle files to ${output}`,
  );
  console.log(JSON.stringify(manifest.totals));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
