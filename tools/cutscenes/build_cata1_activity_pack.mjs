#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNativeAseqActivityPack,
  parseIpacActivityArchive,
  sha256,
} from "../lib/NativeAseqActivityPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const expectedMembers = Object.freeze([
  ["DANM400G.CHRM", 2636, "a34211b0f17aa553059312bd098f755e7fa95483bcd5d95a8deae88e3318f452"],
  ["KRIS500G.CHRM", 1028, "519ad6824273ccbe27ac8f120a2372a1cbac3f0d6567870f1f639dcb63e4a804"],
  ["M_01CAT.MOTN", 366692, "01489797ac2fb1db34bb63659b418672160c4d0a2fdd4d6bc5fbcc5073a04f42"],
  ["NIBM400G.CHRM", 1692, "0e1b1183dac9fd49175e994aaaf1141a154a3e95d4bf59913ae0c904eb9da40b"],
  ["NIBM401G.CHRM", 7620, "86599162d325f971b00459692dd2e3fb0f41f6fff5a100dd3b6d78d31f654b65"],
  ["SEQDATA0.AUTH", 28456, "608d057edec528c35f4067cf5011abb8c351e81fd916269b7642d68833124552"],
  ["SEQDATA1.AUTH", 15028, "8fe949eb1378fd9f37f8742972f8f8116d3dbbdcff2c428a16c89ea20cd56ed4"],
  ["SEQDATA2.AUTH", 9012, "db3cf574a2567e2a3dd5d52f70d2f3678efeb81cf4029a324ddf59154868b1b7"],
].map(([name, byteLength, hash]) => ({ name, byteLength, sha256: hash })));

const bindingArchivePath = path.join(sourceRoot, "data/SCENE/01/JU00/CATA1.PKF");
const bindingArchive = readFileSync(bindingArchivePath);
if (sha256(bindingArchive) !== "b7d7742fc765789b625b4b97f82e2c29b71d348c2f337d5663ee8e876a992b53") {
  throw new Error("CATA1 object-binding archive changed");
}
const { members: bindingMembers } = parseIpacActivityArchive(
  bindingArchive,
  "CATA1.PKF",
);
if (bindingMembers.length !== 1 || bindingMembers[0].name !== "CHARA.CHRT") {
  throw new Error("CATA1 object-binding archive members changed");
}
const chrt = bindingMembers[0].bytes;
if (
  chrt.length !== 1144
  || sha256(chrt) !== "85e215ee00fc19bfefcced6aab278d41b9d735a5caae2ba5a45d35bb15846262"
) throw new Error("CATA1 CHARA.CHRT changed");
const expectedBindings = Object.freeze({
  NBOX: ["DANM400G", "DANM400G"],
  NBO1: ["NIBOSHI", "NIBM400G"],
  NBO2: ["NIBOSHI", "NIBM400G"],
  NBO3: ["NIBOSHI", "NIBM400G"],
  NBO4: ["NIBOSHI", "NIBM400G"],
  NBO5: ["NIBOSHI", "NIBM400G"],
  BNB1: ["NIBM401G", "NIBM401G"],
  BNB2: ["NIBM401G", "NIBM401G"],
  BNB3: ["NIBM401G", "NIBM401G"],
  ABRG: ["ABURAGE", "KRIS500G"],
});
const bindings = parseChrtSceneObjectBindings(chrt);
if (
  bindings.length !== Object.keys(expectedBindings).length
  || bindings.some(binding => {
    const expected = expectedBindings[binding.actorTag];
    return !expected || binding.image !== expected[0] || binding.model !== expected[1];
  })
) throw new Error("CATA1 CHRT actor/model bindings changed");

