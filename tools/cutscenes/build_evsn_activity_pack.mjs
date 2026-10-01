#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import { extractNativeAseqCallbackHandPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const aftermathEvidence = "tools/evidence/evsn-aftermath-native-callback-ir.json";
const aftermath = JSON.parse(readFileSync(path.join(root, aftermathEvidence)));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/JD00/MAPINFO.BIN"));
if (sha256(mapinfo) !== "8582ed57e13593d7622d24216ef8f93e5393b13fffd2132f70500f9e6ce2a43b"
  || aftermath.source.mapinfoSha256 !== sha256(mapinfo)
  || aftermath.function.id !== "0x729e0") throw new Error("EVSN aftermath callback changed");
const airplane = extractNativeAseqCallbackObjectPresentation({
  bytes: mapinfo, nativeFunction: aftermath.function, callbackFunction: 0x729e0,
  durationFrames: 1080, activitySlot: 2, objectTags: ["AIRO"],
});
if (airplane.attachedObjectCues.length !== 2) throw new Error("EVSN airplane lifetime changed");

const handEvidence = JSON.parse(readFileSync(path.join(root, "tools/evidence/evsn-hand-native-callback-ir.json")));
const lifecycle = JSON.parse(readFileSync(path.join(root, "tools/evidence/evsn-native-lifecycle.json")));
if (handEvidence.source.mapinfoSha256 !== sha256(mapinfo)) throw new Error("EVSN hand source changed");
const handFunctions = [handEvidence.function, ...handEvidence.supportingFunctions];
const callbackBySlot = new Map();
for (const ownerId of lifecycle.owner.activityOwners) {
  const owner = handFunctions.find(fn => fn.id === ownerId);
  const calls = owner?.blocks.flatMap(block => block.actions).filter(action => action.kind === "directCall"
    && lifecycle.owner.activityCallbacks.includes(action.targetFileOffset));
  if (calls?.length !== 1 || calls[0].arguments[0]?.kind !== "constant"
    || callbackBySlot.has(calls[0].arguments[0].value)) throw new Error(`EVSN callback binding changed: ${ownerId}`);
  callbackBySlot.set(calls[0].arguments[0].value, handFunctions.find(fn => fn.id === calls[0].targetFileOffset));
}
const nativeHandPoseTables = {};
const handCues = (slot, actors) => {
  const nativeFunction = callbackBySlot.get(slot);
  if (!nativeFunction) throw new Error(`EVSN slot ${slot} has no hand callback`);
  const result = extractNativeAseqCallbackHandPresentation({ bytes: mapinfo, nativeFunction,
    callbackFunction: parseInt(nativeFunction.id, 16), activitySlot: slot, functions: handFunctions });
  Object.assign(nativeHandPoseTables, result.nativeHandPoseTables);
  const active = cue => {
    if (actors.includes(cue.actorTag)) return true;
    // Common setup also touches room actors absent from a lead-in AUTH. Each
    // later callback initializes them again. Do not instantiate hidden actors
    // merely to apply their frame-zero setup; timed missing actors are errors.
    if (cue.frame !== 0) throw new Error(`EVSN slot ${slot} has a timed hand cue for absent ${cue.actorTag}`);
    return false;
  };
  return { nativeHandPoseCues: result.nativeHandPoseCues.filter(active),
    nativeBodyHandPoseCues: result.nativeBodyHandPoseCues.filter(active) };
};
const handResources = [
  ["TL.MT5", 176812, "038b520036e05a7cda16dba20fe4e55455286d1aa243d550b7d00af36b4c48fa"],
  ["TR.MT5", 176892, "4b6384908846d8c5ff7b615ef268f932add9a7832f4040f9160ad58c75a493ee"],
  ["HM.BIN", 9264, "4a6c85858467733b459eb40588ff3116fa31c1c4a364b442f0c1169e2cf2bf34"],
];
const handAsset = (code, index) => ({
  path: `play/assets/sakuragaoka/evsn/${code}_${handResources[index][0]}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${code}_${handResources[index][0]}`,
  byteLength: handResources[index][1], sha256: handResources[index][2],
});
const handAssets = {
  HRSK: JSON.parse(readFileSync(path.join(root, "play/assets/sakuragaoka/dnoz-ski/manifest.json"))).handAssets.HRSK,
  KKEN: { actorTag: "KKEN", mode: "body-only", bodyModelCode: "NZG_L", bodyHandRenderKeys: { left: -66, right: -65 } },
  ...Object.fromEntries([["ENKI", "YAA"], ["NGSM", "YAB"]].map(([actorTag, handCode]) => [actorTag, {
    actorTag, handCode, bodyModelCode: `${handCode}_L`, bodyHandRenderKeys: { left: -66, right: -65 },
    left: { rootRenderKey: 11, model: handAsset(handCode, 0) },
    right: { rootRenderKey: 6, model: handAsset(handCode, 1) },
    rig: { ...handAsset(handCode, 2), transformNodeCount: 71, vertexCount: 306,
      pointerOffsets: [24, 168, 8952, 5848, 6472, 9264] },
    presentation: { attachment: "body-hand-node-world-matrix", initialPose: "hm-bind-pose",
      deformationAssetRetained: true, nativePoseOperation: "0x005e" },
  }])),
};

