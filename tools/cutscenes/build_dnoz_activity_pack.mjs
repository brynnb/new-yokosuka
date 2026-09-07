#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [process.env.SHENMUE_DISC1_EXTRACTED_ROOT, path.join(root, "extracted_files")]
  .filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const evidence = JSON.parse(readFileSync(
  path.join(root, "tools/evidence/dnoz-dedicated-native-callback-ir.json"), "utf8",
));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/DNOZ/MAPINFO.BIN"));
const callbackById = new Map(evidence.functions.map(value => [value.id, value]));
const presentationCues = (id, durationFrames, activitySlot) => {
  const nativeFunction = callbackById.get(id);
  const presentationFunction = {
    ...nativeFunction,
    blocks: nativeFunction.blocks.map(block => ({
      ...block,
      actions: (block.actions || []).filter(
        action => [
          "actor-face-clip-control-write",
          "resolved-object-hndl-hndr-vector-install",
        ].includes(action.semanticId),
      ),
    })),
  };
  const value = extractNativeAseqCallbackPresentation({
    bytes: mapinfo,
    callbackFunction: Number.parseInt(id, 16),
    nativeFunction: presentationFunction,
    durationFrames,
    activitySlot,
  });
  if (id !== "0x1628") return value;
  // DNOZ's second tears callback resets Ryo's gaze during the activity, then
  // installs an exact HRSK controller-component target after ASEQ completion.
  // The terminal cue is intentionally retained at durationFrames: AUTH command
  // compilation supports that lifecycle boundary and the callback has no later
  // governing ASEQ frame from which a different time could be inferred.
  return Object.freeze({
    ...value,
    nativeFaceGazeCues: Object.freeze([
      Object.freeze({
        activitySlot,
        frame: 1162,
        actorTag: "AKIR",
        mode: 0,
        durationNativeTicks: 16,
        callFileOffset: "0x1896",
      }),
      Object.freeze({
        activitySlot,
        frame: durationFrames,
        actorTag: "AKIR",
        mode: 2,
        durationNativeTicks: 8,
        target: Object.freeze({
          kind: "actor-component",
          actorTag: "HRSK",
          selector: 18,
          associated: false,
          offset: Object.freeze([0, 0, 0]),
        }),
        callFileOffset: "0x1946",
      }),
    ]),
  });
};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const member = (name, sourceFilename, byteLength, sha256) => ({
  name,
  sourcePath: path.join(sourceRoot, `data/SCENE/01/DNOZ/${sourceFilename}`),
  sourceManifestPath: `extracted_files/data/SCENE/01/DNOZ/${sourceFilename}`,
  byteLength,
  sha256,
});
const common = {
  generatedBy: "tools/cutscenes/build_dnoz_activity_pack.mjs",
  resourceName: "DNOZ",
  disc: 1,
  bindingEvidence: "tools/evidence/player-cutscene-owner-discovery.json",
  selectionRule: "ordered loose AUTH fragments selected by DNOZ owner 0x1d74",
};

