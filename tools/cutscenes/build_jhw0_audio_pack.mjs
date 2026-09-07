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

const outputDirectory = path.join(repoRoot, "public/audio/world/jhw0");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_jhw0_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/hazuki/jhw0"),
  authFiles: Array.from({ length: 8 }, (_, index) => `SEQDATA${index + 1}.AUTH`),
  authManifest: "play/assets/hazuki/jhw0/manifest.json",
  resourceBindingEvidence: "tools/evidence/jhw0-native-lifecycle.json",
  stream: {
    label: "E1017.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/E1017.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/E1017.AFS",
    sha256: "e0ad04d67c8d5ca12796026f63aa69802b7c631a1f1bc710b7e61808a02c41e3",
  },
  soundBank: {
    label: "A1_FUKW.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_FUKW.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_FUKW.SND",
    sha256: "baeef3561d24f03d9f9be26b82810ba344bbbe63c429e8123ca1aa19a554fe4f",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/jhw0",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