const expectedMembers = Object.freeze([
  ["M_01NVE.MOTN", 312076, "1636d2fef481b116512016361ceaadd970e4b5c2d1d9e4252c1b871fbca22386"],
  ["NZG_L.CHRM", 32872, "a12c2320e9d2ab69386e7dcfa38367de6299f8e921071a562f65ddae2dc9e881"],
  ["OMHT201G.CHRM", 6136, "8c9cbbe4b0e3ed4e7b2e4ada1d9165c388d4b24eeecb402b1c892775a9c4f5c4"],
  ["SEQDATA1.AUTH", 3252, "dcf1b9718432e56bac5516b735187171faf4039b3da41bf982c3072340c69240"],
  ["SEQDATA2.AUTH", 30792, "73877745a6e80bbbfc785b319972299ae81dff5b512390adb28fcbcc92daf8b7"],
  ["SEQDATA3.AUTH", 90788, "6e9875e3507e52d696f92eddf3a5d354d9943b28718700136d394ef7b7e7e750"],
  ["SEQDATA4.AUTH", 3732, "8f17a245f4f1f09df580d07b88cd7c8bb20636dd515e6f647d1339b96bf73411"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const motionNames = Object.freeze([
  "AKI_AT1_KIDUKU_NOZ_NOZVSENO_0100",
  "AKI_AT2_TASUKERU_NOZVSENO_0100",
  "SIN_NOZ_AT2_TASUKERU_NORIKO_NOZVSENO_0100",
  "SIN_NRK_AT2_TASUKERARERU_NOZVSENO_0100",
  "YKI_ENO_AT2_KARAMU_NOZOMI_NOZVSENO_0100",
  "YKI_NAG_AT2_TASUKERU_NORIKO_NOZVSENO_0100",
  "AKI_AT1_TASUKERU_KARAMARERUNOZ0_0100",
  "AKI_AT2_IIKIKASERU_KARAMARERUNOZ_0100",
  "GAK_KID_AT1_TASUKERARERU_KARAMARERUNOZ_0100",
  "GAK_KID_AT2_ARIGATOU_SARU_KARAMARERUNOZ_0100",
  "SIN_AT1_DERU_YUME_BADENDING15MAE_0100",
  "SIN_NOZ_AT1_KARAMARERU_KARAMARERUNOZ_0100",
  "SIN_NOZ_AT2_IIKIKASERU_KARAMARERUNOZ_0100",
  "YKI_ENO_AT1_TASUKERU_KARAMARERUNOZ0_0100",
  "YKI_ENO_AT2_YARARERU_NIGERU_KARAMARERUNOZ_0100",
  "YKI_NAG_AT1_KARAMARERU_KARAMARERUNOZ_0100",
  "YKI_NAG_AT2_YARARERU_NIGERU_KARAMARERUNOZ_0100",
]);

const outputDirectory = path.join(root, "play/assets/sakuragaoka/evsn");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_evsn_activity_pack.mjs",
  resourceName: "EVSN",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JD00/EVSN.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JD00/EVSN.PKS",
  archiveSha256: "a940f2b2b624638fc7a27364eb6045a88fa10e7717a185ebac2f0cbd1c35275a",
  expectedMembers,
  bindingEvidence: "tools/evidence/evsn-native-lifecycle.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slots 0 through 3",
  audioManifest: "public/audio/world/evsn/manifest.json",
  handAssets,
  nativeHandPoseTables,
  externalAssets: ["YAA", "YAB"].flatMap(code => handResources.map((_, index) => {
    const asset = handAsset(code, index);
    return { assetPath: asset.path, sourcePath: path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${code}_${handResources[index][0]}`),
      byteLength: asset.byteLength, sha256: asset.sha256 };
  })),
  outputDirectory,
  outputAssetPrefix: "play/assets/sakuragaoka/evsn",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["NZG_L.CHRM", "OMHT201G.CHRM"],
  packageActors: {
    KKEN: {
      label: "Kyosuke Nishida",
      modelCode: "NZG_L",
      assetPath: "play/assets/sakuragaoka/evsn/NZG_L.CHRM",
      browserFilename: "S1_JD00_NZG_L.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  sceneObjects: {
    AIRO: {
      model: "OMHT201",
      browserFilename: "S1_JD00_OMHT201G.MT5",
      assetPath: "play/assets/sakuragaoka/evsn/OMHT201G.CHRM",
      lifecycle: { kind: "native-composite-owner" },
      nativeBinding: {
        archiveMember: "OMHT201G.CHRM",
        archiveMemberSha256: "8c9cbbe4b0e3ed4e7b2e4ada1d9165c388d4b24eeecb402b1c892775a9c4f5c4",
        attachmentOperation: "0x00e6",
        attachmentCall: "0x72af4",
        parentActorTag: "KKEN",
        controlId: 12,
      },
    },
  },
  attachedObjects: {
    AIRO: {
      browserFilename: "S1_JD00_OMHT201G.MT5",
      sceneObject: true,
      attachments: airplane.attachedObjectCues.map(({ objectTag, ...cue }) => ({
        ...cue, source: { evidence: aftermathEvidence },
      })),
    },
  },
  motionBanks: [{
    bank: 16,
    member: "M_01NVE.MOTN",
    expectedSequences: motionNames.map((name, index) => ({ index, name })),
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x81492,
    secondaryPointer: 0x81497,
    file: "SEQDATA1.AUTH",
    actors: ["AKIR", "ENKI", "HRSK"],
    ...handCues(0, ["AKIR", "ENKI", "HRSK"]),
    durationFrames: 230,
    frameCount: 9,
    commandCounts: { camera: 1, move: 3, motion: 1, voice: 3, sound: 5 },
  }, {
    slot: 1,
    primaryPointer: 0x814a2,
    secondaryPointer: 0x814a7,
    file: "SEQDATA2.AUTH",
    actors: ["NGSM", "HRSK", "AKIR", "ENKI", "AIRO", "KKEN"],
    ...handCues(1, ["NGSM", "HRSK", "AKIR", "ENKI", "AIRO", "KKEN"]),
    durationFrames: 1671,
    frameCount: 77,
    commandCounts: { camera: 1, move: 6, motion: 8, effect: 9, voice: 19, sound: 47 },
  }, {
    slot: 2,
    primaryPointer: 0x814c2,
    secondaryPointer: 0x814c7,
    file: "SEQDATA3.AUTH",
    actors: ["NGSM", "HRSK", "AKIR", "ENKI", "KKEN"],
    ...handCues(2, ["NGSM", "HRSK", "AKIR", "ENKI", "KKEN"]),
    durationFrames: 1080,
    frameCount: 47,
    commandCounts: { camera: 1, move: 5, motion: 6, effect: 13, voice: 12, sound: 21 },
  }, {
    slot: 3,
    primaryPointer: 0x814d2,
    secondaryPointer: 0x814d7,
    file: "SEQDATA4.AUTH",
    actors: ["AKIR", "ENKI", "HRSK"],
    ...handCues(3, ["AKIR", "ENKI", "HRSK"]),
    durationFrames: 220,
    frameCount: 9,
    commandCounts: { camera: 1, move: 3, motion: 1, voice: 3, sound: 5 },
  }],
});

console.log(`Wrote exact EVSN activity pack to ${outputDirectory}`);
