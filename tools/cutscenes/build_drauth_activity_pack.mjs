#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackHandPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const evidence = JSON.parse(readFileSync(path.join(repoRoot, "tools/evidence/drauth-hand-native-callback-ir.json")));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/D000/MAPINFO.BIN"));
if (sha256(mapinfo) !== evidence.source.mapinfoSha256) throw new Error("DRAUTH hand source changed");
const functions = [evidence.function, ...evidence.supportingFunctions];
const owner = functions.find(fn => fn.id === "0x858c4");
const callbacks = new Set(["0x836d8", "0x83d28"]);
const nativeHandPoseTables = {};
const handsBySlot = new Map();
for (const call of owner.blocks.flatMap(block => block.actions)
  .filter(action => action.kind === "directCall" && callbacks.has(action.targetFileOffset))) {
  const slot = call.arguments[0];
  if (slot?.kind !== "constant" || handsBySlot.has(slot.value)) throw new Error("DRAUTH hand owner binding changed");
  const result = extractNativeAseqCallbackHandPresentation({ bytes: mapinfo,
    callbackFunction: parseInt(call.targetFileOffset, 16), nativeFunction: functions.find(fn => fn.id === call.targetFileOffset),
    functions, activitySlot: slot.value });
  Object.assign(nativeHandPoseTables, result.nativeHandPoseTables);
  handsBySlot.set(slot.value, result);
}
if (handsBySlot.size !== 2 || !handsBySlot.has(0) || !handsBySlot.has(1)) throw new Error("DRAUTH hand callbacks changed");

const handSources = [
  ["TONY", "GIJ", "GIJ_M", 9264, 8952,
    "bf14ace42223e4524a58551c74e9be9dcc8911dbad566b8c68ef0ab75a1d50c8",
    "622c0f9a9c7f33b65af9eff47006d9246ab5e0c2f8526834ea7b14918bdd56b6",
    "bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729"],
  ["SMTH", "GIB", "GIB_M", 9264, 8952,
    "c6e3b9aa938f356d05ea1e2f8999ffbbba95b57a63731c2218de8dec33120cd9",
    "6cfc1c3f903462033b4e1f22e6a7de7532293e5471c2cb116b220b8fd22531f1",
    "bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729"],
  ["HARY", "GIE", "GIE_L", 9272, 8960,
    "47a4dd548cfbc2d44b013fc2104a4ee4583bbd670157fc6862f5a85608696c7c",
    "17f32c6c729657290a54b5cfc3036cfc1945ab86681986d2d8c8efb8364c1c86",
    "63ddfc53a7397ff87b5909d60ff9be3804099ff842828d465bb4a4ffc04859bd"],
];
const externalAssets = [];
const handAssets = Object.fromEntries(handSources.map(([actorTag, handCode, bodyModelCode, rigSize, weightsEnd, ...hashes]) => {
  const files = ["TL.MT5", "TR.MT5", "HM.BIN"].map((suffix, index) => {
    const filename = `${handCode}_${suffix}`;
    const asset = { path: `play/assets/dobuita/drauth/${filename}`,
      sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`,
      byteLength: [160452, 160508, rigSize][index], sha256: hashes[index] };
    externalAssets.push({ assetPath: asset.path,
      sourcePath: path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${filename}`),
      byteLength: asset.byteLength, sha256: asset.sha256 });
    return asset;
  });
  return [actorTag, { actorTag, handCode, bodyModelCode, bodyHandRenderKeys: { left: -66, right: -65 },
    left: { rootRenderKey: 11, model: files[0] }, right: { rootRenderKey: 6, model: files[1] },
    rig: { ...files[2], transformNodeCount: 71, vertexCount: 306,
      pointerOffsets: [24, 168, weightsEnd, 5848, 6472, rigSize] },
    presentation: { attachment: "body-hand-node-world-matrix", initialPose: "hm-bind-pose",
      deformationAssetRetained: true, nativePoseOperation: "0x005e" },
  }];
}));
// These two actors receive MHND only; do not synthesize detailed-hand requests.
for (const [actorTag, bodyModelCode] of [["SERA", "TUW_L"], ["JONZ", "GIF_L"]]) {
  handAssets[actorTag] = { actorTag, bodyModelCode, mode: "body-only", bodyHandRenderKeys: { left: -66, right: -65 } };
}

