#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [process.env.SHENMUE_DISC1_EXTRACTED_ROOT, path.join(repoRoot, "extracted_files")]
  .filter(Boolean).find(existsSync);
const firstExisting = candidates => candidates.filter(Boolean).find(existsSync);
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

const outputDirectory = path.join(repoRoot, "public/audio/world/yq14");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_yq14_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/dobuita/yq14"),
  authFiles: ["SEQDATA1.AUTH", "SEQDATA2.AUTH"],
  authManifest: "play/assets/dobuita/yq14/manifest.json",
  resourceBindingEvidence: "tools/evidence/d000-auth-audio-banks.json",
  stream: {
    label: "A01114.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/A01114.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/A01114.AFS",
    sha256: "29a315dfe1699c5b2891f2269175439b356cd96a19d257f1873c4ac4ee019010",
  },
  soundBank: {
    label: "N1014_4.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/N1014_4.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/N1014_4.SND",
    sha256: "1ecf521427bed498340e300f493864c9e1e9ccc578ccc37825d7f4f68b59a4d4",
  },
  voiceHashes: {
    "A01114A001.str": "9f80cf8231877bc1efa5a5f4e1bd3f866c0a2cc2a4de0f098049ccb76d5aee4f",
    "A01114B001.str": "348deff3ca0233c2b403f38a0c8c5ef71c4949bd5229a55d38092b7ccf86c740",
  },
  outputDirectory,
  outputAssetPrefix: "public/audio/world/yq14",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