const mapLayers = Object.freeze([
  ["MAP.MT5", "MAP.MAPM", 671764, "3f0f15bde2bcbd920cace8729840bd48f0518b61e431f43ea9c41d88abe47ec7", true],
  ["MAP01.MT5", "MAP01.MAPM", 892320, "5581d9e20e5a28fb29c06cc2726a7c80379a251755f9095124311b1c404f2fc8", true],
  ["MAP02.MT5", "MAP02.MAPM", 31912, "fbfbde456dfd89241be404be9b1393941d6695d1454f25bfc7355cd05d32d9c9", false],
  ["MAP03.MT5", "MAP03.MAPM", 22912, "bf0868e060c1b95138b33ae19a860bac70b04c997a1fad2c5a062563fffbea38", true],
  ["MAP04.MT5", "MAP04.MAPM", 33876, "a5ab628a306454eb6e6a9ccb25bc748482396a8f042d9bbb1e96b99c468ac310", false],
  ["MAP05.MT5", "MAP05.MAPM", 27544, "10196633b60338a06afe6e0b07f0d506e35f6e14813251343caef020013c67c2", true],
  ["MAP06.MT5", "MAP06.MAPM", 52792, "e5cf266bdac15ee19a65d85f20be69b1fb0cfeb8306daaaf8f4909671ebceb48", false],
  ["MAP07.MT5", "MAP07.MAPM", 44384, "549cf35b8399003ce58505b2f062f81aca036681aa12080a032018bcbe3e0898", true],
  ["MAP08.MT5", "MAP08.MAPM", 294908, "3a98e7e3870c1f41861ca94b13c42d27abfab469cacb14723085833576076133", true],
  ["MAP09.MT5", "MAP09.MAPM", 276376, "934e1317451cf00a92858e76fbcbda5794c7c69e0faf776973b0b282b4072927", false],
  ["MAP10.MT5", "MAP10.MAPM", 806388, "eaf70bf4f5372cc36e892292b5cb593f877aadaf4d4c605ade345c6315a7f68c", true],
  ["MAP11.MT5", "MAP11.MAPM", 806388, "e84a7128e090866ecf8397dd7d2f55cc9ef197f98c4d98e6bfa2f250b2103039", false],
  ["MAP12.MT5", "MAP12.MAPM", 26516, "1aa523e6cbdc7abad32c5de5ebe2eb85af3e51b534a8d90ac608c5202a87a3c3", false],
  ["MAP13.MT5", "MAP13.MAPM", 22652, "b5c30ad9232d7333df3469e92eaef83c98582f289771cadc3a0180dc60e10821", false],
]);
const mapTag = index => `MAP${index.toString(16).toUpperCase()}`;
const environmentDirectory = path.join(root, "play/assets/sakuragaoka/dnoz-environment");
mkdirSync(environmentDirectory, { recursive: true });
const environmentOutputs = mapLayers.map(([sourceName, outputName, byteLength, digest], index) => {
  const bytes = readFileSync(path.join(sourceRoot, `data/SCENE/01/DNOZ/${sourceName}`));
  if (bytes.length !== byteLength || sha256(bytes) !== digest) {
    throw new Error(`DNOZ map layer ${sourceName} changed`);
  }
  writeFileSync(path.join(environmentDirectory, outputName), bytes);
  return { index, sourceName, outputName, byteLength, sha256: digest };
});
writeFileSync(path.join(environmentDirectory, "manifest.json"), `${JSON.stringify({
  schema: "new-yokosuka-dnoz-environment-v1",
  generatedBy: "tools/cutscenes/build_dnoz_activity_pack.mjs",
  evidence: "tools/evidence/dnoz-dedicated-native-callback-ir.json",
  source: { disc: 1, area: "DNOZ" },
  layers: environmentOutputs,
}, null, 2)}\n`);
const sceneObjects = Object.fromEntries(mapLayers.map(([, outputName], index) => [mapTag(index), {
  model: path.basename(outputName, ".MAPM"),
  browserFilename: `S1_DNOZ_${index === 0 ? "MAP" : `MAP${String(index).padStart(2, "0")}`}.MT5`,
  assetPath: `play/assets/sakuragaoka/dnoz-environment/${outputName}`,
  lifecycle: { kind: "room-script-persistent" },
  initialPresentation: { position: [0, 0, 0], rotationDegrees: [0, 0, 0], scale: [1, 1, 1] },
}]));
const nativeSceneObjectStates = mapLayers.map(([, , , , presented], index) => ({
  actorTag: mapTag(index), presented,
}));

