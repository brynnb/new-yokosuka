#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackSoundCommands } from "../lib/NativeAseqCallbackPresentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const callbackPath = "tools/evidence/bebf-native-callback-ir.json";
const callback = JSON.parse(readFileSync(path.join(root, callbackPath)));
const mapinfo = readFileSync(path.join(sourceRoot, "data/SCENE/01/JOMO/MAPINFO.BIN"));
if (sha256(mapinfo) !== "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
  || callback.source.mapinfoSha256 !== sha256(mapinfo)
  || callback.source.callbackFunction !== "0x4bb38") {
  throw new Error("BEBF callback source changed");
}
const nativeSoundCommandCues = extractNativeAseqCallbackSoundCommands({
  bytes: mapinfo,
  callbackFunction: 0x4bb38,
  nativeFunction: callback.function,
  durationFrames: 700,
  source: { path: callbackPath, mapinfoSha256: callback.source.mapinfoSha256 },
});
// Project the owner's two straight-line room-layer helpers, not the entire
// bedroom/story script. Keep the source calls beside the generated visibility.
const program = JSON.parse(readFileSync(path.join(root,
  "play/data/events/nativeEventPrograms.generated.json"))).programs.find(
  value => value.id === "disc1-jomo-bebf-nightmare-owner-0x4bf5c",
);
if (program?.mapinfoSha256 !== sha256(mapinfo)) throw new Error("BEBF owner source changed");
const visibilityFor = (functionId, expectedValue) => {
  const fn = program.functions.find(value => value.id === functionId);
  const writes = fn.blocks.flatMap(block => block.actions).filter(
    action => action.semanticId === "numbered-map-layer-state",
  );
  if (JSON.stringify(writes.map(action => action.arguments.map(arg => arg.value)))
    !== JSON.stringify([0, 2, 4, 6, 8].map(layer => [layer, expectedValue]))) {
    throw new Error(`BEBF room-layer helper ${functionId} changed`);
  }
  return writes.map(action => ({
    nativeName: action.arguments[0].value === 0 ? "MAP"
      : `MAP${String(action.arguments[0].value).padStart(2, "0")}`,
    visible: action.arguments[1].value !== 0,
    source: { functionId, callFileOffset: action.callFileOffset, operation: "0x0098" },
  }));
};
const bedroomVisibility = visibilityFor("0x4c584", 1);
const dreamVisibility = visibilityFor("0x4c50c", 0);
// Deliberate browser presentation choice: omit the two blanket variants until
// their native deformation is recovered. Borrow the existing root-visibility
// lease so they stay hidden on waking and return unchanged to exploration.
// The opening OP00 bedroom already has no FUT1/FUT2 instances.
const roomPlacements = JSON.parse(readFileSync(path.join(root,
  "play/data/jomo-runtime-placements.json"))).placements;
const blankets = ["FUT1", "FUT2"].map(nativeName => {
  const matches = roomPlacements.filter(value => value.runtime?.objectTag === nativeName);
  if (matches.length !== 1) throw new Error(`BEBF blanket ${nativeName} placement changed`);
  return { nativeName, browserFilename: matches[0].model };
});
const blanketVisibility = blankets.map(({ nativeName }) => ({ nativeName, visible: false }));
const mapLayers = [
  ...bedroomVisibility.map(({ nativeName }) => ({
    nativeName, browserFilename: `S1_JOMO_${nativeName}.MT5`,
  })),
  ...blankets,
];
const owner = program.functions.find(value => value.id === "0x4bf5c");
const background = owner.blocks.flatMap(block => block.actions).find(
  action => action.callFileOffset === "0x4bfba",
);
if (background?.semanticId !== "scroll-sprite-mode-two-control"
  || JSON.stringify(background.arguments.map(arg => arg.value)) !== "[2,4278190080]") {
  throw new Error("BEBF native solid background changed");
}
const backgroundWord = background.arguments[1].value;
const browserBackgroundColor = [16, 8, 0, 24].map(shift => ((backgroundWord >>> shift) & 255) / 255);
if (JSON.stringify(nativeSoundCommandCues.map(cue => [cue.frame, cue.action.callFileOffset]))
  !== JSON.stringify([[0, "0x4bbb0"], [0, "0x4bbc8"]])) {
  throw new Error("BEBF callback sound timeline changed");
}

