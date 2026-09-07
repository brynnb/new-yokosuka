#!/usr/bin/env node

import { existsSync } from "node:fs";
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

const outputDirectory = path.join(repoRoot, "public/audio/world/mska");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_mska_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/hazuki/mska"),
  authFiles: ["SEQDATA2.AUTH"],
  authManifest: "play/assets/hazuki/mska/manifest.json",
  resourceBindingEvidence: "tools/evidence/mska-native-lifecycle.json",
  stream: {
    label: "A0125.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0125.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0125.AFS",
    sha256: "f7040d25e2544c1bd67bc1cf672d11b6126596f57ce986d8b357772486a30795",
  },
  soundBank: {
    label: "A1_FUKAN.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_FUKAN.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_FUKAN.SND",
    sha256: "060975f789a815ef0fa2ef23c1c2d1aa7c1ef9a00a8a0acf944b71aba0fb5db2",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/mska",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