const handAsset = (filename, byteLength, digest) => ({
  path: `play/assets/sakuragaoka/dnoz-ski/${filename}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`,
  byteLength,
  sha256: digest,
});
const hrsHandAssets = Object.freeze({
  HRSK: Object.freeze({
    actorTag: "HRSK",
    bodyModelCode: "NZM_L",
    handCode: "NZM",
    bodyHandRenderKeys: Object.freeze({ left: -0x42, right: -0x41 }),
    left: Object.freeze({ rootRenderKey: 11, model: handAsset("NZM_TL.MT5", 176556, "df4e0acbdf46ac948526877ce5310d4446abfa5baab990ffe7920a48c26f1fbe") }),
    right: Object.freeze({ rootRenderKey: 6, model: handAsset("NZM_TR.MT5", 176644, "d63432086a043706bf40975919ef48644d8f69324e9da4f4766733b29d76f7f5") }),
    rig: Object.freeze({
      ...handAsset("NZM_HM.BIN", 8608, "d2df197f87e38cf83ee3a44015f376503cb4702819824d5f057405e34fcf64e6"),
      transformNodeCount: 71,
      vertexCount: 299,
      pointerOffsets: Object.freeze([24, 168, 8304, 5848, 6344, 8608]),
    }),
    presentation: Object.freeze({
      attachment: "body-hand-node-world-matrix",
      initialPose: "hm-bind-pose",
      deformationAssetRetained: true,
      nativePoseOperation: "0x005e",
    }),
  }),
});

