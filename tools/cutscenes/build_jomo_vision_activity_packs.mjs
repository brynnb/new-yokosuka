#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const disc2Root = [
  process.env.SHENMUE_DISC2_EXTRACTED_ROOT,
  path.join(root, "extracted_disc2_v2"),
].filter(Boolean).find(existsSync);
const disc3Root = [
  process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
  path.join(root, "extracted_disc3_v2"),
].filter(Boolean).find(existsSync);
if (!disc2Root || !disc3Root) {
  throw new Error("exact Shenmue Disc 2 and Disc 3 extractions are required");
}

const evidence = "tools/evidence/player-cutscene-owner-discovery.json";
const selectionRule = "exact cross-disc AUTH member selected by JOMO owner 0x4f758";
const expected = values => values.map(([name, byteLength, sha256]) => ({
  name,
  byteLength,
  sha256,
}));
const presentation = (presentedTags = []) => presentedTags
  .map(actorTag => ({ actorTag, presented: true }));
const persistent = (model, assetPath, browserFilename = path.basename(assetPath)) => ({
  model,
  browserFilename,
  assetPath,
  lifecycle: { kind: "room-script-persistent" },
  initialPresentation: {
    position: [0, 0, 0],
    rotationDegrees: [0, 0, 0],
    scale: [1, 1, 1],
  },
});
const scoped = (model, assetPath, browserFilename = path.basename(assetPath)) => ({
  model,
  browserFilename,
  assetPath,
  lifecycle: { kind: "auth-scoped" },
});

const sharedKkyMotion = path.join(root, "play/assets/hazuki/kkyc/M_01KKY.MOTN");
const sharedKkyMotionDefinition = {
  bank: 16,
  sourcePath: sharedKkyMotion,
  assetPath: "play/assets/hazuki/kkyc/M_01KKY.MOTN",
  byteLength: 132588,
  sha256: "3b44ddf768fdc6c1405ab7ffca32cc7431b86b9af7b3644fe35d3b1cb0e58c18",
  parseOptions: { sequenceIndices: [3, 7, 8, 16] },
  expectedSequences: [
    [3, "SIN_HUSIGINA_HITO_0609"],
    [7, "SIN_OHI_GENSOU_3_0100"],
    [8, "SIN_OHI_OSUWARI_0100"],
    [16, "KOK_OHI_FLASH_BACK_0100"],
  ].map(([index, name]) => ({ index, name })),
};

