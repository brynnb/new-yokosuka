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
  ["M_01JUCE.MOTN", 308232, "d8c104d9a23e0d112c3e6e6d64f77223005b95991b1bc80f88d09599ff02182f"],
  ["SEQDATA1.AUTH", 3828, "68c2603a2909e3d278f86715ab357c839ce0171e1d5f2f2fa298588d6a02fd86"],
  ["SEQDATA2.AUTH", 3360, "b0adb724799acc25d290362d0da136b187edd82db01b26e5613618b865d36387"],
  ["SEQDATA3.AUTH", 11844, "e4e1bdf7774df6d3462436bfed88155abe3203cec1ef17a557e4a7d7fff8aee3"],
  ["SEQDATA4.AUTH", 8816, "f23a6627236b93ed51d4b3b7e8e52fd78c47b7a2ce1eee55becaca85e77d07df"],
  ["SEQDATA5.AUTH", 7460, "0f75af17e4270b05ce3bf4efcba870b0a45010c91d70acabc4df774b7a7e21b1"],
  ["SEQDATA6.AUTH", 5240, "14ade9fa18fd408a22b7c05b46d3a1914320e47c589d5a94aa2bd99058d058e9"],
  ["SEQDATA7.AUTH", 5424, "857d8ced7965011235410efe8c20919b9753320665c2d639170bb47ce1f8e62c"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const activities = Object.freeze([
  [20, 0xb1935, 0xb1942, 1, 380, 14, { camera: 1, move: 2, motion: 2, voice: 6, sound: 8 }],
  [21, 0xb194a, 0xb1957, 2, 461, 13, { camera: 1, move: 2, motion: 2, voice: 4, sound: 8 }],
  [22, 0xb195f, 0xb196c, 3, 2260, 64, { camera: 1, move: 2, motion: 6, sound: 39, voice: 23 }],
  [23, 0xb1974, 0xb1981, 4, 1593, 42, { camera: 1, move: 2, motion: 2, sound: 30, voice: 11 }],
  [24, 0xb1989, 0xb1996, 5, 1215, 41, { camera: 1, move: 2, motion: 2, voice: 15, sound: 25 }],
  [25, 0xb199e, 0xb19ab, 6, 678, 15, { camera: 1, move: 2, motion: 2, voice: 6, sound: 8 }],
  [26, 0xb19b3, 0xb19c0, 7, 765, 20, { camera: 1, move: 2, motion: 5, voice: 6, sound: 11 }],
].map(([slot, primaryPointer, secondaryPointer, number, durationFrames, frameCount, commandCounts]) => ({
  slot,
  primaryPointer,
  secondaryPointer,
  file: `SEQDATA${number}.AUTH`,
  actors: ["AKIR", "YKHI"],
  durationFrames,
  frameCount,
  commandCounts,
})));

const outputDirectory = path.join(repoRoot, "play/assets/dobuita/djhn");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_djhn_activity_pack.mjs",
  resourceName: "DJHN",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/DJHN.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/DJHN.PKS",
  archiveSha256: "b0a1180d16cd9d17c712e13c025d5ed263e597823dcbdaf620c0ec3f363ec73e",
  expectedMembers,
  bindingEvidence: "tools/evidence/djhn-native-lifecycle.json",
  selectionRule: "operation-0x013e slots 20 through 26 select SEQDATA1.AUTH through SEQDATA7.AUTH",
  audioManifest: "public/audio/world/djhn/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/djhn",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  externalAssets: [{
    sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/COKE.PKS"),
    sourceSha256: "0a57af67fc0f7e38e4dee7d758275aa57da47df5240dbf4e8534fde9535a7d72",
    archiveMember: "COKS520G.CHRM",
    assetPath: "play/assets/dobuita/djhn/COKS520G.CHRM",
    byteLength: 8884,
    sha256: "964fa92a9e7345a68e3208d51adc9b1aa11bc162410057aab8e9bf009af21fbc",
  }],
  attachedObjects: {
    CAN1: {
      browserFilename: "S1_D000_COKS520G.MT5",
      assetPath: "play/assets/dobuita/djhn/COKS520G.CHRM",
      nativeVariant: {
        resourceCode: "COKE",
        selectionRule: "first product in the native D000 vending resource table",
      },
      attachments: [
        {
          activitySlot: 22,
          frame: 160,
          parentActorTag: "AKIR",
          controlId: 18,
          translation: [0.10809999704360962, 0.019200000911951065, -0.013399999588727951],
          rotationRaw: [0xefe3, 0x5078, 0xdb18],
        },
        {
          activitySlot: 22,
          frame: 255,
          parentActorTag: "YKHI",
          controlId: 18,
          translation: [0.09610000252723694, 0.019200000911951065, -0.017400000244379044],
          rotationRaw: [0x0408, 0x5078, 0xf3f9],
        },
        { activitySlot: 22, frame: 1810, action: "detach" },
        {
          activitySlot: 23,
          frame: 115,
          parentActorTag: "AKIR",
          controlId: 18,
          translation: [0.10809999704360962, 0.019200000911951065, -0.013399999588727951],
          rotationRaw: [0xefe3, 0x5078, 0xdb18],
        },
        {
          activitySlot: 23,
          frame: 220,
          parentActorTag: "YKHI",
          controlId: 18,
          translation: [0.09610000252723694, 0.019200000911951065, -0.017400000244379044],
          rotationRaw: [0x0408, 0x5078, 0xf3f9],
        },
        { activitySlot: 23, frame: 1107, action: "detach" },
      ],
    },
  },
  motionBanks: [{
    bank: 16,
    member: "M_01JUCE.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT1_OGORU_YANJIHANKI_0100" },
      { index: 25, name: "JIJ_WAN_AT5B_OGORANAI_WANTOJIDOUHANBAIKI_0100" },
    ],
  }],
  activities,
});

console.log(`Wrote exact DJHN activity pack to ${outputDirectory}`);
