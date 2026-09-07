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
  throw new Error("exact Disc 1 data, DTPKDump.py, vgmstream-cli, and Python 3.12 are required");
}

const outputDirectory = path.join(root, "public/audio/world/toki");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_toki_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/dobuita/toki"),
  authFiles: ["SEQDATA2.AUTH"],
  authManifest: "play/assets/dobuita/toki/manifest.json",
  resourceBindingEvidence: "tools/evidence/player-cutscene-owner-discovery.json",
  stream: {
    label: "A0142B.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0142B.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0142B.AFS",
    sha256: "34c9e3d2cda7f4cad2b7348dd4c1c5adb65421707b5d574595a25703d0097104",
  },
  soundBank: {
    label: "A1_TOURA.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_TOURA.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_TOURA.SND",
    sha256: "8bf3e2b52098f1f1de5670690b7e06b7a1a43c94004b307c34900c12c9caa3b6",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/toki",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} TOKI voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
