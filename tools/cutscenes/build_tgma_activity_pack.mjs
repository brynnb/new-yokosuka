#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";
import { nativeAseqGoverningActivityFrame } from "../lib/NativeAseqScriptOwnership.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const mapinfoPath = path.join(sourceRoot, "data/SCENE/01/JHD0/MAPINFO.BIN");
const mapinfo = readFileSync(mapinfoPath);
const callback = 0x232fc;
const nativeCallbackIr = JSON.parse(readFileSync(
  path.join(root, "tools/evidence/tgma-native-callback-ir.json"),
  "utf8",
));
if (
  nativeCallbackIr.source?.disc !== 1
  || nativeCallbackIr.source?.area !== "JHD0"
  || nativeCallbackIr.source?.mapEntryFunction !== "0x537d4"
  || nativeCallbackIr.source?.callbackFunction !== "0x232fc"
) throw new Error("TGMA compact native callback IR has the wrong owner");
const callbackPresentation = extractNativeAseqCallbackPresentation({
  bytes: mapinfo,
  callbackFunction: callback,
  nativeFunction: nativeCallbackIr.function,
  durationFrames: 954,
});
const frameAt = call => nativeAseqGoverningActivityFrame(mapinfo, callback, call);
const exactFrame = (call, expected) => {
  const frame = frameAt(call);
  if (frame !== expected) {
    throw new Error(`TGMA callback 0x${call.toString(16)} moved from frame ${expected}`);
  }
  return frame;
};

