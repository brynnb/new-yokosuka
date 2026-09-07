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

const outputDirectory = path.join(root, "public/audio/world/op02");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_op02_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/introduction/op02"),
  authFiles: [
    "SEQDATA0.AUTH", "SEQDATA1.AUTH", "SEQDATA2.AUTH", "SEQDATA3.AUTH",
    "SEQDATA4.AUTH", "SEQDATA5.AUTH", "SEQDATA6.AUTH",
  ],
  authManifest: "play/assets/introduction/op02/manifest.json",
  resourceBindingEvidence: "tools/evidence/op02-opening-native-lifecycle.json",
  stream: {
    label: "A0100.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0100.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0100.AFS",
    sha256: "41ff263b424a6d0de8d0e96a784e1175368f43bc76fe7f000e6698b914f2991f",
  },
  soundBank: {
    label: "A1_OPNI.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_OPNI.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_OPNI.SND",
    sha256: "ef424676b11ec094f27574cf23b9006b869e1f97b017b9712880b9f521470a06",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/op02",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} OP02 voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