const build = ({ variant, outputName, audioManifest, members, motionFile, motionNames, activities, handPresentation = null }) => {
  const outputDirectory = path.join(root, `play/assets/sakuragaoka/${outputName}`);
  buildNativeAseqActivityPack({
    ...common,
    variant,
    sourceMembers: members,
    expectedMembers: members,
    audioManifest,
    outputDirectory,
    outputAssetPrefix: `play/assets/sakuragaoka/${outputName}`,
    manifestPath: path.join(outputDirectory, "manifest.json"),
    sceneObjects,
    ...(handPresentation ? {
      externalAssets: [
        ["NZM_HM.BIN", 8608, "d2df197f87e38cf83ee3a44015f376503cb4702819824d5f057405e34fcf64e6"],
        ["NZM_TL.MT5", 176556, "df4e0acbdf46ac948526877ce5310d4446abfa5baab990ffe7920a48c26f1fbe"],
        ["NZM_TR.MT5", 176644, "d63432086a043706bf40975919ef48644d8f69324e9da4f4766733b29d76f7f5"],
      ].map(([filename, byteLength, digest]) => ({
        sourcePath: path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${filename}`),
        assetPath: `play/assets/sakuragaoka/dnoz-ski/${filename}`,
        byteLength,
        sha256: digest,
      })),
      handAssets: hrsHandAssets,
      nativeHandPoseTables: handPresentation.nativeHandPoseTables,
    } : {}),
    motionBanks: [{
      bank: 16,
      member: motionFile,
      expectedSequences: motionNames.map((name, index) => ({ index, name })),
    }],
    activities,
  });
};

build({
  variant: "selector-1",
  outputName: "dnoz",
  audioManifest: "public/audio/world/dnoz/manifest.json",
  members: [
    member("M_01FUL.MOTN", "M_01FUL.BIN", 90220, "27fcb2bf528b1688b24379aacb63a05ebeaeca0938dba21f262bf4905b23848d"),
    member("SEQDATA2.AUTH", "SEQDATA2.BIN", 11104, "210cf85c321ba1e7265ae05af47ff402abb259b698fabc29d19bec0b71ee1d5e"),
    member("SEQDATA3.AUTH", "SEQDATA3.BIN", 4092, "ce0cc17dae8d19f50c39141a7d313ed9cb5c06640ba617623b2550b06152139f"),
  ],
  motionFile: "M_01FUL.MOTN",
  motionNames: [
    "AKI_AT1_KIKU_NAKIGOE_NOZOMINAMIDA_0100", "AKI_AT1_NOZOMI_NAMIDA_0100",
    "AKI_AT2_TALK_NOZOMINAMIDA_0100", "AKI_AT3_MOTARERU_NOZOMINAMIDA_0100",
    "SIN_NOZ_AT1_NOZOMI_NAMIDA_0100", "SIN_NOZ_AT2_TALK_NOZOMINAMIDA_0100",
    "SIN_NOZ_AT3_MOTARERU_NOZOMINAMIDA_0100",
  ],
  activities: [{
    slot: 0, primaryPointer: 0x393d, secondaryPointer: 0x394a,
    file: "SEQDATA2.AUTH", actors: ["AKIR", "HRSK"], durationFrames: 1920,
    frameCount: 50, commandCounts: { camera: 1, move: 2, motion: 6, voice: 17, sound: 30 },
    ...presentationCues("0x13e0", 1920, 0),
    nativeSceneObjectStates,
  }, {
    slot: 1, primaryPointer: 0x3958, secondaryPointer: 0x3965,
    file: "SEQDATA3.AUTH", actors: ["AKIR", "HRSK"], durationFrames: 1560,
    frameCount: 16, commandCounts: { camera: 1, move: 2, motion: 2, sound: 6, voice: 9 },
    ...presentationCues("0x1628", 1560, 1),
    nativeSceneObjectStates,
  }],
});

const skiHandPresentation = presentationCues("0xd18", 3074, 1);
build({
  variant: "selector-0",
  outputName: "dnoz-ski",
  audioManifest: "public/audio/world/dnoz-ski/manifest.json",
  members: [
    member("M_01SKI.MOTN", "M_01SKI.BIN", 161028, "b9ef1bff76366cf98b689f8007e444e37817d7f352daed22fbdbfa42486426b8"),
    member("SEQDATA4.AUTH", "SEQDATA4.BIN", 3864, "2cb6480b7585a4006d55c778b6fea01e1b821e329346f6d5cdecbe7578887d2b"),
    member("SEQDATA5.AUTH", "SEQDATA5.BIN", 9268, "da6f69a9a4d4fd576dae55353cab272975e99e411da87c0cae2f80dd420b2032"),
  ],
  motionFile: "M_01SKI.MOTN",
  motionNames: [
    "AKI_AT1_NOZOMI_KOKUHAKU_0100", "SIN_NOZ_AT1_NOZOMI_KOKUHAKU_0100", "SIN_SIN_RUN5_LP",
    "SYP_SYP_RUN_LP", "AKI_AT1_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100",
    "AKI_AT2_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100", "AKI_AT3_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100",
    "KCT_EVENT_STEP10_1", "KCT_EVENT_STEP10_1_L", "KCT_WALK_LP",
    "SIN_NOZ_AT1_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100", "SIN_NOZ_AT2_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100",
    "SIN_NOZ_AT3_KOKUHAKUSURU_NOZOMIKOKUHAKU_0100", "AKI_AT1_YOBIDASU_NOZKOKUHAKUTEL_0100",
  ],
  activities: [{
    slot: 0, primaryPointer: 0x38e2, secondaryPointer: 0x38ef,
    file: "SEQDATA4.AUTH", actors: ["AKIR", "HRSK"], durationFrames: 830,
    frameCount: 16, commandCounts: { camera: 1, move: 2, motion: 2, sound: 8, voice: 8 },
    ...presentationCues("0xb34", 830, 0),
    nativeSceneObjectStates,
  }, {
    slot: 1, primaryPointer: 0x38fd, secondaryPointer: 0x390a,
    file: "SEQDATA5.AUTH", actors: ["AKIR", "HRSK"], durationFrames: 3074,
    frameCount: 44, commandCounts: { camera: 1, move: 2, motion: 2, voice: 25, sound: 18 },
    ...skiHandPresentation,
    nativeSceneObjectStates,
  }],
  handPresentation: skiHandPresentation,
});

console.log("Wrote both exact DNOZ ordered-fragment activity packs");