const outputDirectory = path.join(root, "play/assets/hazuki/tgma");
const handSourceDirectory = path.join(sourceRoot, "data/SCENE/01/MODEL/HAND");
const faceSourceDirectory = path.join(sourceRoot, "data/SCENE/01/MODEL/FACE");
const handAsset = (filename, byteLength, sha256) => ({
  path: `play/assets/hazuki/tgma/${filename}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`,
  byteLength,
  sha256,
});
const fubHandAssets = Object.freeze({
  FUKU: Object.freeze({
    actorTag: "FUKU",
    bodyModelCode: "FUB_M",
    handCode: "FUB",
    bodyHandRenderKeys: Object.freeze({ left: -0x42, right: -0x41 }),
    left: Object.freeze({
      rootRenderKey: 11,
      model: handAsset(
        "FUB_TL.MT5",
        162476,
        "5199fc2007a66d2f16256c722875090c9731a0e9f3314ce7487c749664650951",
      ),
    }),
    right: Object.freeze({
      rootRenderKey: 6,
      model: handAsset(
        "FUB_TR.MT5",
        162556,
        "5a0e51c6c6ddae47307e602037e03ccfcb93d5f505223a822f30044f169449e1",
      ),
    }),
    rig: Object.freeze({
      ...handAsset(
        "FUB_HM.BIN",
        9264,
        "4a6c85858467733b459eb40588ff3116fa31c1c4a364b442f0c1169e2cf2bf34",
      ),
      transformNodeCount: 71,
      vertexCount: 306,
      pointerOffsets: Object.freeze([24, 168, 8952, 5848, 6472, 9264]),
    }),
    presentation: Object.freeze({
      attachment: "body-hand-node-world-matrix",
      initialPose: "hm-bind-pose",
      deformationAssetRetained: true,
      nativePoseOperation: "0x005e",
    }),
  }),
});
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_tgma_activity_pack.mjs",
  resourceName: "TGMA",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JHD0/TGMA.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JHD0/TGMA.PKS",
  archiveSha256: "095c988fcb8cf05c8559188b8705cc720c48305e9f1f8de3b577d97d676b95c2",
  expectedMembers: [
    { name: "MALS509G.CHRM", byteLength: 1452, sha256: "0d5182cde209ca1c188e4a7af48f65e79d0d5713469bd2c951a0af69a624dd39" },
    { name: "M_0139.MOTN", byteLength: 119052, sha256: "5a50803db81a317670b02b69ba0d9f1ce6ba885d635cdae8106060487fa9cc78" },
    { name: "SEQDATA4.AUTH", byteLength: 6644, sha256: "e409876e1c569cc4ad93447a6bf588dc0325b8a907c404bc4883140e1e2ab968" },
  ],
  bindingEvidence: "tools/evidence/tgma-native-lifecycle.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot 0",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/tgma",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["MALS509G.CHRM"],
  externalAssets: [
    ["FUB_HM.BIN", 9264, "4a6c85858467733b459eb40588ff3116fa31c1c4a364b442f0c1169e2cf2bf34"],
    ["FUB_TL.MT5", 162476, "5199fc2007a66d2f16256c722875090c9731a0e9f3314ce7487c749664650951"],
    ["FUB_TR.MT5", 162556, "5a0e51c6c6ddae47307e602037e03ccfcb93d5f505223a822f30044f169449e1"],
  ].map(([filename, byteLength, sha256]) => ({
    sourcePath: path.join(handSourceDirectory, filename),
    assetPath: `play/assets/hazuki/tgma/${filename}`,
    byteLength,
    sha256,
  })).concat([
    {
      sourcePath: path.join(faceSourceDirectory, "FUB_F.MT5"),
      assetPath: "play/assets/hazuki/tgma/FUB_F.MT5",
      byteLength: 142760,
      sha256: "d2723415939ce6b6387715a354921f64513a815216f0174892517cbdb5022054",
    },
    {
      sourcePath: path.join(faceSourceDirectory, "FUB_FTBL.BIN"),
      assetPath: "play/assets/hazuki/tgma/FUB_FTBL.BIN",
      byteLength: 5004,
      sha256: "c2be5f63cb0918f4a26b982f68be29c5aadcae95fdb7a24a7ecbe4d6bc2c4f32",
    },
  ]),
  packageActors: {
    FUKU: {
      label: "Masayuki Fukuhara",
      modelCode: "FUB_M",
      assetPath: "play/assets/characters/FUB_M.CHRM",
      textureAssetPath: "play/assets/characters/FUB_textures.bin",
      browserFilename: "FUB_M.CHRM",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  attachedObjects: {
    TEGS: {
      browserFilename: "MALS509G.CHRM",
      assetPath: "play/assets/hazuki/tgma/MALS509G.CHRM",
      attachments: [{
        activitySlot: 0,
        frame: exactFrame(0x2360a, 1),
        parentActorTag: "AKIR",
        controlId: 18,
        translation: [0.12300000339746475, 0.01600000075995922, -0.052000001072883606],
        rotationRaw: [0xd48d, 0xd1b4, 0x5765],
      }],
      presentation: [
        { activitySlot: 0, frame: exactFrame(0x23876, 350), visible: true },
        { activitySlot: 0, frame: exactFrame(0x23bbe, 800), visible: false },
      ],
      nodeTransforms: [
        { activitySlot: 0, frame: 1, nodeKey: 0x98, mode: "set", rotationRaw: [0, 0, 0x04fa] },
        { activitySlot: 0, frame: 1, nodeKey: 0x99, mode: "set", rotationRaw: [0, 0, 0x04fa] },
        { activitySlot: 0, firstFrame: 400, lastFrame: 423, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, 0x04fa] },
        { activitySlot: 0, firstFrame: 415, lastFrame: 438, nodeKey: 0x99, mode: "add", rotationRaw: [0, 0, 0x04fa] },
        { activitySlot: 0, firstFrame: 760, lastFrame: 783, nodeKey: 0x99, mode: "add", rotationRaw: [0, 0, -0x04fa] },
        { activitySlot: 0, firstFrame: 775, lastFrame: 798, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, -0x04fa] },
      ],
    },
  },
  nativeHandPoseTables: callbackPresentation.nativeHandPoseTables,
  handAssets: fubHandAssets,
  facialAssets: {
    FUKU: {
      actorTag: "FUKU",
      bodyModelCode: "FUB_M",
      faceCode: "FUB",
      attachmentRenderKey: -67,
      faceRootRenderKey: 3,
      eyeRenderKeys: [77, 78],
      model: {
        path: "play/assets/hazuki/tgma/FUB_F.MT5",
        sourcePath: "extracted_files/data/SCENE/01/MODEL/FACE/FUB_F.MT5",
        byteLength: 142760,
        sha256: "d2723415939ce6b6387715a354921f64513a815216f0174892517cbdb5022054",
      },
      table: {
        path: "play/assets/hazuki/tgma/FUB_FTBL.BIN",
        sourcePath: "extracted_files/data/SCENE/01/MODEL/FACE/FUB_FTBL.BIN",
        byteLength: 5004,
        sha256: "c2be5f63cb0918f4a26b982f68be29c5aadcae95fdb7a24a7ecbe4d6bc2c4f32",
      },
      poses: {
        kind: "neutral-fallback",
        actorTag: "FUKU",
        evidence: "tools/evidence/tgma-native-blocker.json",
      },
    },
  },
  motionBanks: [{
    bank: 21,
    member: "M_0139.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_KATAKI_0139" },
      { index: 1, name: "AKI_TEGAMIMIRU_0139" },
      { index: 2, name: "AKI_TEGAMIMISERARERU_0139" },
      { index: 3, name: "FUK_CHINESE_0139" },
      { index: 4, name: "FUK_HANNIN_0139" },
      { index: 5, name: "FUK_KONNAMONO_0139" },
      { index: 8, name: "AKI_TEGAMIMIRU2_0139" },
    ],
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x601b8,
    secondaryPointer: 0x601bd,
    file: "SEQDATA4.AUTH",
    actors: ["AKIR", "FUKU"],
    packageActors: ["FUKU"],
    durationFrames: 954,
    frameCount: 36,
    commandCounts: { camera: 1, move: 2, motion: 2, sound: 26, voice: 8 },
    nativeHandPoseCues: callbackPresentation.nativeHandPoseCues,
    nativeFaceClipCues: callbackPresentation.nativeFaceClipCues,
    nativeFaceGazeCues: callbackPresentation.nativeFaceGazeCues,
  }],
});

console.log(`Wrote exact TGMA activity pack to ${outputDirectory}`);
