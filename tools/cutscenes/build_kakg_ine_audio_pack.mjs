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

const outputDirectory = path.join(repoRoot, "public/audio/world/kakg-ine");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_kakg_ine_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/hazuki/kakg"),
  authFiles: ["SEQDATK3.AUTH"],
  authManifest: "play/assets/hazuki/kakg/manifest.json",
  resourceBindingEvidence: "tools/evidence/kakg-native-lifecycle.json",
  stream: {
    label: "A01124.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A01124.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A01124.AFS",
    sha256: "7ac4574163fbd50637288bcf2a16869c6b36a928ce7693bf8bd771ef85902d2d",
  },
  soundBank: {
    label: "A1_INET1.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_INET1.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_INET1.SND",
    sha256: "e704d025dc933590abca20824c032bf469fedb7a6787445b48e631a7aa365823",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/kakg-ine",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
