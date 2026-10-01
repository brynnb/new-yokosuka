#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackHandPresentation, extractNativeAseqHandInitialization } from "../lib/NativeAseqCallbackPresentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const evidence = JSON.parse(readFileSync(path.join(root, "tools/evidence/sakr-native-callback-ir.json")));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/YD01/MAPINFO.BIN"));
if (sha256(mapinfo) !== evidence.source.mapinfoSha256 || evidence.function.id !== "0x70c") {
  throw new Error("SAKR hand callback source changed");
}
// The callback's signed word at frame+2 starts at zero and increments once
// before countdown(1), only while ASEQ is running. It is the AUTH frame clock,
// not a hand animation index. Keep the original word-load gates and timings.
const actions = evidence.function.blocks.flatMap(block => block.actions);
if (!actions.some(action => action.kind === "frameFieldWrite" && action.offset === 2
  && action.width === 2 && action.value === 0)
  || !actions.some(action => action.kind === "frameFieldExpressionWrite" && action.offset === 2
    && action.expression?.kind === "add" && action.expression.right?.value === 1)) {
  throw new Error("SAKR callback frame clock changed");
}
const hands = extractNativeAseqCallbackHandPresentation({
  bytes: mapinfo, callbackFunction: 0x70c, nativeFunction: evidence.function, activitySlot: 0,
});
const setup = evidence.supportingFunctions.find(fn => fn.id === "0x1a4");
const helper = evidence.supportingFunctions.find(fn => fn.id === "0x384");
// Resource preparation yields before these two calls. Bind only the proven
// actor-initializer calls, not the yielding resource owner's entire function.
const initial = setup.blocks.flatMap(block => block.actions)
  .filter(action => action.kind === "directCall" && action.targetFileOffset === helper.id)
  .flatMap(call => extractNativeAseqHandInitialization({
    bytes: mapinfo, nativeFunction: helper, functions: evidence.supportingFunctions,
    activitySlot: 0, entryArguments: call.arguments, ownerCallFileOffset: call.callFileOffset,
  }).nativeBodyHandPoseCues);
if (initial.length !== 4 || hands.nativeHandPoseCues.length !== 16
  || hands.nativeBodyHandPoseCues.length !== 2) throw new Error("SAKR hand command coverage changed");
hands.nativeHandPoseCues = hands.nativeHandPoseCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + initial.length }));
hands.nativeHandComponentCues = hands.nativeHandComponentCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + initial.length }));
hands.nativeBodyHandPoseCues = [
  ...initial.map((cue, sourceOrder) => ({ ...cue, sourceOrder })),
  ...hands.nativeBodyHandPoseCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + initial.length })),
];
const handFiles = [
  ["IWA_TL.MT5", 185148, "f19af6e7483e12e39a7db653661e2cc15b63a27bda5005929d4581251603b80b"],
  ["IWA_TR.MT5", 185204, "bd606f4acca38d5a1ab9ccd538f95b93c0211d1fce2302f4e8a128c2da94590d"],
  ["IWA_HM.BIN", 9264, "e9ac04b80a5b7f693d6af299683073906c5a2bd0d47d88676a6707501bfb0e06"],
  ["JKB_TL.MT5", 193240, "aed6a05ffb8bb0eeed4fb6826b70397bae21e149d4cb4a2148862309523726df"],
  ["JKB_TR.MT5", 193144, "986057c4ca7927c10594c1a3047b15b21a1995dfd54878ba896a88a4aa81678e"],
  ["JKB_HM.BIN", 9168, "e7529472af95b35041d5cf7647ece11e764f404d6f433aeb581241b4732dac02"],
];
const handAsset = index => ({
  path: `play/assets/yd01/sakr/${handFiles[index][0]}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${handFiles[index][0]}`,
  byteLength: handFiles[index][1], sha256: handFiles[index][2],
});
// Original global MT5 vertices/normals match the archive-local CHRM hands;
// the global resources also contain their textures. HM bytes match exactly.
const handAssets = Object.fromEntries([
  ["IWAO", "IWA", 0, 306, [24, 168, 8952, 5848, 6472, 9264]],
  ["JAKR", "JKB", 3, 301, [24, 168, 8864, 5848, 6456, 9168]],
].map(([actorTag, handCode, index, vertexCount, pointerOffsets]) => [actorTag, {
  actorTag, handCode, bodyModelCode: `${handCode}_M`, bodyHandRenderKeys: { left: -66, right: -65 },
  left: { rootRenderKey: 11, model: handAsset(index) },
  right: { rootRenderKey: 6, model: handAsset(index + 1) },
  rig: { ...handAsset(index + 2), transformNodeCount: 71, vertexCount, pointerOffsets },
  presentation: { attachment: "body-hand-node-world-matrix", initialPose: "hm-bind-pose",
    deformationAssetRetained: true, nativePoseOperation: "0x005e" },
}]));

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
  nativeHandPoseTables: hands.nativeHandPoseTables,
  handAssets,
  externalAssets: handFiles.map(([filename, byteLength, digest]) => ({
    sourcePath: path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${filename}`),
    assetPath: `play/assets/yd01/sakr/${filename}`, byteLength, sha256: digest,
  })),
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
    nativeHandPoseCues: hands.nativeHandPoseCues,
    nativeHandComponentCues: hands.nativeHandComponentCues,
    nativeHandComponentLimitations: hands.nativeHandComponentLimitations,
    nativeBodyHandPoseCues: hands.nativeBodyHandPoseCues,
  }],
});

console.log(`Wrote exact SAKR activity pack to ${outputDirectory}`);
