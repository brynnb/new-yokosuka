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

const outputDirectory = path.join(root, "public/audio/world/sakr");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_sakr_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/yd01/sakr"),
  authFiles: ["SEQDATA0.AUTH"],
  authManifest: "play/assets/yd01/sakr/manifest.json",
  resourceBindingEvidence: "tools/evidence/sakr-native-lifecycle.json",
  stream: {
    label: "A0128.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0128.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0128.AFS",
    sha256: "e6426b93a52461b4541f45eba7aee3427601ee300e1447dc8f6caadf55431410",
  },
  soundBank: {
    label: "A1_SAKRA.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_SAKRA.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_SAKRA.SND",
    sha256: "cf1e1202e3072d46e45f6d0bb2ed27b96552d1fe5d8ad713ab940c75fb01a8e6",
  },
  voiceHashes: {
    "A0128A001.str": "d119c35a1a5cec337facbbd4cf78d6015f24f5f0a2216e95843a291b2b0cb9ac",
    "A0128B001.str": "41f137cdf4ff5f0447762bd039bfbe33af58ce5937dc0728e1242d1d93d88f9d",
    "A0128B002.str": "bb2a762a3fcb65c248ccb844b47adf65c5e1f17a753a413145989d73eea0de0a",
    "A0128B003.str": "e045f3e1f5fc98e4fecce9724baf3e709f357a2ec58486a59adcbe9d2d0d0671",
    "A0128B004.str": "bbe170fc60a8831ce3a1d08eedebb54efdccb1b3e034303a6ab7cf87ef8c07f2",
    "A0128B005.str": "b62d826db6e008fb227a44fc6ae4d84c1418c7fdfc19e930296a84eddb3c23e8",
    "A0128B006.str": "e5713c72788254f67caf75216f56457a4afec01e822ec6639fc2943862fe56b9",
    "A0128B007.str": "ab43104f833d36289b34dd695b818b14440507a4c845a52163ecdea961fea609",
    "A0128B008.str": "d6db0da3b0993f1bb36c1f28f3808196d03f94e9f09c4af743ded712141b6619",
    "A0128B009.str": "d31d87ece2ffabcce5056f6e64c9e38ef377c41bf4905b205ebc0d8b66ce6649",
    "A0128B010.str": "c5a9b852c8cb33fce6fa7ce282cbf8c8e69a3b4b5892e1dff8e0a7d7c1ee69eb",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/sakr",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} SAKR voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
