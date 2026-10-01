#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackHandPresentation, extractNativeAseqHandInitialization } from "../lib/NativeAseqCallbackPresentation.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../lib/NativeAseqCallbackObjectPresentation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");
const evidence = JSON.parse(readFileSync(path.join(repoRoot, "tools/evidence/d0w0-native-callback-ir.json")));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/D000/MAPINFO.BIN"));
if (sha256(mapinfo) !== evidence.source.mapinfoSha256 || evidence.function.id !== "0x5870c") {
  throw new Error("D0W0 hand callback source changed");
}
const callbackBySlot = new Map();
for (const block of evidence.function.blocks) for (const comparison of block.frameFieldComparisons) {
  if (comparison.fieldOffset !== 0 || comparison.comparison !== "cmp/eq") continue;
  const branch = evidence.function.blocks.find(block => block.id === comparison.resolvedBranch.comparisonTrueSuccessor);
  const calls = branch?.actions.filter(action => action.kind === "directCall") || [];
  if (calls.length !== 1 || (callbackBySlot.has(comparison.constant)
    && callbackBySlot.get(comparison.constant) !== calls[0].targetFileOffset)) {
    throw new Error("D0W0 callback dispatch is ambiguous");
  }
  callbackBySlot.set(comparison.constant, calls[0].targetFileOffset);
}
const nativeHandPoseTables = {};
const handsBySlot = new Map();
for (const [activitySlot, callback] of callbackBySlot) {
  const initial = extractNativeAseqHandInitialization({
    bytes: mapinfo, nativeFunction: evidence.supportingFunctions.find(fn => fn.id === "0x59de8"),
    functions: evidence.supportingFunctions, activitySlot,
  });
  const result = extractNativeAseqCallbackHandPresentation({
    bytes: mapinfo, callbackFunction: Number.parseInt(callback, 16), activitySlot,
    nativeFunction: evidence.supportingFunctions.find(fn => fn.id === callback),
    functions: evidence.supportingFunctions,
  });
  Object.assign(nativeHandPoseTables, result.nativeHandPoseTables);
  // Owner setup precedes frame-zero callback overrides in every selection.
  const initialCues = initial.nativeBodyHandPoseCues.map((cue, sourceOrder) => ({ ...cue, sourceOrder }));
  result.nativeHandPoseCues = result.nativeHandPoseCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + initialCues.length }));
  result.nativeHandComponentCues = result.nativeHandComponentCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + initialCues.length }));
  result.nativeBodyHandPoseCues = [...initialCues, ...result.nativeBodyHandPoseCues.map(cue =>
    ({ ...cue, sourceOrder: cue.sourceOrder + initialCues.length }))];
  handsBySlot.set(activitySlot, result);
}
const handFiles = [
  ["YMG_TL.MT5", 176836, "003f9047079444adece2ba0653dd50f0f506c5eec85d673bf3731938741de419"],
  ["YMG_TR.MT5", 176892, "a1c01d3cc6df5bebf495fed8b38a64c66e57842e15213ac16d55b9da42c6682b"],
  ["YMG_HM.BIN", 9264, "756f07c80fa715636fb1a92e480e2ef8d045c5ede1040faa388ed2fd43682f74"],
];
const handAsset = index => ({
  path: `play/assets/dobuita/d0w0/${handFiles[index][0]}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${handFiles[index][0]}`,
  byteLength: handFiles[index][1], sha256: handFiles[index][2],
});

