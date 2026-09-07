#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const expectedMembers = Object.freeze([
  ["C85M201G.CHRM", 12264, "c1558450e913792901ff47b337a2ac8e318039cdec6f4b7b77344d3ef9dac513"],
  ["M_01BUS.MOTN", 79568, "07311441989303e7f41f88d7ff58a42ceb468ed06e752c2687d6cf7c6e1720db"],
  ["OGM_L.CHRM", 30828, "440bd55341b22fe946a62bb7438f4baf61d0a4b872c6cae37a5d797534e8561a"],
  ["SEQDATA1.AUTH", 3644, "3d769872346e486df965296861c502402e95e064e2da4c1f051a568c87774ba0"],
  ["SEQDATA2.AUTH", 4872, "e4b254047a27493388cbef074e909ab0169652ee64ab469802abc425247e46f6"],
  ["SEQDATA4.AUTH", 3836, "400c63409f2910eba206da078f80ab5ddb76a88e87e747b369bf74ecb2b7415e"],
  ["SEQDATA5.AUTH", 5072, "69e81149123aecc70759b84098d4a70cfb35129ed757bda8b42ce571c4ec0fb6"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(root, "play/assets/dobuita/buss");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_buss_activity_pack.mjs",
  resourceName: "BUSS",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/BUSS.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/BUSS.PKS",
  archiveSha256: "9a2dfb19a2f7d134ee0b046cfaa6802861590e3918e30fa918eff6809a5be323",
  expectedMembers,
  bindingEvidence: "tools/evidence/buss-native-lifecycle.json",
  selectionRule: "exact AUTH member selected by the native random branch for slots 16 and 17",
  audioManifest: "public/audio/world/buss/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/buss",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  packageActors: {
    BUSS: {
      label: "Bus driver",
      modelCode: "OGM_L",
      browserFilename: "S1_D000_OGM_L.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  sceneObjects: {
    BUS_: {
      model: "BUSS530G",
      browserFilename: "S1_D000_BUSS530G.MT5",
      lifecycle: { kind: "auth-scoped" },
    },
  },
  motionBanks: [{
    bank: 16,
    member: "M_01BUS.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_NORU_BUS_A_0100" },
      { index: 4, name: "AKI_ORIRU_WALK_BUS_0100" },
      { index: 6, name: "OTH_TKA_CHECKSURU_RYOUKIN_BUS_0100" },
      { index: 8, name: "AKI_SUWARU_ORIRU_ETC_BUS_A_0100" },
      { index: 9, name: "YKI_UTS_BAS_65_LP_F" },
    ],
  }, {
    bank: 2,
    sourcePath: path.join(root, ".disc-work/runtime-motion/MOTION.BIN"),
    assetPath: "/motion/MOTION.BIN",
    byteLength: 1826804,
    sha256: "aca6a41b967b9f9f92ad847c9495e780058b8194e359bca9a9c2763b0d337b23",
    parseOptions: { sequenceIndices: [222] },
    expectedSequences: [{ index: 222, name: "ARPD_072" }],
  }],
  activities: [{
    slot: 16,
    primaryPointer: 0xaf00f,
    secondaryPointer: 0xaf01c,
    file: "SEQDATA1.AUTH",
    actors: ["BUS_", "AKIR", "BUSS"],
    durationFrames: 325,
    frameCount: 10,
    commandCounts: { camera: 1, move: 3, motion: 3, sound: 8 },
  }, {
    slot: 16,
    primaryPointer: 0xaf021,
    secondaryPointer: 0xaf02e,
    file: "SEQDATA4.AUTH",
    actors: ["BUS_", "AKIR", "BUSS"],
    durationFrames: 325,
    frameCount: 10,
    commandCounts: { camera: 1, move: 3, motion: 3, sound: 8 },
  }, {
    slot: 17,
    primaryPointer: 0xaf055,
    secondaryPointer: 0xaf062,
    file: "SEQDATA2.AUTH",
    actors: ["BUS_", "BUSS", "AKIR"],
    durationFrames: 246,
    frameCount: 16,
    commandCounts: { camera: 1, move: 3, motion: 5, sound: 12 },
  }, {
    slot: 17,
    primaryPointer: 0xaf067,
    secondaryPointer: 0xaf074,
    file: "SEQDATA5.AUTH",
    actors: ["BUS_", "BUSS", "AKIR"],
    durationFrames: 246,
    frameCount: 18,
    commandCounts: { camera: 1, move: 3, motion: 5, sound: 14 },
  }],
});

console.log(`Wrote exact BUSS activity pack to ${outputDirectory}`);
