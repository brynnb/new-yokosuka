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
const python = process.env.DTPK_PYTHON || "python3";
if (!sourceRoot || !dtpkDump || !python) {
  throw new Error("exact disc data, DTPKDump.py, and Python 3.12 are required");
}

const outputDirectory = path.join(root, "public/audio/world/buss");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_buss_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/dobuita/buss"),
  authFiles: ["SEQDATA1.AUTH", "SEQDATA2.AUTH", "SEQDATA4.AUTH", "SEQDATA5.AUTH"],
  authManifest: "play/assets/dobuita/buss/manifest.json",
  resourceBindingEvidence: "tools/evidence/buss-native-lifecycle.json",
  stream: null,
  soundBank: {
    label: "A1_BUSNO.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_BUSNO.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_BUSNO.SND",
    sha256: "40c2e792ea21e45f4a406dff4b2b84bd3b7f172d4de2056a0d05d8a337e8b5a8",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/buss",
  dtpkDump,
  python,
  vgmstream: null,
});

console.log(`Wrote ${manifest.sounds.length} BUSS SFX to ${outputDirectory}`);
