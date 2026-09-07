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

const outputDirectory = path.join(repoRoot, "public/audio/world/kakg-fuku");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_kakg_fuku_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/hazuki/kakg"),
  authFiles: ["SEQDATK2.AUTH"],
  authManifest: "play/assets/hazuki/kakg/manifest.json",
  resourceBindingEvidence: "tools/evidence/kakg-native-lifecycle.json",
  stream: {
    label: "01KAK.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01KAK.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01KAK.AFS",
    sha256: "e1480d24adc6921e9c17fd5a9d71828b9796f1baaf25d0e3fab6c7975c12ec76",
  },
  soundBank: {
    label: "A1_KAKGO.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_KAKGO.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_KAKGO.SND",
    sha256: "d3631c396d1140cc87f10b1f93ce3249553159a267b1eccb7edf23df6bc7d36d",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/kakg-fuku",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
