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

const outputDirectory = path.join(repoRoot, "public/audio/world/d0w0");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_d0w0_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/dobuita/d0w0"),
  authFiles: [
    ...Array.from({ length: 9 }, (_, index) => `SEQDATA${index + 1}.AUTH`),
    "SEQDATAA.AUTH",
    "SEQDATAB.AUTH",
    "SEQDATAC.AUTH",
  ],
  authManifest: "play/assets/dobuita/d0w0/manifest.json",
  resourceBindingEvidence: "tools/evidence/d0w0-native-lifecycle.json",
  stream: {
    label: "E1020.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/E1020.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/E1020.AFS",
    sha256: "127720010d4b42003b2dd083f153514d9db13a6746b28b3cd27fef0f85022577",
  },
  soundBank: {
    label: "A1_YAMAW.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_YAMAW.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_YAMAW.SND",
    sha256: "1a6b80bb36229239ec3a5b234968cb3e372e2269a8ead66edbe9495330d951fc",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/d0w0",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
