#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/D000/MAPINFO.BIN"));
const mapinfoSha256 = "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e";
const letterEvidence = "tools/evidence/djhn-letter-native-callback-ir.json";
const letterIr = JSON.parse(readFileSync(path.join(repoRoot, letterEvidence), "utf8"));
if (sha256(mapinfo) !== mapinfoSha256
  || letterIr.source.mapinfoSha256 !== mapinfoSha256
  || letterIr.source.callbackFunction !== "0x8a44c") {
  throw new Error("DJHN letter callback evidence changed");
}
const letterCallback = {
  bytes: mapinfo, callbackFunction: 0x8a44c, nativeFunction: letterIr.function,
  durationFrames: 1215, activitySlot: 24,
};
const letterObjects = extractNativeAseqCallbackObjectPresentation(letterCallback);
const letterPresentation = extractNativeAseqCallbackPresentation(letterCallback);
if (letterObjects.attachedObjectCues.length !== 2
  || letterObjects.nodeTransformCues.length !== 6
  || letterObjects.attachedObjectCues.some(cue => cue.objectTag !== "MALS")) {
  throw new Error("DJHN letter presentation coverage changed");
}
const letterCue = ({ objectTag, ...cue }) => ({
  ...cue, source: { evidence: letterEvidence, callbackFunction: "0x8a44c" },
});
const firstLetterEvidence = "tools/evidence/djhn-seqdata3-native-callback-ir.json";
const firstLetterIr = JSON.parse(readFileSync(path.join(repoRoot, firstLetterEvidence), "utf8"));
if (firstLetterIr.source.mapinfoSha256 !== mapinfoSha256
  || firstLetterIr.source.callbackFunction !== "0x891b8") {
  throw new Error("DJHN first letter callback evidence changed");
}
const firstLetterObjects = extractNativeAseqCallbackObjectPresentation({
  bytes: mapinfo, callbackFunction: 0x891b8, nativeFunction: firstLetterIr.function,
  durationFrames: 2260, activitySlot: 22, objectTags: ["MALS", "YKHI"],
});
if (firstLetterObjects.attachedObjectCues.length !== 4
  || firstLetterObjects.nodeTransformCues.length !== 6) {
  throw new Error("DJHN first letter presentation coverage changed");
}
const firstLetterCue = ({ objectTag, ...cue }) => ({
  ...cue, source: { evidence: firstLetterEvidence, callbackFunction: "0x891b8" },
});

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
  ...(slot === 22 ? { nativeActorLookPointCues: firstLetterObjects.nativeActorLookPointCues } : {}),
  ...(slot === 24 ? { nativeFaceClipCues: letterPresentation.nativeFaceClipCues } : {}),
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
  }, {
    // DJHN keeps this folded letter in the room's shared OMG resource,
    // not its own AUTH archive. Preserve the native hinge model, not a quad.
    sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/OMG.PKS"),
    sourceSha256: "57527b1004b9900358100c12ae7cc5fe948a2ace59a7c751ef1624403c6c748b",
    archiveMember: "MALS509G.CHRM",
    assetPath: "play/assets/dobuita/djhn/MALS509G.CHRM",
    byteLength: 1452,
    sha256: "0d5182cde209ca1c188e4a7af48f65e79d0d5713469bd2c951a0af69a624dd39",
  }],
  attachedObjects: {
    MALS: {
      browserFilename: "S1_D000_MALS509G.MT5",
      assetPath: "play/assets/dobuita/djhn/MALS509G.CHRM",
      attachments: [
        // Detach/rebind at one authored frame has one final visible pose.
        // Keep the last source operation, as for TOKI's same-frame handoff.
        ...firstLetterObjects.attachedObjectCues.filter((cue, index, values) => (
          values.findLastIndex(value => value.frame === cue.frame) === index
        )).map(firstLetterCue),
        ...letterObjects.attachedObjectCues.map(letterCue),
      ],
      nodeTransforms: [
        ...firstLetterObjects.nodeTransformCues.map(firstLetterCue),
        ...letterObjects.nodeTransformCues.map(letterCue),
      ],
    },
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
