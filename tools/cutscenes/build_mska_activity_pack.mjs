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

const outputDirectory = path.join(repoRoot, "play/assets/hazuki/mska");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_mska_activity_pack.mjs",
  resourceName: "MSKA",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JHD0/MSKA.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JHD0/MSKA.PKS",
  archiveSha256: "1865e1dc62cd9d90c52088377f5b1862014d07e3e911b5796668f4ca977419ee",
  expectedMembers: [
    {
      name: "M_0126.MOTN",
      byteLength: 48976,
      sha256: "c36d0033e0ec6a5bbcdbc3ec2b391bdc01e4a70c92139de0a4f6ddf6cc1d284a",
    },
    {
      name: "SEQDATA2.AUTH",
      byteLength: 4332,
      sha256: "04d1801ad62088df3f361d306b9bbc9da755bb54fda54679e3de14d133d6ebe4",
    },
  ],
  bindingEvidence: "tools/evidence/mska-native-lifecycle.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot 0",
  audioManifest: "public/audio/world/mska/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/mska",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  motionBanks: [{
    bank: 20,
    member: "M_0126.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_ORENOMITI_ARUKU_0126" },
      { index: 1, name: "AKI_SOREGAORENOMITI_0126" },
      { index: 2, name: "FUK_KAIWA_0126" },
      { index: 3, name: "FUK_SENSEITAOSITA_0126" },
      { index: 4, name: "OTH_FUK_SENSEITAOSITA_0126" },
    ],
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x5ee04,
    secondaryPointer: 0x5ee09,
    file: "SEQDATA2.AUTH",
    actors: ["AKIR", "FUKU"],
    durationFrames: 775,
    frameCount: 17,
    commandCounts: { camera: 1, move: 2, motion: 4, sound: 10, voice: 5 },
  }],
});

console.log(`Wrote exact MSKA activity pack to ${outputDirectory}`);
