#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const first = values => values.filter(Boolean).find(existsSync);
const sourceRoot = first([
  process.env.SHENMUE_DISC2_EXTRACTED_ROOT,
  path.join(root, "extracted_disc2_v2"),
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
  throw new Error("exact Disc 2 data, DTPKDump.py, vgmstream-cli, and Python 3.12 are required");
}

const outputDirectory = path.join(root, "public/audio/world/houo");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_houo_audio_pack.mjs",
  disc: 2,
  authDirectory: path.join(root, "play/assets/hazuki/houo"),
  authFiles: ["SEQDATAD.AUTH"],
  authManifest: "play/assets/hazuki/houo/manifest.json",
  resourceBindingEvidence: "tools/evidence/player-cutscene-owner-discovery.json",
  stream: {
    label: "01DIS.AFS",
    path: path.join(sourceRoot, "data/SCENE/02/STREAM/01DIS.AFS"),
    manifestPath: "extracted_disc2_v2/data/SCENE/02/STREAM/01DIS.AFS",
    sha256: "fbc15afc397164e88c8684b03b136562d7601f16a4bf3ac3ca49d32d97740848",
  },
  soundBank: {
    label: "A1_HOUHA.SND",
    path: path.join(sourceRoot, "data/SCENE/02/SOUND/A1_HOUHA.SND"),
    manifestPath: "extracted_disc2_v2/data/SCENE/02/SOUND/A1_HOUHA.SND",
    sha256: "4fbc8fa043f8db207ae1f099333469606702f49302687fd8d0d367d1c04342cb",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/houo",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} HOUO voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