const expectedMembers = Object.freeze([
  ["M_01BEDB.MOTN", 53740, "18101bae8cc89914b150af6049d3fbb2b9954c9f3041c5a2189b00c449191c8c"],
  ["SEQDATA0.AUTH", 1636, "dca3e9c06e0a166c8c1b6378611edcf17784293aa2ccd2c091e65b41527dd569"],
  ["SEQDATA1.AUTH", 2304, "72739216b17bc1e18154c3d5da46f55243d3df819fe62615d0a197caac086c51"],
  ["SEQDATA2.AUTH", 2404, "c454590be0b1d00e10cf7df1b1c01f39a873df085e62443065a1453f50edef15"],
  ["SEQDATA3.AUTH", 1584, "e03c42fbda49a4f52d708e727deed4b526238b03a72df6f94ea35aa9fac8ae8d"],
  ["SIN_F.CHRM", 15076, "7fb76c9d3b86c780cc0d111c8c9b8011cd1123c73ef1dd5295677eb666e5d767"],
  ["SIN_FTBL.BIN", 8092, "9ce6c79f85666df9d19bdce9210d975aa60ad3b6e68bd97f5770a56b090bb9e7"],
  ["SIN_HM.BIN", 8632, "6245a820d3b4e69388cde3bea95f2d9b0bc3246a77e8ff2254d586e6398fc589"],
  ["SIN_M.CHRM", 119772, "3c060c6f7800e055b3cdb6ada82a3a97443e5bfd7feacd9babda67653fb8a3cb"],
  ["SIN_TL.CHRM", 12676, "d0c2c59ead198eef047313c5852726df5b1ffd0d903baa4e95254e7f38468be0"],
  ["SIN_TR.CHRM", 12764, "6427c37fbdba8b721a0ed0580c89bc9513260f5a1a4df9d5af25fc5226b3962e"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(root, "play/assets/hazuki/bebf");
const activities = [
  [60, 0x965d7, 0x965e4, "SEQDATA0.AUTH", ["AKID"], 260, 3,
    { camera: 1, move: 1, motion: 1, sound: 3 }],
  [61, 0x965e9, 0x965f6, "SEQDATA1.AUTH", ["SINF"], 700, 4,
    { camera: 1, move: 1, motion: 1, voice: 3 }],
  [62, 0x965fb, 0x96608, "SEQDATA2.AUTH", ["AKID"], 370, 5,
    { camera: 1, move: 1, motion: 1, sound: 1, voice: 3 }],
  [63, 0x9660d, 0x9661a, "SEQDATA3.AUTH", ["SINF"], 700, 4,
    { camera: 1, move: 1, motion: 1, voice: 3 }],
].map(([slot, primaryPointer, secondaryPointer, file, actors, durationFrames,
  frameCount, commandCounts]) => ({
  slot, primaryPointer, secondaryPointer, file, actors, durationFrames,
  frameCount, commandCounts,
  browserMapVisibility: [
    ...([61, 63].includes(slot) ? dreamVisibility : bedroomVisibility),
    ...blanketVisibility,
  ],
  browserBackgroundColor,
  // The browser loads additional JOMO layers and placed props that the retail
  // dream does not activate. Isolate the dream stage; do not guess equivalent
  // numbered native commands for those extra resident models.
  browserIsolatedStage: [61, 63].includes(slot),
  // Helper 0x4b4f8 launches callback 0x4bb38 for slots 61 and 63 at
  // 0x4b5a4/0x4b644. Slot 60 is the preceding sleeping-Ryo shot, not music start.
  ...([61, 63].includes(slot) ? { nativeSoundCommandCues } : {}),
}));

buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_bebf_activity_pack.mjs",
  resourceName: "BEBF",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JOMO/BEBF.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JOMO/BEBF.PKS",
  archiveSha256: "b380638f300587c15a02cc6d4e73a9aa7a37a39ca2a7964f9ced9653bf4ec6bd",
  expectedMembers,
  bindingEvidence: "tools/evidence/bebf-native-lifecycle.json",
  selectionRule: "four exact AUTH members selected by native slots 60 through 63",
  audioManifest: "public/audio/world/bebf/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/hazuki/bebf",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  playerActorAliases: ["AKID"],
  mapLayers,
  packageActors: {
    SINF: {
      label: "Shenhua Ling",
      modelCode: "SIN_M",
      browserFilename: "S3_JOMO_SIN_M.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  ownerAudioCommands: [{
    commandHex: "a83f0000",
    exactArguments: [0, 0],
    kind: "music",
    trackId: "bgm129",
    callFileOffsets: ["0x4bbb0"],
  }, {
    commandHex: "a0040000",
    exactArguments: [2, 115],
    kind: "native-control-no-output",
    constructedQueueWord: "0x00000002",
    byteReversedDriverWord: "0x02000000",
    callFileOffsets: ["0x4bbc8"],
  }],
  motionBanks: [{
    bank: 29,
    member: "M_01BEDB.MOTN",
    expectedSequences: [
      { index: 0, name: "AKI_AT1_UNASARERU_SHENFA_BADENDING15MAE_0100" },
      { index: 1, name: "SIN_AT1_DERU_YUME_BADENDING15MAE_0100" },
      { index: 2, name: "SIN_AT1_YUME_FURIMUKU_BADENDING15MAE_0100" },
      { index: 3, name: "SIN_AT1_YUME_FURIMUKU2_BADENDING15MAE_0100" },
    ],
  }],
  activities,
});
console.log(`Wrote exact BEBF activity pack to ${outputDirectory}`);