const expectedMembers = Object.freeze([
  ["CUPK300G.CHRM", 3108, "e51f0d36a61171dedcebddae62b52ef9429859808bd5fd302b11aae1b1869c04"],
  ["M_01YAMA.MOTN", 165336, "26c5c03c5386f2ac2c576538c4de224a32e16facf66db72e363a7c7c7abb6e41"],
  ["M_D0W0.MOTN", 4660, "5756d7870039bb01b30301c06967a2e9c68b56eeb31ff5830d1a59700481ba57"],
  ["M_JHW0.MOTN", 12320, "528415ccb65b399647d08f46fb983a3550f3ec9dbd0581e2443d4492b9a8b202"],
  ["SEQDATA1.AUTH", 39820, "8a53eccca3fc3c40fab9935e6ea10c6d29aa3d5536129c69a4862ffbe4a2b6c6"],
  ["SEQDATA2.AUTH", 4904, "a9393cd99ae10760c9de943cce5621baf409182f63459a3bb70d829520aedc02"],
  ["SEQDATA3.AUTH", 5220, "de16a1d8039bd1c92a176c706d38ef4ceca5dbae695d96012e081f9d16d26b94"],
  ["SEQDATA4.AUTH", 14184, "3714dc9e0b12f39c2864c8bca4137bae6dc20eae4b8db82a72e34f7382c95da7"],
  ["SEQDATA5.AUTH", 5000, "3fae97c475fd411227f382b81dbc86a02f3f7208da9dd9db9dc9b398e4beeae3"],
  ["SEQDATA6.AUTH", 5392, "4fe1bdd127d22d6f472d73cbaca32aa2a52176a826663144aa9f8354b6ccdefb"],
  ["SEQDATA7.AUTH", 5528, "19fff3b2c54e34f0aee962f880c0f8da7643004c75f7a9c61fc7223257f85fdd"],
  ["SEQDATA8.AUTH", 15652, "808ade83f2bc13975efee585aeee5d1f5c14e831ff921b940abe18c06a822e8c"],
  ["SEQDATA9.AUTH", 3532, "57e3421025bcbec1af1ca193397bd746cdf962a16fc9940f44fc7743e3d069f9"],
  ["SEQDATAA.AUTH", 18524, "e90c79d1bfac774bfcd7348af08498111ecd61b6360eafbc295761eaf875a9d7"],
  ["SEQDATAB.AUTH", 3724, "4dc9bcea8e03279160471f71942096f27fde3475c7afde34d2d5a9cacae65a80"],
  ["SEQDATAC.AUTH", 11084, "cacb30bf13ad287d67396b30d14cf2f769653f71505ad50ee9bce893d1dd0ad9"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const activityFacts = Object.freeze([
  [4, 0xadb60, 0xadb6d, "1", 3320, 77, ["COP_", "AKIR", "YAMA"], { camera: 1, move: 3, motion: 31, sound: 35, voice: 22 }],
  [5, 0xadb72, 0xadb7f, "2", 690, 21, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 9, voice: 6, sound: 10 }],
  [6, 0xadb84, 0xadb91, "3", 1260, 26, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 10, voice: 9, sound: 11 }],
  [7, 0xadb96, 0xadba3, "4", 900, 26, ["COP_", "AKIR", "YAMA"], { camera: 1, move: 3, motion: 9, sound: 15, voice: 6 }],
  [8, 0xadba8, 0xadbb5, "5", 670, 21, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 9, sound: 10, voice: 6 }],
  [9, 0xadbba, 0xadbc7, "6", 980, 28, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 7, voice: 8, sound: 17 }],
  [10, 0xadbcc, 0xadbd9, "7", 920, 35, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 6, sound: 25, voice: 7 }],
  [11, 0xadbde, 0xadbeb, "8", 1057, 42, ["COP_", "AKIR", "YAMA"], { camera: 1, move: 3, motion: 8, sound: 27, voice: 9 }],
  [12, 0xadbf0, 0xadbfd, "9", 600, 13, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 2, voice: 5, sound: 7 }],
  [13, 0xadc02, 0xadc0f, "A", 1040, 37, ["COP_", "AKIR", "YAMA"], { camera: 1, move: 3, motion: 8, voice: 9, sound: 24 }],
  [14, 0xadc14, 0xadc21, "B", 600, 13, ["AKIR", "YAMA"], { camera: 1, move: 2, motion: 2, voice: 5, sound: 7 }],
  [15, 0xadc26, 0xadc33, "C", 1234, 17, ["COP_", "AKIR", "YAMA"], { camera: 1, move: 3, motion: 10, voice: 11 }],
]);
const activities = activityFacts.map(([
  slot, primaryPointer, secondaryPointer, suffix, durationFrames, frameCount,
  actors, commandCounts,
]) => ({
  slot,
  primaryPointer,
  secondaryPointer,
  file: `SEQDATA${suffix}.AUTH`,
  durationFrames,
  frameCount,
  actors,
  commandCounts,
  nativeHandPoseCues: handsBySlot.get(slot)?.nativeHandPoseCues,
  nativeHandComponentCues: handsBySlot.get(slot)?.nativeHandComponentCues,
  nativeBodyHandPoseCues: handsBySlot.get(slot)?.nativeBodyHandPoseCues,
}));
const cupAttachments = activities.flatMap(activity => extractNativeAseqCallbackObjectPresentation({
  bytes: mapinfo, callbackFunction: Number.parseInt(callbackBySlot.get(activity.slot), 16),
  nativeFunction: evidence.supportingFunctions.find(fn => fn.id === callbackBySlot.get(activity.slot)),
  activitySlot: activity.slot, durationFrames: activity.durationFrames, objectTags: ["COP_"],
}).attachedObjectCues);
if (callbackBySlot.size !== activities.length || activities.some(activity =>
  !handsBySlot.has(activity.slot) || [...activity.nativeHandPoseCues, ...activity.nativeBodyHandPoseCues]
    .some(cue => cue.frame >= activity.durationFrames))) throw new Error("D0W0 hand activity ownership changed");

