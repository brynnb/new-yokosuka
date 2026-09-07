#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const firstExisting = candidates => candidates.filter(Boolean).find(existsSync);
const sourceRoot = firstExisting([
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
]);
const dtpkDump = firstExisting([
  process.env.DTPK_DUMP,
  process.argv[2],
  path.join(root, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
]);
const vgmstream = firstExisting([
  process.env.VGMSTREAM_CLI,
  process.argv[3],
  path.join(root, ".disc-work/tooling/vgmstream/vgmstream-cli"),
]);
const python = process.env.DTPK_PYTHON || "python3";
if (!sourceRoot || !dtpkDump || !vgmstream || !python) {
  throw new Error("exact disc data, DTPKDump.py, vgmstream-cli, and Python 3.12 are required");
}

const outputDirectory = path.join(root, "public/audio/world/cata1");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_cata1_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/yamanose/cata1"),
  authFiles: ["SEQDATA0.AUTH", "SEQDATA1.AUTH", "SEQDATA2.AUTH"],
  authManifest: "play/assets/yamanose/cata1/manifest.json",
  resourceBindingEvidence: "tools/evidence/cata1-native-lifecycle.json",
  stream: {
    label: "01CAT1.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01CAT1.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01CAT1.AFS",
    sha256: "ef7ddff7e06a6d6c087a37ed3dcfe7bd4bb21d9cb4743be8c08d53d025a93aac",
  },
  soundBank: {
    label: "A1_NEKO1.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_NEKO1.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_NEKO1.SND",
    sha256: "0e3eeae86fe19aa7c40fa6a841192329df5d9c2fe16455b5517a2d3092d0c4d9",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/cata1",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} CATA1 voices and ${manifest.sounds.length} SFX`);