const expectedMembers = Object.freeze([
  Object.freeze({
    name: "M_01REV.MOTN",
    byteLength: 166960,
    sha256: "6b34ada14a17959da702129589e120ea070e37cef81ad0e97b8c797cada37211",
  }),
  Object.freeze({
    name: "M_ZAKO.MOTN",
    byteLength: 168080,
    sha256: "0562507487c808d2e1ad80f5e2fd2a3527172e01fd79501c64134db1ffccac3d",
  }),
  Object.freeze({
    name: "SEQDATA1.AUTH",
    byteLength: 10232,
    sha256: "1e4a1c1ce0151c59fec79d9bfc706e14990ee75edf78698713fc28d6065e3357",
  }),
  Object.freeze({
    name: "SEQDATA2.AUTH",
    byteLength: 7564,
    sha256: "a410bfb4d1a82db5bf09cdb05398ad55fc078fe3f31126033f6c20b52e7c83da",
  }),
]);
const expectedMotionNames = Object.freeze([
  "AKI_AT1_STORONG_MAN_SENINHUKUSYU_0100",
  "AKI_AT2_DAMASARETA_SENINHUKUSYU_0100",
  "OTH_SMS_AT2_DAMASU_SENINHUKUSYU_0100",
  "OTH_TNY_AT1_STORONG_MAN_SENINHUKUSYU_0100",
  "OTH_TNY_AT2_DAMASARETA_SENINHUKUSYU_0100",
  "AKI_RANTEI_NAKAMADATTANOKA_0147",
  "BLC_ISUSUWARI_02135",
  "LLY_DOKE_SOUKO_0244",
  "OTH_ICO_HURIKAERU_NIRAMU_AKI_0312",
]);
const activities = Object.freeze([
  Object.freeze({
    slot: 0,
    ...handsBySlot.get(0),
    primaryPointer: 0xb138a,
    secondaryPointer: 0xb1391,
    file: "SEQDATA1.AUTH",
    actors: ["AKIR", "SMTH", "HARY", "TONY", "SERA", "JONZ"],
    durationFrames: 1330,
    frameCount: 46,
    commandCounts: { camera: 1, move: 6, motion: 9, sound: 33, voice: 11 },
  }),
  Object.freeze({
    slot: 1,
    ...handsBySlot.get(1),
    primaryPointer: 0xb1392,
    secondaryPointer: 0xb1399,
    file: "SEQDATA2.AUTH",
    actors: ["AKIR", "SMTH", "HARY", "TONY", "SERA", "JONZ"],
    durationFrames: 500,
    frameCount: 21,
    commandCounts: { camera: 1, move: 6, motion: 9, sound: 15, voice: 1 },
  }),
]);

const outputDirectory = path.join(repoRoot, "play/assets/dobuita/drauth");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_drauth_activity_pack.mjs",
  resourceName: "DRAUTH",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/DRAUTH.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/DRAUTH.PKS",
  archiveSha256: "90ba0829312f0fc3c38a99b501c5362950ff2b6915226a5260cc2ceffd7e3537",
  expectedMembers,
  bindingEvidence: "tools/evidence/operation-0050-evidence.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot",
  audioManifest: "public/audio/world/drauth/manifest.json",
  handAssets,
  externalAssets,
  nativeHandPoseTables,
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/drauth",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  motionBanks: [{
    bank: 16,
    member: "M_01REV.MOTN",
    parseOptions: { sequenceIndices: expectedMotionNames.map((_, index) => index) },
    expectedSequences: expectedMotionNames.map((name, index) => ({ index, name })),
  }],
  activities,
});

console.log(`Wrote exact DRAUTH activity pack to ${outputDirectory}`);