const outputDirectory = path.join(repoRoot, "play/assets/dobuita/d0w0");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_d0w0_activity_pack.mjs",
  resourceName: "D0W0",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/D0W0.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/D0W0.PKS",
  archiveSha256: "baf951d961b6987d6884dfe710fd31c7149f3ed5fc55dd33bc440d36d3efb5f8",
  expectedMembers,
  bindingEvidence: "tools/evidence/d0w0-native-lifecycle.json",
  selectionRule: "operation-0x013e slots 4 through 15 select SEQDATA1.AUTH through SEQDATAC.AUTH",
  audioManifest: "public/audio/world/d0w0/manifest.json",
  nativeHandPoseTables,
  externalAssets: handFiles.map(([filename, byteLength, digest]) => ({
    sourcePath: path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${filename}`),
    assetPath: `play/assets/dobuita/d0w0/${filename}`, byteLength, sha256: digest,
  })),
  handAssets: {
    YAMA: {
      actorTag: "YAMA", bodyModelCode: "YMG_L", handCode: "YMG",
      bodyHandRenderKeys: { left: -66, right: -65 },
      left: { rootRenderKey: 11, model: handAsset(0) },
      right: { rootRenderKey: 6, model: handAsset(1) },
      rig: { ...handAsset(2), transformNodeCount: 71, vertexCount: 306,
        pointerOffsets: [24, 168, 8952, 5848, 6472, 9264] },
      presentation: { attachment: "body-hand-node-world-matrix", initialPose: "hm-bind-pose",
        deformationAssetRetained: true, nativePoseOperation: "0x005e" },
    },
  },
  attachedObjects: {
    COP_: {
      sceneObject: true,
      browserFilename: "S1_D000_CUPK300G.MT5",
      attachments: cupAttachments,
    },
  },
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/d0w0",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["CUPK300G.CHRM", "M_D0W0.MOTN", "M_JHW0.MOTN"],
  sceneObjects: {
    COP_: {
      model: "CUPK300",
      browserFilename: "S1_D000_CUPK300G.MT5",
      assetPath: "play/assets/dobuita/d0w0/CUPK300G.CHRM",
      lifecycle: { kind: "auth-scoped" },
      nativeBinding: {
        archiveMember: "CUPK300G.CHRM",
        archiveMemberSha256: "e51f0d36a61171dedcebddae62b52ef9429859808bd5fd302b11aae1b1869c04",
        rule: "COP_ is the only non-character AUTH tag and CUPK300G is the sole archive-local CHRM member",
      },
    },
  },
  motionBanks: [{
    bank: 16,
    member: "M_01YAMA.MOTN",
    expectedSequences: Array.from({ length: 16 }, (_, index) => ({
      index,
      name: [
        "AKI_AUTO1_MISERU_KASANEATE_0100",
        "AKI_AUTO2_KOTOWARU_KASANEATE_0100",
        "AKI_AUTO3_SETUMEI_KASANEATE_0100",
        "AKI_AUTO4_OSOREITTA_KASANEATE_0100",
        "AKI_AUTO5_JOUDEKI_KASANEATE_0100",
        "AKI_AUTO6AB_DAIJOUBU_KASANEATE_0100",
        "AKI_AUTO6C_MADAWAKAI_KASANEATE_0100",
        "AKI_AUTO7_ZANNEN_KASANEATE_0100",
        "JIJ_YMG_AUTO1_MISERU_KASANEATE_0100",
        "JIJ_YMG_AUTO2_KOTOWARU_KASANEATE_0100",
        "JIJ_YMG_AUTO3_SETUMEI_KASANEATE_0100",
        "JIJ_YMG_AUTO4_OSOREITTA_KASANEATE_0100",
        "JIJ_YMG_AUTO5_JOUDEKI_KASANEATE_0100",
        "JIJ_YMG_AUTO6AB_DAIJOUBU_KASANEATE_0100",
        "JIJ_YMG_AUTO6C_MADAWAKAI_KASANEATE_0100",
        "JIJ_YMG_AUTO7_ZANNEN_KASANEATE_0100",
      ][index],
    })),
  }],
  activities,
});

console.log(`Wrote exact D0W0 activity pack to ${outputDirectory}`);
