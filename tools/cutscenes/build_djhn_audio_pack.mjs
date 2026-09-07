#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const firstExisting = candidates => candidates.filter(Boolean).find(existsSync);
const sourceRoot = firstExisting([
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
]);
const dtpkDump = firstExisting([
  process.env.DTPK_DUMP,
  process.argv[2],
  path.join(repoRoot, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
]);
const vgmstream = firstExisting([
  process.env.VGMSTREAM_CLI,
  process.argv[3],
  path.join(repoRoot, ".disc-work/tooling/vgmstream/vgmstream-cli"),
]);
const python = process.env.DTPK_PYTHON || "python3";
if (!sourceRoot || !dtpkDump || !vgmstream || !python) {
  throw new Error("exact disc data, DTPKDump.py, vgmstream-cli, and Python 3.12 are required");
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const streamPath = path.join(sourceRoot, "data/SCENE/01/STREAM/01JUCEA.AFS");
const stream = readFileSync(streamPath);
const count = stream.readUInt32LE(4);
const extents = Array.from({ length: count }, (_, index) => ({
  offset: stream.readUInt32LE(8 + index * 8),
  byteLength: stream.readUInt32LE(12 + index * 8),
}));
const directoryOffset = (Math.max(...extents.map(value => value.offset + value.byteLength)) + 0x7ff) & ~0x7ff;
const voiceHashes = Object.freeze(Object.fromEntries(extents.flatMap((extent, index) => {
  const name = stream.subarray(
    directoryOffset + index * 0x30,
    directoryOffset + index * 0x30 + 0x20,
  ).toString("ascii").replace(/\0.*$/, "");
  if (path.extname(name).toUpperCase() !== ".STR") return [];
  return [[name, sha256(stream.subarray(extent.offset, extent.offset + extent.byteLength))]];
})));

const outputDirectory = path.join(repoRoot, "public/audio/world/djhn");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_djhn_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/dobuita/djhn"),
  authFiles: Array.from({ length: 7 }, (_, index) => `SEQDATA${index + 1}.AUTH`),
  authManifest: "play/assets/dobuita/djhn/manifest.json",
  resourceBindingEvidence: "tools/evidence/d000-vending-interaction.json",
  stream: {
    label: "01JUCEA.AFS",
    path: streamPath,
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01JUCEA.AFS",
    sha256: "39814b7707725e3a15c0ad29a707b7a6a2f50488ca3ffa49fb68084b338f150c",
  },
  soundBank: {
    label: "A1_YANJI.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_YANJI.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_YANJI.SND",
    sha256: "a9ec9b5a7b69359da2852bf6ecfe6c5aa3bad9855458b0ace13d42606865d4b0",
  },
  voiceHashes,
  unavailableVoices: {
    "01JUCEAA026.str": {
      reason: "the AUTH-authored member is absent from both 01JUCEA.AFS and its exact IDX02 directory",
      evidence: "extracted_files/data/SCENE/01/STREAM/01JUCEA.IDX",
    },
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/djhn",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
