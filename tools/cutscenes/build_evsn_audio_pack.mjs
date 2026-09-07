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

const outputDirectory = path.join(root, "public/audio/world/evsn");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_evsn_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/sakuragaoka/evsn"),
  authFiles: ["SEQDATA1.AUTH", "SEQDATA2.AUTH", "SEQDATA3.AUTH", "SEQDATA4.AUTH"],
  authManifest: "play/assets/sakuragaoka/evsn/manifest.json",
  resourceBindingEvidence: "tools/evidence/evsn-native-lifecycle.json",
  stream: {
    label: "01NVE.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01NVE.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01NVE.AFS",
    sha256: "527dc9118f93248b892b73c5dc39d641b5d29869ef8434aae9c565734061a64a",
  },
  soundBank: {
    label: "A1_NZMVS.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_NZMVS.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_NZMVS.SND",
    sha256: "38330a2e90d09eb8f7c8b478a2bd3b8f78a5d66157b6e9638425652b6cb5dfba",
  },
  unavailableVoices: {
    "01NVEA007.str": {
      reason: "AUTH references 01NVEA007, but the exact retail 01NVE.AFS directory skips from A006 to A008",
      evidence: "tools/evidence/evsn-native-lifecycle.json",
    },
    "01NVED007.str": {
      reason: "AUTH references 01NVED007, but the exact retail 01NVE.AFS directory contains D001 through D005 only",
      evidence: "tools/evidence/evsn-native-lifecycle.json",
    },
    "01NVED008.str": {
      reason: "AUTH references 01NVED008, but the exact retail 01NVE.AFS directory contains D001 through D005 only",
      evidence: "tools/evidence/evsn-native-lifecycle.json",
    },
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/evsn",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} EVSN voices and ${manifest.sounds.length} SFX`);
