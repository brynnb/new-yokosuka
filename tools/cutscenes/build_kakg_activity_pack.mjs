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

const expectedMembers = Object.freeze([
  ["M_01CRY.MOTN", 43608, "3077421e17ccc70225034c4f0fd26bad128566c81aa5e5b3fe722b466a1c3f1f"],
  ["M_01JAN.MOTN", 213128, "4a699bb9955e9cebc60ac2f9efdd6a07f7ddebb25cd435693472024e2525435b"],
  ["M_01KAK.MOTN", 50412, "9055626984e2ee42e446b2da9edc7549cfa8f336eb2770136ba11be54c1575fc"],
  ["SEQDATK0.AUTH", 1336, "c3a4b7d716d6fc8999a4edf50e3e7c0144a14baa0a85327a9680c7a7fdec4efe"],
  ["SEQDATK1.AUTH", 796, "f4e3594b09103c781e50049a75316d1a33e43a216ae5bf6e314d2d9990dcf527"],
  ["SEQDATK2.AUTH", 19292, "5b42a5329495c02803ac6e0cec1054921048088c47ed45f9efb1e0b046066267"],
  ["SEQDATK3.AUTH", 6120, "180c36d23dd813d7b9e2dec39b13169c001a0ae8e754b45368b698eeae859034"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(repoRoot, "play/assets/hazuki/kakg");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_kakg_activity_pack.mjs",
  resourceName: "KAKG",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JHD0/KAKG.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JHD0/KAKG.PKS",
  archiveSha256: "a8949fed9faa0f0825e43361fc6ece41ebecd411fae21d4e88235008d4d64411",
  expectedMembers,
  bindingEvidence: "tools/evidence/kakg-native-lifecycle.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot",
  audioManifest: "package-level audioBySlot maps conversational activities to exact independent streams and banks",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/kakg",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  motionBanks: [{
    bank: 32,
    member: "M_01KAK.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT1_KAKUGO_DEKITEIRU_0100" },
      { index: 1, name: "IWA_FUK_AT1_KAKUGO_DEKITEIRU0_0100" },
      { index: 2, name: "AKI_AT3_NEJIRU_UDE_CHASEYUKAWA_0100" },
    ],
  }, {
    bank: 48,
    member: "M_01CRY.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT2_INE_KETUISURU_0100" },
      { index: 1, name: "AKI_AUTO1_YAKUSOKU_0124" },
      { index: 2, name: "JIJ_INE_AT2_INE_KETUISURU_0100" },
      { index: 3, name: "JIJ_INE_AUTO1_YAKUSOKU_0124" },
    ],
  }],
  activities: [{
    slot: 2,
    primaryPointer: 0x5f167,
    secondaryPointer: 0x5f16c,
    file: "SEQDATK2.AUTH",
    actors: ["AKIR", "FUKU"],
    durationFrames: 2000,
    frameCount: 43,
    commandCounts: { camera: 1, move: 2, motion: 3, voice: 22, sound: 20 },
  }, {
    slot: 3,
    primaryPointer: 0x5f16d,
    secondaryPointer: 0x5f172,
    file: "SEQDATK3.AUTH",
    actors: ["AKIR", "INE_"],
    durationFrames: 1031,
    frameCount: 22,
    commandCounts: { camera: 1, move: 2, motion: 2, sound: 12, voice: 9 },
  }],
});

console.log(`Wrote exact conversational KAKG activity pack to ${outputDirectory}`);
