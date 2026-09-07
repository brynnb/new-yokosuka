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

const outputDirectory = path.join(repoRoot, "play/assets/dobuita/ybhn");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_ybhn_activity_pack.mjs",
  resourceName: "YBHN",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/YBHN.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/YBHN.PKS",
  archiveSha256: "e281659f780b89a21898624d872a77ca43cd20203b06afae65ad5b52b8fe44ab",
  expectedMembers: [
    {
      name: "M_01YOB.MOTN",
      byteLength: 37528,
      sha256: "2224adbbfbaa6a37320310e77ff6b0f031495d7c0d4055e87c1cd3c1465eb078",
    },
    {
      name: "SEQDATA0.AUTH",
      byteLength: 11444,
      sha256: "590ca02d4dba7437ae84fe3fb35908241092fcee011784b90417497338bdf0df",
    },
  ],
  bindingEvidence: "play/data/events/nativeEventPrograms.generated.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot",
  audioManifest: "public/audio/world/ybhn/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/ybhn",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  motionBanks: [{
    bank: 16,
    member: "M_01YOB.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT1_MATIBUSE_YOBIKOUKAERI_0100" },
      { index: 1, name: "SIN_NOZ_AT1_MATIBUSE_YOBIKOUKAERI_0100" },
    ],
  }],
  activities: [{
    slot: 27,
    primaryPointer: 0xaf8ae,
    secondaryPointer: 0xaf8bb,
    file: "SEQDATA0.AUTH",
    actors: ["AKIR", "HRSK"],
    durationFrames: 2130,
    frameCount: 43,
    commandCounts: { camera: 1, move: 2, motion: 2, sound: 15, voice: 26 },
  }],
});

console.log(`Wrote exact YBHN activity pack to ${outputDirectory}`);
