#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const first = values => values.filter(Boolean).find(existsSync);
const sourceRoot = first([
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
]);
const dtpkDump = first([
  process.env.DTPK_DUMP,
  process.argv[2],
  path.join(root, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
]);
const vgmstream = first([
  process.env.VGMSTREAM_CLI,
  process.argv[3],
  path.join(root, ".disc-work/tooling/vgmstream/vgmstream-cli"),
]);
const python = process.env.DTPK_PYTHON || "python3";
if (!sourceRoot || !dtpkDump || !vgmstream || !python) {
  throw new Error("exact disc data, DTPKDump.py, vgmstream-cli, and Python 3.12 are required");
}

const outputDirectory = path.join(root, "public/audio/world/tgma");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_tgma_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/hazuki/tgma"),
  authFiles: ["SEQDATA4.AUTH"],
  authManifest: "play/assets/hazuki/tgma/manifest.json",
  resourceBindingEvidence: "tools/evidence/tgma-native-lifecycle.json",
  stream: {
    label: "A0139.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0139.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0139.AFS",
    sha256: "5d4284d25e61bef963dece6291eb9203b88ac6da96ff0c75d1a0916f21085655",
  },
  soundBank: {
    label: "A1_INET2.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_INET2.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_INET2.SND",
    sha256: "24ad865f3ba2bed8bd8d1b7b7524513a4078718117204a8b6dc06fe18e4905e8",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/tgma",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} TGMA voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
