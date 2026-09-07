#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const first = values => values.filter(Boolean).find(existsSync);
const sourceRoot = first([process.env.SHENMUE_DISC1_EXTRACTED_ROOT, path.join(root, "extracted_files")]);
const vgmstream = first([
  process.env.VGMSTREAM_CLI,
  process.argv[2],
  path.join(root, ".disc-work/tooling/vgmstream/vgmstream-cli"),
]);
if (!sourceRoot || !vgmstream) throw new Error("exact disc data and vgmstream-cli are required");

const outputDirectory = path.join(root, "public/audio/world/hihy");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_hihy_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(root, "play/assets/hazuki/hihy"),
  authFiles: ["SEQDATA5.AUTH"],
  authManifest: "play/assets/hazuki/hihy/manifest.json",
  resourceBindingEvidence: "tools/evidence/hihy-native-lifecycle.json",
  stream: {
    label: "A0125B.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A0125B.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A0125B.AFS",
    sha256: "726bda58d57afd49be22a97145e7882940ea70499a94235a580a8ba94d3df0af",
  },
  soundBank: null,
  outputDirectory,
  outputAssetPrefix: "public/audio/world/hihy",
  vgmstream,
});
console.log(`Wrote ${manifest.voices.length} HIHY voices to ${outputDirectory}`);
