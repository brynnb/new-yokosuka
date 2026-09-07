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
  ["IWA_F.CHRM", 13324, "cafdc4b1c2583c332d7a41828ec05af6e17d63f781f0c1f3224ce71c9c3deb96"],
  ["IWA_FTBL.BIN", 4544, "406ceb8399fba2ef989af0871b47c42ad62e2a1aadf536eba39f2af4c78501c3"],
  ["IWA_HM.BIN", 9264, "e9ac04b80a5b7f693d6af299683073906c5a2bd0d47d88676a6707501bfb0e06"],
  ["IWA_M.CHRM", 64344, "f8d38c67244702f2fe660acbab1e1e5992ae20bd116ee090acd065120baec43c"],
  ["IWA_TL.CHRM", 12980, "d951b8720a3c2c35f6b0f13f634c0e074eee50f81caca090fe1069d5437017a9"],
  ["IWA_TR.CHRM", 13036, "9fecfb97887c6cd63d2e054cbbcbd191968ac7ebf2d9a23bde23d0e9829b144e"],
  ["JKA_F.CHRM", 16224, "64743c03bbf084aaed925e14e5dcfd5c18d416dcf3848f0b78a29a96ee80ab67"],
  ["JKA_FTBL.BIN", 6144, "37caf2b88d92a32607418fbcc63607e7c4a70f23a851e34e3d494a2928a12988"],
  ["JKA_M.CHRM", 51552, "ec4eed4dc16affb58885424c6493e42fae37ef8db29dcc37ecc1cd6322782bc4"],
  ["MAP12.MAPM", 24464, "c2c2694b07c28b7519bc3bd955371e85a9f253a1c24728cb6ab596717809105c"],
  ["M_0125.MOTN", 17136, "b0905f14ed13198a44054e0ac78954521c5dfa2347c1edf86ced653b447f3ece"],
  ["SEQDATA5.AUTH", 6568, "1ab4b319189417c1557480a6f3e86d3b8aea575d5f3f125828a971473945be3f"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(root, "play/assets/hazuki/hihy");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_hihy_activity_pack.mjs",
  resourceName: "HIHY",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JHD0/HIHY.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JHD0/HIHY.PKS",
  archiveSha256: "6fee93fbde9d7f778b776ba2dfe2d1487e333d1cc72110cc9a23e0929481a705",
  expectedMembers,
  bindingEvidence: "tools/evidence/hihy-native-lifecycle.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot 0",
  audioManifest: "public/audio/world/hihy/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/hihy",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["IWA_M.CHRM", "MAP12.MAPM"],
  externalAssets: [{
    sourcePath: path.join(sourceRoot, "data/SPRITE/SCROLL25.SPR"),
    sourceSha256: "a29ec4d993bf94f8d491acc395629f547baaf78e5113e8ff27d71bd7747328fb",
    assetPath: "play/assets/hazuki/hihy/SCROLL25.SPR",
    byteLength: 262196,
    sha256: "a29ec4d993bf94f8d491acc395629f547baaf78e5113e8ff27d71bd7747328fb",
  }],
  scrollSprites: [{
    path: "play/assets/hazuki/hihy/SCROLL25.SPR",
    nativePath: "scroll",
    nativeName: "SCROLL25.SPR",
    nativeSlot: 0,
    lifecycle: "script-allocated",
  }],
  packageActors: {
    IWAO: {
      label: "Iwao Hazuki",
      modelCode: "IWA_M",
      assetPath: "play/assets/hazuki/hihy/IWA_M.CHRM",
      textureAssetPath: "play/assets/characters/IWA_textures.bin",
      browserFilename: "IWA_M.CHRM",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  sceneObjects: {
    MOON: {
      model: "MAP12",
      browserFilename: "MAP12.MAPM",
      assetPath: "play/assets/hazuki/hihy/MAP12.MAPM",
      lifecycle: { kind: "auth-scoped" },
    },
  },
  motionBanks: [{
    bank: 17,
    member: "M_0125.MOTN",
    expectedSequences: [
      { index: 0, name: "IWA_MITITUKURU_0125" },
      { index: 1, name: "JAK_MITIWAKARAN2_0125" },
      { index: 2, name: "JAK_MITIWAKARAN_0125" },
      { index: 3, name: "OTH_IWA_YOKOMUKIKAIWA_0110" },
      { index: 4, name: "JAK_MITIWAKARAN_LP_0125" },
    ],
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x5ecb3,
    secondaryPointer: 0x5ecb8,
    file: "SEQDATA5.AUTH",
    actors: ["MOON", "IWAO", "JAKR"],
    durationFrames: 2210,
    commandCounts: { camera: 1, move: 3, motion: 12, voice: 13 },
  }],
});

console.log(`Wrote exact HIHY activity pack to ${outputDirectory}`);
