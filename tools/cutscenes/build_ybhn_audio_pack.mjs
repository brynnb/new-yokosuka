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

const voiceHashes = Object.freeze({
  "01YOBA001.str": "e09df5020e4ad08b6289d47d9e90d6227c55930acaa9c0816e313810e0b4a079",
  "01YOBA002.str": "2b5046456eb462bd3180e472957029f529425d73c2f10fdec42cdd7f8d55101a",
  "01YOBA003.str": "507aab2e38a71af4f9db31a1b9cf308de1d7849309f8f80af74d3b47b6b29d33",
  "01YOBA004.str": "65184162b63b4f59fab1ce0499fa84d02dccd8db39ad99df7110c06be8bdfb24",
  "01YOBA005.str": "41ba4f59b21997cc27dd35b5f6ce2502a3b2fe4dc8717ae158be5cd762774e3b",
  "01YOBA006.str": "eaca55e17fc81606e15410985221eeb8a92efbc26739fcc4eb512d2bf37891cb",
  "01YOBA007.str": "60bb878c332ef2164158bc70c0425fa7f4c45bcbdbb199aeb44370b3129ca7da",
  "01YOBA008.str": "0d1a7ac70d2bdea7975006ffcff50515d29de93e01ac8e2a28813a75035cfbda",
  "01YOBA009.str": "1533bde17621f8f004411541509ada6bf177d253a11c8485e0cf7a67c75e1067",
  "01YOBA010.str": "31c806841a76a549952afba35d7d6204ef7cdde66d34edb5231adf2b2a04b8ce",
  "01YOBA011.str": "43f0389f8b5bb04cb8b32e236ce17e0c7b74ddbb669399199e2985a28c355d4a",
  "01YOBA012.str": "9cbaad327aebc06437bf2db82f6867aa7e4d451d858dd3099ef7af9f1b7d945e",
  "01YOBB001.str": "685530cb95e1c6032173ed5fcb60b294df2aa263c22435a72e7e1efc57a5cb13",
  "01YOBB002.str": "f36eea75a9e3717ba9b777f755ec12fb531f3b092c2f20e191030f549369467f",
  "01YOBB003.str": "242ac4731fed352215ac2d8263ef46ccd4fa593331ac61aa5f5b73b681296a3b",
  "01YOBB004.str": "ad7de2b90df5a3043335ccc8e29ba36c50bfbeafa03a1b25735e76141c6f560f",
  "01YOBB005.str": "ed7b406f904d8bc62508da6a5eab4113b5838e5c1c38c8af95b16fff0f755f2e",
  "01YOBB006.str": "4a8d827eb352f577cd9dcedc3cdff7f36e0a8da0c0bc37811ac7a12bbae16d11",
  "01YOBB007.str": "e21a442bb5e7d6cb576dd46dfe35d9c561c63690e4709c12890a65d32eec8423",
  "01YOBB008.str": "c3e2bfe670dfa25ee3d80d4f4fb816973d7ae157b1f443826463f8ab7df0641c",
  "01YOBB009.str": "b4f47cef30eee4ae216136eddbabbcef8ba4e3770ed9b46ef759321c621d5dc4",
  "01YOBB010.str": "74d94034af135a3f542119b1b255f5674f0e8f25b5b3c7bb7b4529bc71ee1520",
  "01YOBB011.str": "63d47e98538ca00c7a52196b8b7fce8506609db289113bac99feca9b20f7b1e0",
  "01YOBB012.str": "a41927480973aa6dccf513d4a96ea35aff5f3c3c6e9e9a04df488818dab03b30",
  "01YOBB013.str": "2d94cb7eb48f3e9457a5345b43a663b2ce76463d9220511fe10f7defc3f68cae",
  "01YOBB014.str": "368445b3b5be11c74843e5261a16d937c731fc665c7021b74467f182ecccc8c8",
});

const outputDirectory = path.join(repoRoot, "public/audio/world/ybhn");
const manifest = buildNativeAseqAudioPack({
  generatedBy: "tools/cutscenes/build_ybhn_audio_pack.mjs",
  disc: 1,
  authDirectory: path.join(repoRoot, "play/assets/dobuita/ybhn"),
  authFiles: ["SEQDATA0.AUTH"],
  authManifest: "play/assets/dobuita/ybhn/manifest.json",
  resourceBindingEvidence: "tools/evidence/d000-auth-audio-banks.json",
  stream: {
    label: "01YOB.AFS",
    path: path.join(sourceRoot, "data/SCENE/01/STREAM/01YOB.AFS"),
    manifestPath: "extracted_files/data/SCENE/01/STREAM/01YOB.AFS",
    sha256: "d7bd8c1d2e9c38e4cc9359cda3b6842bacb45b27b0b719d2e0c8c3776e542a61",
  },
  soundBank: {
    label: "A1_YOBI.SND",
    path: path.join(sourceRoot, "data/SCENE/01/SOUND/A1_YOBI.SND"),
    manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_YOBI.SND",
    sha256: "2ae3b81c6af8e210bc7f5bc982bf8e597aea2b085b1fbd2e7b609b46910632ea",
  },
  voiceHashes,
  outputDirectory,
  outputAssetPrefix: "public/audio/world/ybhn",
  dtpkDump,
  vgmstream,
  python,
});

console.log(`Wrote ${manifest.voices.length} voices and ${manifest.sounds.length} SFX to ${outputDirectory}`);
