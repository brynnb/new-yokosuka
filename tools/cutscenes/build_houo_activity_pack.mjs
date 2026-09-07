#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNativeAseqActivityPack,
  sha256,
} from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC2_EXTRACTED_ROOT,
  path.join(root, "extracted_disc2_v2"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 2 extraction was not found");
const disc1Root = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!disc1Root) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const mapinfo = readFileSync(path.join(disc1Root, "data/SCENE/01/JHD0/MAPINFO.BIN"));
const callbackEvidence = JSON.parse(readFileSync(
  path.join(root, "tools/evidence/houo-native-callback-ir.json"),
  "utf8",
));
if (
  sha256(mapinfo) !== callbackEvidence.source?.mapinfoSha256
  || callbackEvidence.source?.mapEntryFunction !== "0x537d4"
  || callbackEvidence.source?.callbackFunction !== "0x24158"
) throw new Error("HOUO native callback evidence changed");
const callbackPresentation = extractNativeAseqCallbackPresentation({
  bytes: mapinfo,
  callbackFunction: 0x24158,
  nativeFunction: callbackEvidence.function,
  durationFrames: 1810,
  activitySlot: 9,
});
if (
  callbackPresentation.nativeFaceClipCues.length !== 37
  || callbackPresentation.nativeFaceControllerCues.length !== 16
  || callbackPresentation.nativeDetailedHandDefaults.length !== 1
) throw new Error("HOUO callback presentation changed");

const textureArchive = readFileSync(path.join(sourceRoot, "data/SCENE/02/JHD0/HOUO.PKF"));
if (
  textureArchive.length !== 164248
  || sha256(textureArchive) !== "14c5048e533855d290360e62db432308d804bb93ff1fcfeed6185a22f7412e47"
) throw new Error("HOUO texture archive changed");
const texturePack = extractNativeTexnPack(textureArchive, "HOUO.PKF");
if (
  texturePack.entries.length !== 2
  || texturePack.bytes.length !== 163936
  || sha256(texturePack.bytes) !== "13dfa21dc9400452c19251a1a18daf34c1f3273345d4a1c501e2fb382426feba"
) throw new Error("HOUO exact TEXN inventory changed");

const outputDirectory = path.join(root, "play/assets/hazuki/houo");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_houo_activity_pack.mjs",
  resourceName: "HOUO",
  disc: 2,
  sourcePath: path.join(sourceRoot, "data/SCENE/02/JHD0/HOUO.PKS"),
  sourceManifestPath: "extracted_disc2_v2/data/SCENE/02/JHD0/HOUO.PKS",
  archiveSha256: "4e225fb669724ffa169e49dd55c122bf434da972a03e1b3be919c77ea048cf0d",
  expectedMembers: [
    { name: "M_01DIS.MOTN", byteLength: 51532, sha256: "73f7d5b63ef4ebe1d2be5d2264ecaa8493bc851831b8ff62d14407ed5c6a43ee" },
    { name: "PNX02M6G.CHRM", byteLength: 6028, sha256: "56e82a2f5ed61e49e9f7904f6ee3b4bd7e6a2fc5c68053ad96fbd5d14a35ec91" },
    { name: "SEQDATAD.AUTH", byteLength: 31008, sha256: "33c400d02f7a5fbc2d3a9c9be17529b289b9432ad2c78a0985beee522a1a446c" },
  ],
  bindingEvidence: "tools/evidence/player-cutscene-owner-discovery.json",
  selectionRule: "exact SEQDATAD member installed by JHD0 owner state 97",
  audioManifest: "public/audio/world/houo/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/houo",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["PNX02M6G.CHRM"],
  generatedAssets: [{
    assetPath: "play/assets/hazuki/houo/HOUO_textures.bin",
    bytes: texturePack.bytes,
    byteLength: 163936,
    sha256: "13dfa21dc9400452c19251a1a18daf34c1f3273345d4a1c501e2fb382426feba",
    source: {
      path: "extracted_disc2_v2/data/SCENE/02/JHD0/HOUO.PKF",
      sha256: "14c5048e533855d290360e62db432308d804bb93ff1fcfeed6185a22f7412e47",
      recordOffsets: texturePack.entries.map(entry => entry.sourceOffset),
      textureIds: texturePack.entries.map(entry => entry.id),
    },
  }],
  sceneObjects: {
    MIRR: {
      model: "PNX02M6G",
      browserFilename: "PNX02M6G.CHRM",
      assetPath: "play/assets/hazuki/houo/PNX02M6G.CHRM",
      textureAssetPath: "play/assets/hazuki/houo/HOUO_textures.bin",
      lifecycle: { kind: "auth-scoped" },
    },
  },
  motionBanks: [{
    bank: 16,
    member: "M_01DIS.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT1_MIIRU_KAGAMI_HOUOUKYOUHAKKEN0_0100" },
      { index: 1, name: "OTH_FUK_AT1_MIIRU_KAGAMI_HOUOUKYOUHAKKEN0_0100" },
      { index: 2, name: "IWA_FUK_MISERU_TEGAMI_0125" },
    ],
  }],
  activities: [{
    slot: 9,
    primaryPointer: 394211,
    secondaryPointer: 394224,
    file: "SEQDATAD.AUTH",
    actors: ["AKIR", "FUKU", "MIRR"],
    durationFrames: 1810,
    frameCount: 43,
    commandCounts: { camera: 1, move: 3, motion: 4, sound: 25, voice: 16 },
    nativeFaceClipCues: callbackPresentation.nativeFaceClipCues,
    nativeFaceControllerCues: callbackPresentation.nativeFaceControllerCues,
    nativeDetailedHandDefaults: [
      {
        activitySlot: 9,
        actorTag: "AKIR",
        sides: ["left", "right"],
        sourceFunction: "0x26c88",
        ownerCallFileOffset: "0x26b5a",
      },
      {
        activitySlot: 9,
        actorTag: "FUKU",
        sides: ["left", "right"],
        sourceFunction: "0x26c88",
        ownerCallFileOffset: "0x26b66",
      },
    ],
  }],
});

console.log(`Wrote exact HOUO activity pack to ${outputDirectory}`);
