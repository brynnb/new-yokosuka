#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const motionNames = Object.freeze([
  "AKI_AT1_RENSYU_TYUUKEN_WAZADENFUK_0100",
  "AKI_AT2_MIRU_TYUUKEN_WAZADENFUK_0100",
  "AKI_AT3_KOTOWARU_WAZADENFUK_0100",
  "AKI_AT4A_SASUGADESUNE_WAZADENFUK_0100",
  "AKI_AT4B_KITAERARETA_WAZADENFUK_0100",
  "AKI_AT5A_KOTOWARU_WAZADENFUK_0100",
  "AKI_AT5B_YAMERU_WAZADENFUK_0100",
  "AKI_AT6_IIKANJI_WAZADENFUK_0100",
  "IWA_FUK_AT1_RENSYU_TYUUKEN_WAZADENFUK_0100",
  "IWA_FUK_AT2_MIRU_TYUUKEN_WAZADENFUK_0100",
  "IWA_FUK_AT3_KOTOWARU_WAZADENFUK_0100",
  "IWA_FUK_AT4A_SASUGADESUNE_WAZADENFUK_0100",
  "IWA_FUK_AT4B_KITAERARETA_WAZADENFUK_0100",
  "IWA_FUK_AT5A_KOTOWARU_WAZADENFUK_0100",
  "IWA_FUK_AT5B_YAMERU_WAZADENFUK_0100",
  "IWA_FUK_AT6_IIKANJI_WAZADENFUK_0100",
  "AKI_AT3_SIPPAI_YOROSIKU_YANJIHANKI_0100",
  "AKI_KAMAE_TATI",
  "AKI_TATI_KAMAE",
  "IWA_FUK_RENSYU_TYUUKEN_WAZADENFUK_FE",
]);

const expectedMembers = Object.freeze([
  ["M_01FUK.MOTN", 240160, "35a9b8e173cf2895bd55b550d0ceeea744583794b58a58d6adc03c52ae686efc"],
  ["M_JHW0.MOTN", 12320, "528415ccb65b399647d08f46fb983a3550f3ec9dbd0581e2443d4492b9a8b202"],
  ["SEQDATA1.AUTH", 8304, "71c1317c290e83bb059305c25ef218565c921ca19d0be90006851c5a7318cd55"],
  ["SEQDATA2.AUTH", 5148, "7ee8bbeee275caf8bf692f1e810ca2e84a64acba9cdd9fa08a2ba32d621633ff"],
  ["SEQDATA3.AUTH", 4284, "ee33590481cc907f3f306e2811cf6ce0193497e0bb67b0e24dbec6d0d788ccba"],
  ["SEQDATA4.AUTH", 4344, "ee81a8358a576f3e46cc3b4252f4a44c24d4092d3e6789265a8379b25a5d2f64"],
  ["SEQDATA5.AUTH", 4976, "d2d4f897f6b6be153659ae6e483f9f1ce64984861f13e64573ce98e0619aea5a"],
  ["SEQDATA6.AUTH", 3644, "c4a71b4ee62335c0a066b98b99da1c8046ac1ae1754093f666cd091042949528"],
  ["SEQDATA7.AUTH", 4748, "a6f9e4a10a7ddb27f2f97b65c6862aa46572a47476f55f7d409236f374ce947e"],
  ["SEQDATA8.AUTH", 6172, "c362c25c49195a71ecf1de43b97de603377dcd25435f9e001d4272a6e5f04049"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const activityFacts = Object.freeze([
  [9, 0x5f5fd, 0x5f60a, 1, 1600, 68, { camera: 1, move: 2, motion: 4, sound: 55, voice: 10 }],
  [10, 0x5f60f, 0x5f61c, 2, 1150, 27, { camera: 1, move: 2, motion: 2, voice: 10, sound: 16 }],
  [11, 0x5f621, 0x5f62e, 3, 635, 22, { camera: 1, move: 2, motion: 2, voice: 6, sound: 15 }],
  [12, 0x5f633, 0x5f640, 4, 830, 25, { camera: 1, move: 2, motion: 2, voice: 6, sound: 18 }],
  [13, 0x5f645, 0x5f652, 5, 798, 23, { camera: 1, move: 2, motion: 7, voice: 5, sound: 14 }],
  [14, 0x5f657, 0x5f664, 6, 500, 20, { camera: 1, move: 2, motion: 2, voice: 5, sound: 14 }],
  [15, 0x5f669, 0x5f676, 7, 830, 21, { camera: 1, move: 2, motion: 2, voice: 6, sound: 15 }],
  [16, 0x5f67b, 0x5f688, 8, 910, 29, { camera: 1, move: 2, motion: 8, sound: 20, voice: 5 }],
]);

const outputDirectory = path.join(repoRoot, "play/assets/hazuki/jhw0");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_jhw0_activity_pack.mjs",
  resourceName: "JHW0",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JHD0/JHW0.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JHD0/JHW0.PKS",
  archiveSha256: "d34d6a2dcac6ad16ccae24fec430f0aa3f7efecbd503ae45c3171e57a58b6754",
  expectedMembers,
  bindingEvidence: "tools/evidence/jhw0-native-lifecycle.json",
  selectionRule: "operation-0x013e slots 9 through 16 select SEQDATA1.AUTH through SEQDATA8.AUTH",
  audioManifest: "public/audio/world/jhw0/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/jhw0",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["M_JHW0.MOTN"],
  motionBanks: [{
    bank: 16,
    member: "M_01FUK.MOTN",
    expectedSequences: motionNames.map((name, index) => ({ index, name })),
  }],
  activities: activityFacts.map(([
    slot, primaryPointer, secondaryPointer, suffix, durationFrames, frameCount, commandCounts,
  ]) => ({
    slot,
    primaryPointer,
    secondaryPointer,
    file: `SEQDATA${suffix}.AUTH`,
    actors: ["AKIR", "FUKU"],
    durationFrames,
    frameCount,
    commandCounts,
  })),
});

console.log(`Wrote exact JHW0 activity pack to ${outputDirectory}`);