const packs = [{
  resourceName: "KKYA",
  disc: 3,
  sourceRoot: disc3Root,
  archiveSha256: "c5f1253ccac0592eea434af73254a0a5e73db6a3a8e24c2ad511459990b4e8a9",
  expectedMembers: expected([
    ["MAP01.MAPM", 124684, "4cef3a7ca80924e809d5d4fb68082f5f75245df36fd91b281743f31da77dc7ec"],
    ["MAP02.MAPM", 40440, "1cd0965438399a459db12a961d47121206655b939be52cc84f1c5cbab7d5b91e"],
    ["PNX02H6G.CHRM", 11604, "d5a1f8ef801384d8558ec1f6ec8b2e96185a131d59027d806daa3e9ccfcc18d4"],
    ["SEQDATA0.AUTH", 2148, "65f0adf42b7f25cb665949af5ff1adadafcdc5c739292f13749d7cb3ccfb83a3"],
  ]),
  outputMembers: ["MAP01.MAPM", "MAP02.MAPM", "PNX02H6G.CHRM"],
  sceneObjects: {
    HOMR: scoped("PNX02H6G", "play/assets/hazuki/kkya/PNX02H6G.CHRM", "S3_JOMO_PNX02H6G.MT5"),
    MAP1: persistent("MAP01", "play/assets/hazuki/kkya/MAP01.MAPM", "S3_JOMO_MAP01.MT5"),
    MAP2: persistent("MAP02", "play/assets/hazuki/kkya/MAP02.MAPM", "S3_JOMO_MAP02.MT5"),
  },
  activity: [50, 614163, 614176, "SEQDATA0.AUTH", ["HOMR"], 1100, 1,
    { camera: 1, move: 1 }, presentation(["MAP1", "MAP2"])],
}, {
  resourceName: "KKYB",
  disc: 2,
  sourceRoot: disc2Root,
  archiveSha256: "40cdb5dd0943a209fe9e3afea9cb88f426e9d520947b5ce0af0cc0baae6b4a6b",
  expectedMembers: expected([
    ["DRE02A1G.CHRM", 1300, "8891298f41f910be13e0f8a73dd609bbb88059d0ed6aa34cdc6f52e10c395847"],
    ["DRGS502G.CHRM", 8556, "3695b11a84c715316c16ec32680e197632015bc6aa18716530ffd03012fad033"],
    ["M_TORI.MOTN", 132456, "faa2483e6bbdfb5cde0fec4a1a1aeb5530330b9e8cfec6538bbe524370b67558"],
    ["PNR02A1G.CHRM", 1300, "63fd47a50fc2b8c28bbfad77c367dfb6708e920b4e4f42e5faea98bd1c19db80"],
    ["PNX02H6G.CHRM", 11604, "d5a1f8ef801384d8558ec1f6ec8b2e96185a131d59027d806daa3e9ccfcc18d4"],
    ["SEQDATA1.AUTH", 3764, "d18f0cc90a5bba968a4d269765dc2cf1e2995f223e390fde0e6ab8d7540fd349"],
    ["TAK02M7G.CHRM", 45816, "3bb785a9e35909dfddf4d0914faaf063668e848f0667fb931acbfa8a503f2e05"],
  ]),
  outputMembers: ["DRE02A1G.CHRM", "DRGS502G.CHRM", "PNR02A1G.CHRM"],
  packageActors: {
    HAWK: {
      label: "Hawk",
      modelCode: "TAK02M7G",
      browserFilename: "S2_JOMO_TAK02M7G.MT5",
      assetPath: "play/assets/introduction/op02/models/TAK02M7G.CHRM",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  sceneObjects: {
    RYMR: scoped("DRGS502G", "play/assets/hazuki/kkyb/DRGS502G.CHRM", "S2_JOMO_DRGS502G.MT5"),
    HOMR: scoped("PNX02H6G", "play/assets/hazuki/kkya/PNX02H6G.CHRM", "S2_JOMO_PNX02H6G.MT5"),
    DRE1: persistent("DRE02A1G", "play/assets/hazuki/kkyb/DRE02A1G.CHRM", "S2_JOMO_DRE02A1G.MT5"),
    PNR1: persistent("PNR02A1G", "play/assets/hazuki/kkyb/PNR02A1G.CHRM", "S2_JOMO_PNR02A1G.MT5"),
  },
  activity: [51, 614200, 614213, "SEQDATA1.AUTH", ["RYMR", "HAWK", "HOMR"], 900, 1,
    { camera: 1, move: 3 }, presentation(["DRE1", "PNR1"])],
}, {
  resourceName: "KKYC",
  disc: 2,
  sourceRoot: disc2Root,
  archiveSha256: "cbe0d96e6530d185ecaee204d74bad93511bbd4584bbec05effed7eb213b93c3",
  expectedMembers: expected([
    ["M_01KKY.MOTN", 132588, "3b44ddf768fdc6c1405ab7ffca32cc7431b86b9af7b3644fe35d3b1cb0e58c18"],
    ["SEQDATA2.AUTH", 5676, "10ab2974a98fe8404ef47b2626508859cb18fcfd37cb401770907fc2a439ce8c"],
    ["SIN_F.CHRM", 15076, "7fb76c9d3b86c780cc0d111c8c9b8011cd1123c73ef1dd5295677eb666e5d767"],
    ["SIN_FTBL.BIN", 8092, "9ce6c79f85666df9d19bdce9210d975aa60ad3b6e68bd97f5770a56b090bb9e7"],
    ["SIN_HM.BIN", 8632, "6245a820d3b4e69388cde3bea95f2d9b0bc3246a77e8ff2254d586e6398fc589"],
    ["SIN_M.CHRM", 119772, "3c060c6f7800e055b3cdb6ada82a3a97443e5bfd7feacd9babda67653fb8a3cb"],
    ["SIN_TL.CHRM", 12676, "d0c2c59ead198eef047313c5852726df5b1ffd0d903baa4e95254e7f38468be0"],
    ["SIN_TR.CHRM", 12764, "6427c37fbdba8b721a0ed0580c89bc9513260f5a1a4df9d5af25fc5226b3962e"],
  ]),
  outputMembers: ["SIN_M.CHRM"],
  packageActors: {
    SINF: {
      label: "Shenhua Ling",
      modelCode: "SIN_M",
      browserFilename: "S2_JOMO_SIN_M.MT5",
      assetPath: "play/assets/hazuki/kkyc/SIN_M.CHRM",
      assetFormat: "MT5",
      characterScale: 1,
      nativeClothRuntimeMode: 4,
      nativeSecondaryMotionRuntimeMode: 1,
    },
  },
  motionBanks: [{
    ...sharedKkyMotionDefinition,
    member: "M_01KKY.MOTN",
    sourcePath: undefined,
    assetPath: undefined,
  }],
  activity: [52, 614237, 614250, "SEQDATA2.AUTH", ["SINF"], 1100, 1,
    { camera: 1, move: 1, motion: 1 }, presentation()],
}, {
  resourceName: "KKYD",
  disc: 3,
  sourceRoot: disc3Root,
  archiveSha256: "639e0f6b629a83b76e7c0973bf16c7ac01d4fd806ed92e9b9a59a9400e527035",
  expectedMembers: expected([
    ["HOUM400G.CHRM", 372, "2b366fd2919e5ecb36f27026a8df7dd917040dd24b8354529ebf069f9e6d066e"],
    ["MAP03.MAPM", 156672, "3aa3abecf4e57bf8650aada68d5f3d95bdfc65acb4b87457581b5a446a863a27"],
    ["M_01KKY.MOTN", 132588, "3b44ddf768fdc6c1405ab7ffca32cc7431b86b9af7b3644fe35d3b1cb0e58c18"],
    ["M_TORI.MOTN", 132456, "faa2483e6bbdfb5cde0fec4a1a1aeb5530330b9e8cfec6538bbe524370b67558"],
    ["SEQDATA3.AUTH", 4552, "44b6cba868f90829083deeb5e673ef8e761a777ffcea55421a29b0d8a8ef8e22"],
    ["SIN_F.CHRM", 15076, "7fb76c9d3b86c780cc0d111c8c9b8011cd1123c73ef1dd5295677eb666e5d767"],
    ["SIN_FTBL.BIN", 8092, "9ce6c79f85666df9d19bdce9210d975aa60ad3b6e68bd97f5770a56b090bb9e7"],
    ["SIN_HM.BIN", 8632, "6245a820d3b4e69388cde3bea95f2d9b0bc3246a77e8ff2254d586e6398fc589"],
    ["SIN_M.CHRM", 119772, "3c060c6f7800e055b3cdb6ada82a3a97443e5bfd7feacd9babda67653fb8a3cb"],
    ["SIN_TL.CHRM", 12676, "d0c2c59ead198eef047313c5852726df5b1ffd0d903baa4e95254e7f38468be0"],
    ["SIN_TR.CHRM", 12764, "6427c37fbdba8b721a0ed0580c89bc9513260f5a1a4df9d5af25fc5226b3962e"],
    ["TAK02M7G.CHRM", 45816, "3bb785a9e35909dfddf4d0914faaf063668e848f0667fb931acbfa8a503f2e05"],
  ]),
  outputMembers: ["HOUM400G.CHRM", "MAP03.MAPM"],
  packageActors: null,
  sceneObjects: {
    SEIZ: scoped("HOUM400G", "play/assets/hazuki/kkyd/HOUM400G.CHRM", "S3_JOMO_HOUM400G.MT5"),
    MAP3: persistent("MAP03", "play/assets/hazuki/kkyd/MAP03.MAPM", "S3_JOMO_MAP03.MT5"),
  },
  motionBanks: [sharedKkyMotionDefinition],
  activity: [53, 614274, 614287, "SEQDATA3.AUTH", ["SEIZ", "SINF"], 1260, 1,
    { camera: 1, move: 2, motion: 1 }, presentation(["MAP3"])],
}, {
  resourceName: "KKYE",
  disc: 3,
  sourceRoot: disc3Root,
  archiveSha256: "0b54d1c806aeb265105df99054750663ecbc8bbe9937a4490d868c624efa2061",
  expectedMembers: expected([
    ["MAP03.MAPM", 156672, "3aa3abecf4e57bf8650aada68d5f3d95bdfc65acb4b87457581b5a446a863a27"],
    ["MONR001G.CHRM", 10232, "bdcaa1dd478f5b12845705b69336a3c1262d4ad24ea15a52dcae4790eb0a3189"],
    ["M_01KKY.MOTN", 132588, "3b44ddf768fdc6c1405ab7ffca32cc7431b86b9af7b3644fe35d3b1cb0e58c18"],
    ["SEQDATA4.AUTH", 3244, "1d9d0b2947f851e908c39b1f3c1bbe0902c45214335488aaf75008c3255e2688"],
    ["SIN_F.CHRM", 15076, "7fb76c9d3b86c780cc0d111c8c9b8011cd1123c73ef1dd5295677eb666e5d767"],
    ["SIN_FTBL.BIN", 8092, "9ce6c79f85666df9d19bdce9210d975aa60ad3b6e68bd97f5770a56b090bb9e7"],
    ["SIN_HM.BIN", 8632, "6245a820d3b4e69388cde3bea95f2d9b0bc3246a77e8ff2254d586e6398fc589"],
    ["SIN_M.CHRM", 119772, "3c060c6f7800e055b3cdb6ada82a3a97443e5bfd7feacd9babda67653fb8a3cb"],
    ["SIN_TL.CHRM", 12676, "d0c2c59ead198eef047313c5852726df5b1ffd0d903baa4e95254e7f38468be0"],
    ["SIN_TR.CHRM", 12764, "6427c37fbdba8b721a0ed0580c89bc9513260f5a1a4df9d5af25fc5226b3962e"],
    ["TAK02M7G.CHRM", 45816, "3bb785a9e35909dfddf4d0914faaf063668e848f0667fb931acbfa8a503f2e05"],
  ]),
  outputMembers: ["MONR001G.CHRM"],
  sceneObjects: {
    MOON: scoped("MONR001G", "play/assets/hazuki/kkye/MONR001G.CHRM", "S3_JOMO_MONR001G.MT5"),
    MAP3: persistent("MAP03", "play/assets/hazuki/kkyd/MAP03.MAPM", "S3_JOMO_MAP03.MT5"),
  },
  motionBanks: [sharedKkyMotionDefinition],
  activity: [54, 614311, 614324, "SEQDATA4.AUTH", ["HAWK", "MOON", "SINF"], 1000, 2,
    { camera: 1, move: 3, motion: 2 }, presentation(["MAP3"])],
}, {
  resourceName: "KKYF",
  disc: 3,
  sourceRoot: disc3Root,
  archiveSha256: "cff01c6ed68be4f5055426e2e8840b74c3f456c0997c68b3bee6f8163b42f56a",
  expectedMembers: expected([
    ["DRGS502G.CHRM", 8556, "3695b11a84c715316c16ec32680e197632015bc6aa18716530ffd03012fad033"],
    ["KOK_F.CHRM", 20348, "0c467e1983120c619958d963254fbcd6c7ce7416e5bc335e70829389cb5036da"],
    ["KOK_FTBL.BIN", 7824, "8df5fc417b0a934bfac4809eeb81d5dfe2377c681560f881d3826040d2345124"],
    ["KOK_HM.BIN", 9264, "bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729"],
    ["KOK_M.CHRM", 91804, "7e3f97682e8eece82a07297f333493a3f60f817d54880ba04b7bf812bdf6d592"],
    ["KOK_TL.CHRM", 12956, "0696b31b710cade0ec90b81f1922e85751036ae3aa8ef790046378944c3634bc"],
    ["KOK_TR.CHRM", 12988, "9ab4b281d4928d62c956d5ef707fdf62fa271c7fe14b274ab6595e790305dd53"],
    ["M_01KKY.MOTN", 132588, "3b44ddf768fdc6c1405ab7ffca32cc7431b86b9af7b3644fe35d3b1cb0e58c18"],
    ["SEQDATA5.AUTH", 1752, "6c32c6d6567b0792f5a32c46e3628e25f530174f47e9e888b0cba55b973d852b"],
  ]),
  sceneObjects: {
    RYMR: scoped("DRGS502G", "play/assets/hazuki/kkyb/DRGS502G.CHRM", "S3_JOMO_DRGS502G.MT5"),
  },
  motionBanks: [sharedKkyMotionDefinition],
  packageActors: {
    SORY: {
      label: "Lan Di",
      modelCode: "KOK_M",
      browserFilename: "S3_JOMO_KOK_M.MT5",
      assetPath: "play/assets/characters/KOK_M.CHRM",
      assetFormat: "MT5",
      characterScale: 1,
      nativeClothRuntimeMode: 4,
    },
  },
  activity: [55, 614348, 614361, "SEQDATA5.AUTH", ["RYMR", "SORY"], 240, 2,
    { camera: 1, move: 2, motion: 2 }, presentation()],
}];

for (const pack of packs) {
  const key = pack.resourceName.toLowerCase();
  const outputDirectory = path.join(root, `play/assets/hazuki/${key}`);
  const [slot, primaryPointer, secondaryPointer, file, actors, durationFrames,
    frameCount, commandCounts, nativeSceneObjectStates] = pack.activity;
  buildNativeAseqActivityPack({
    generatedBy: "tools/cutscenes/build_jomo_vision_activity_packs.mjs",
    resourceName: pack.resourceName,
    disc: pack.disc,
    sourcePath: path.join(pack.sourceRoot, `data/SCENE/0${pack.disc}/JOMO/${pack.resourceName}.PKS`),
    sourceManifestPath: `extracted_disc${pack.disc}_v2/data/SCENE/0${pack.disc}/JOMO/${pack.resourceName}.PKS`,
    archiveSha256: pack.archiveSha256,
    expectedMembers: pack.expectedMembers,
    bindingEvidence: evidence,
    selectionRule,
    outputDirectory,
    outputAssetPrefix: `play/assets/hazuki/${key}`,
    manifestPath: path.join(outputDirectory, "manifest.json"),
    outputMembers: pack.outputMembers || [],
    packageActors: pack.packageActors || undefined,
    sceneObjects: pack.sceneObjects || undefined,
    motionBanks: pack.motionBanks || [],
    activities: [{
      slot,
      primaryPointer,
      secondaryPointer,
      file,
      actors,
      durationFrames,
      frameCount,
      commandCounts,
      ...(pack.sceneObjects ? { nativeSceneObjectStates } : {}),
    }],
  });
}

console.log("Wrote six exact JOMO KKYA-KKYF activity packs");
