#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeAseqActivityPack } from "../lib/NativeAseqActivityPack.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

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