const outputDirectory = path.join(root, "play/assets/yamanose/cata1");
const assetPath = model => `play/assets/yamanose/cata1/${model}.CHRM`;
const sceneObjects = Object.fromEntries(bindings.map(binding => [binding.actorTag, {
  model: binding.model,
  image: binding.image,
  browserFilename: `S1_JU00_${binding.model}.MT5`,
  assetPath: assetPath(binding.model),
  lifecycle: { kind: "native-composite-owner" },
  nativeBinding: {
    archive: "CATA1.PKF",
    archiveMember: "CHARA.CHRT",
    characterRecordOffset: binding.characterRecordOffset,
    imagePropertyOffset: binding.imagePropertyOffset,
    defImageRecordOffset: binding.defImageRecordOffset,
  },
} ]));

buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_cata1_activity_pack.mjs",
  resourceName: "CATA1",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/JU00/CATA1.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/JU00/CATA1.PKS",
  archiveSha256: "2bc070776361b822cda028f653d45fa94e08474f22b3e01686ebdb885c46924b",
  expectedMembers,
  bindingEvidence: "tools/evidence/cata1-native-lifecycle.json",
  selectionRule: "exact AUTH member name selected by repeated operation-0x013e slot-0 installs",
  audioManifest: "public/audio/world/cata1/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/yamanose/cata1",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  outputMembers: ["DANM400G.CHRM", "KRIS500G.CHRM", "NIBM400G.CHRM", "NIBM401G.CHRM"],
  packageActors: {
    CATM: {
      label: "Yamanose shrine kitten",
      modelCode: "KC1_M",
      browserFilename: "S3_JU00_KC1_M.MT5",
      assetFormat: "MT5",
      characterScale: 1,
    },
  },
  sceneObjects,
  motionBanks: [{
    bank: 16,
    member: "M_01CAT.MOTN",
    expectedSequences: [
      [0, "AKI_AKI_STAND_DOWN_HED_LP"],
      [1, "AKI_AT1_MEGUMI_NEKOTAWAMURE_0100"],
      [4, "AKI_AT2_MEGUMI_NIBOSI_NEKOTAWAMURE_0100"],
      [6, "AKI_AT3_MEGUMI_ABURAAGE_NEKOTAWAMURE_0100"],
      [16, "KCT_YOKOTAWARU_LP"],
      [18, "KCT_YOKOTAWARU_TABENAI2"],
      [19, "KCT_YOKOTAWARU_TABERU"],
      [22, "KOD_MEG_AT1_MEGUMI_NEKOTAWAMURE_0100"],
      [23, "KOD_MEG_AT2_MEGUMI_NIBOSI_NEKOTAWAMURE_0100"],
      [24, "KOD_MEG_AT2_MEGUMI_NIBOSI_NEKOTAWAMURE_2_0100"],
      [25, "KOD_MEG_AT3_MEGUMI_ABURAAGE_NEKOTAWAMURE_0100"],
    ].map(([index, name]) => ({ index, name })),
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0x51bc1,
    secondaryPointer: 0x51bce,
    file: "SEQDATA0.AUTH",
    actors: ["NBOX", "CATM", "AKIR", "MEGM"],
    durationFrames: 3150,
    frameCount: 70,
    commandCounts: { camera: 1, move: 4, motion: 16, sound: 30, voice: 29 },
  }, {
    slot: 0,
    primaryPointer: 0x51bd4,
    secondaryPointer: 0x51be1,
    file: "SEQDATA1.AUTH",
    actors: ["NBOX", "CATM", "NBO1", "NBO2", "NBO3", "BNB1", "BNB2", "BNB3", "MEGM", "AKIR"],
    durationFrames: 2391,
    frameCount: 72,
    commandCounts: { camera: 1, move: 10, motion: 25, sound: 35, voice: 18 },
  }, {
    slot: 0,
    primaryPointer: 0x51be7,
    secondaryPointer: 0x51bf4,
    file: "SEQDATA2.AUTH",
    actors: ["NBOX", "MEGM", "CATM", "AKIR"],
    durationFrames: 1370,
    frameCount: 45,
    commandCounts: { camera: 1, move: 4, motion: 15, sound: 22, voice: 12 },
  }],
});

console.log(`Wrote exact CATA1 activity pack to ${outputDirectory}`);
