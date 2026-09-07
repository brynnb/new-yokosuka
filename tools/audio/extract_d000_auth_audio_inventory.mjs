#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAuthSequence } from "../lib/AuthSequence.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceCandidates = [
  process.argv[2],
  path.join(repoRoot, ".disc-work/exact/d000/unpacked"),
].filter(Boolean).map((candidate) => path.resolve(candidate));
const sourceRoot = sourceCandidates.find(existsSync);
if (!sourceRoot) {
  throw new Error(
    `D000 unpacked resource root not found. Tried: ${
      sourceCandidates.join(", ")
    }`,
  );
}
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(
    repoRoot,
    "tools/evidence/d000-auth-audio-inventory.json",
  );
const sha256 = (bytes) => (
  createHash("sha256").update(bytes).digest("hex")
);

function filesBelow(directory) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory()
      ? filesBelow(absolute)
      : [absolute];
  });
}

const files = filesBelow(sourceRoot)
  .filter((filename) => filename.toUpperCase().endsWith(".AUTH"))
  .sort()
  .map((filename) => {
    const bytes = readFileSync(filename);
    const parsed = parseAuthSequence(bytes);
    return {
      path: path.relative(sourceRoot, filename).split(path.sep).join("/"),
      byteLength: bytes.length,
      sha256: sha256(bytes),
      durationFrames: parsed.durationFrames,
      timelineComplete: parsed.timelineComplete,
      actorTags: [...new Set(parsed.actors.filter(Boolean))].sort(),
      sounds: parsed.sounds.map((sound) => ({
        recordOffset: `0x${sound.recordOffset.toString(16)}`,
        frame: sound.frame,
        actorTag: sound.actorTag,
        commandHex: sound.commandHex,
        eventIndex: sound.eventIndex,
        stop: sound.stop,
      })),
    };
  });

const commandCounts = {};
for (const file of files) {
  for (const sound of file.sounds) {
    commandCounts[sound.commandHex] ??= 0;
    commandCounts[sound.commandHex] += 1;
  }
}
const pathsByHash = new Map();
for (const file of files) {
  const paths = pathsByHash.get(file.sha256) ?? [];
  paths.push(file.path);
  pathsByHash.set(file.sha256, paths);
}
const soundEvents = files.flatMap(({ sounds }) => sounds);
const evidence = {
  schema: "new-yokosuka-d000-auth-audio-inventory-v1",
  generatedBy: "tools/audio/extract_d000_auth_audio_inventory.mjs",
  source: {
    logicalRoot: "D000 unpacked resources",
    localPathExcluded: true,
  },
  method: [
    "Parse every AUTH ASEQ chunk below the supplied D000 resource root.",
    "Retain native sound command bytes, actor tags, event indices, record "
      + "offsets, and global 30 fps timeline frames.",
    "Group byte-identical AUTH resources by SHA-256 without dropping their "
      + "distinct archive paths.",
    "Do not assign a sound bank, object action, or high-level sound name "
      + "without independent resource/control-flow evidence.",
  ],
  summary: {
    authFileCount: files.length,
    uniqueAuthContentCount: pathsByHash.size,
    soundBearingAuthFileCount: files.filter(({ sounds }) => sounds.length).length,
    soundEventCount: soundEvents.length,
    playableEventCount: soundEvents.filter(({ stop }) => !stop).length,
    stopEventCount: soundEvents.filter(({ stop }) => stop).length,
    uniqueCommandCount: Object.keys(commandCounts).length,
    commandCounts: Object.fromEntries(
      Object.entries(commandCounts).sort(([left], [right]) => (
        left.localeCompare(right)
      )),
    ),
  },
  duplicateContent: [...pathsByHash.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ sha256: hash, paths }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256)),
  files,
  semanticBoundary: (
    "AUTH proves command timing relative to its authored sequence. This "
    + "inventory does not by itself prove which DTPK bank supplies an A904 "
    + "namespace or which browser interaction launches the sequence."
  ),
};
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Wrote ${files.length} AUTH files / ${soundEvents.length} sound events to ${
    outputPath
  }`,
);
