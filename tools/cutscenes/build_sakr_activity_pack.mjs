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
  ["IWA_B.CHRM", 13332, "5669a7b91deb767bcaf92fa7af591e7e623cb5c4cdd59a2569c5b3a3d1e00108"],
  ["IWA_F.CHRM", 13324, "4172b7fc4415f8376045b560542be6f81ff32463f3780224ba4ac5e03eea8e25"],
  ["IWA_FTBL.BIN", 4544, "406ceb8399fba2ef989af0871b47c42ad62e2a1aadf536eba39f2af4c78501c3"],
  ["IWA_HM.BIN", 9264, "e9ac04b80a5b7f693d6af299683073906c5a2bd0d47d88676a6707501bfb0e06"],
  ["IWA_M.CHRM", 64000, "df9d4ab5b9e98c26214877345586be217a1307e62ef1089bced6c71b3e8615da"],
  ["IWA_TL.CHRM", 12980, "d951b8720a3c2c35f6b0f13f634c0e074eee50f81caca090fe1069d5437017a9"],
  ["IWA_TR.CHRM", 13036, "9fecfb97887c6cd63d2e054cbbcbd191968ac7ebf2d9a23bde23d0e9829b144e"],
  ["JKB_F.CHRM", 16248, "c0e7590a873365602e06fe8d85aeb3591cad116efb5902d13350a054abc64f19"],
  ["JKB_FTBL.BIN", 6144, "ca13ce45c2c5e1829c87c9144d5e5f8f2e1fc0a43f3a5fd186821f71bcedc8ff"],
  ["JKB_HM.BIN", 9168, "e7529472af95b35041d5cf7647ece11e764f404d6f433aeb581241b4732dac02"],
  ["JKB_M.CHRM", 52008, "9717c743c1931d131276c7f9d971f675e06df229b85a74bd4738ff5f776ca28d"],
  ["JKB_TL.CHRM", 12916, "728476d7967e2673728ddf9aa6792c06d96756ffeb028ffb2575f159d90dc742"],
  ["JKB_TR.CHRM", 12820, "be4c8f6c6e4edaa5be1eaf437c50a03c62c549b414165ca54d336f7a0a778af7"],
  ["MAP.MAPM", 463496, "d4efa0ba05868ecc57aae3191c1cd190b2de3d5b2d5b3753e50fd892b64a9231"],
  ["MAP01.MAPM", 69344, "179816471d652ca06a54994cc9a5b882476d10a34507d11b25c9c743a9a71bbd"],
  ["MAP02.MAPM", 31484, "e670614125ac0163d091361c35c4b19c9586008309e9857a291d9fc06a2efa06"],
  ["MAP03.MAPM", 86648, "da42727763a50488da66ba97ac2f78bb08d146a1fcb45c327167a2767823e62d"],
  ["M_0128.MOTN", 109628, "984f330945ea22747915019c0c0afc5e50941551263db9bcef7090c9a8bfd2fa"],
  ["SEQDATA0.AUTH", 9264, "e2160469503e7faf9b850ad1513f7dc67aea33288fbbee3d626003599b338aee"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(root, "play/assets/yd01/sakr");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_sakr_activity_pack.mjs",
  resourceName: "SAKR",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/YD01/SAKR.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/YD01/SAKR.PKS",
  archiveSha256: "dbe1067dd36caa78e75afd9343af2cbd052efdc60eca3096116d371a0c2ef57d",
  expectedMembers,
  bindingEvidence: "tools/evidence/sakr-native-lifecycle.json",
  selectionRule: "exact member SEQDATA0.AUTH selected by slot 0",
  audioManifest: "public/audio/world/sakr/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/yd01/sakr",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  // The world loader and package actor loader reuse the canonical YD01 map,
  // body, FACE, and HAND models. The archive inventory remains fully pinned,
  // but only exact activity-local playback data is emitted here.
  packageActors: {
    IWAO: {
      label: "Iwao Hazuki",
      modelCode: "IWA_M",
      browserFilename: "S1_YD01_IWA_M.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
    JAKR: {
      label: "Young Ryo Hazuki",
      modelCode: "JKB_M",
      browserFilename: "S1_YD01_JKB_M.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  motionBanks: [{
    bank: 17,
    member: "M_0128.MOTN",
    expectedSequences: [
      { index: 0, name: "IWA_OSIERU_RIMONTYOUTYU_KAISOU_0112" },
      { index: 1, name: "IWA_RENSYU_0128" },
      { index: 2, name: "JAK_OSIERU_RIMONTYOUTYU_KAISOU_0112" },
      { index: 3, name: "JAK_RENSYU_0128" },
      { index: 4, name: "JAK_OSIERU_RIMONTYOUTYU_KAISOU_0122" },
      { index: 5, name: "GAK_JAK_OSIERU_RIMONTYOUTYU_KAISOU_0122" },
    ],
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x2d99,
    secondaryPointer: 0x2da6,
    file: "SEQDATA0.AUTH",
    actors: ["IWAO", "JAKR"],
    durationFrames: 1559,
    frameCount: 27,
    commandCounts: { camera: 1, move: 2, motion: 13, voice: 12, sound: 6 },
  }],
});

console.log(`Wrote exact SAKR activity pack to ${outputDirectory}`);
