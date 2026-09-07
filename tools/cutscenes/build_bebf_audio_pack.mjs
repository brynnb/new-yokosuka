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

const outputDirectory = path.join(root, "public/audio/world/bebf");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_bebf_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/hazuki/bebf"),
  authFiles: [
    "SEQDATA0.AUTH", "SEQDATA1.AUTH", "SEQDATA2.AUTH", "SEQDATA3.AUTH",
  ],
  authManifest: "play/assets/hazuki/bebf/manifest.json",
  resourceBindingEvidence: "tools/evidence/bebf-native-lifecycle.json",
  stream: {
    label: "01BEDB.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01BEDB.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01BEDB.AFS",
    sha256: "f796d5be7ffc10322ec7ed0daad839bf3d393b1efbd187e838a0d7d9f1b34fda",
  },
  soundBank: {
    label: "A1_BADME.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_BADME.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_BADME.SND",
    sha256: "d01d1e1e2788ca8b3f2634fdaef444dac54113687a30e57d4619acef926c7c6c",
  },
  voiceHashes: {
    "01BEDBA002.str": "0919717aa95a529696efe016bbd057fb92a86f0b71aed79655ef2dfb5a1c74b6",
    "01BEDBA003.str": "a0ee0e95ad77b577fa2c29b93cd1161518fc35c098b437a2b439f6d9f8448c9f",
    "01BEDBB001.str": "e6f0fbd53b296ef433e3c8594ec3657081b4b247c1a4584f50a1f2410231334b",
    "01BEDBB002.str": "f5ce2942c14662ba753f5f937e4c0472408011e3cb3da284f3d417793da35f4c",
    "01BEDBB003.str": "4dfd50385dd70fb9baeb1d766d6af3e988381a8d8d7fda58f3730dfab6d4fd02",
  },
  unavailableVoices: {
    "01BEDBA004.str": {
      reason: "AUTH references 01BEDBA004, but the exact retail 01BEDB.AFS directory contains only A001 through A003 and B001 through B003",
      evidence: "tools/evidence/bebf-native-lifecycle.json",
    },
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/bebf",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} BEBF voice records and ${manifest.sounds.length} SFX to ${outputDirectory}`);
