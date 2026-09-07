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

const outputDirectory = path.join(repoRoot, "public/audio/world/dnoz");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_dnoz_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/sakuragaoka/dnoz"),
  authFiles: ["SEQDATA2.AUTH", "SEQDATA3.AUTH"],
  authManifest: "play/assets/sakuragaoka/dnoz/manifest.json",
  resourceBindingEvidence: "tools/evidence/dnoz-native-lifecycle.json",
  stream: {
    label: "01FULB.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01FULB.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01FULB.AFS",
    sha256: "9ffdd321e226364fceead98fc1b13f8c7f3fa587d1679a689e93f3e6ab8562c8",
  },
  soundBank: {
    label: "A1_NONAM.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_NONAM.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_NONAM.SND",
    sha256: "09fe4e59b0bd3e62754e99592708e942a1ce332fa43f7a8afd22cd7aa0edd8a1",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/dnoz",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);

const skiOutputDirectory = path.join(repoRoot, "public/audio/world/dnoz-ski");
const skiManifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_dnoz_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/sakuragaoka/dnoz-ski"),
  authFiles: ["SEQDATA4.AUTH", "SEQDATA5.AUTH"],
  authManifest: "play/assets/sakuragaoka/dnoz-ski/manifest.json",
  resourceBindingEvidence: "tools/evidence/player-cutscene-owner-discovery.json",
  stream: {
    label: "01SKI.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01SKI.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01SKI.AFS",
    sha256: "0c878f7ba7592f180802f408e64fc572849d4536b264a0ffc4367ac328fb8505",
  },
  soundBank: {
    label: "A1_NOZOK.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_NOZOK.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_NOZOK.SND",
    sha256: "82f2ddf4ce075f2175fa008217f2023d2d617c3580f71769a80f86dfa21b3eba",
  },
  outputDirectory: skiOutputDirectory,
  outputAssetPrefix: "public/audio/world/dnoz-ski",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${skiManifest.voices.length} voices and ${skiManifest.sounds.length} SFX to ${skiOutputDirectory}`);
