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
  ["BINS501G.CHRM", 2132, "77bc11a2d715a76838a2df1f98a16f498a95c2319867515d1a88428ee50e8e4d"],
  ["C95T1HK1.CHRM", 1292, "e7b5390215c2a174c2b392bbdac008a2d7c7014faf5e491696b31921b862ef6c"],
  ["C95T1HKG.CHRM", 34528, "593e6265ca7b38b4fc8c47c81f4c1a525d1a8c1d9b617eb2a88157ceb28bc543"],
  ["DBR0100G.CHRM", 11160, "ac635db3c6da1e26aebd7bb998a673c89a0d289924fbc0550f1d21fbf834e81c"],
  ["DRMK0002.CHRM", 1660, "0524ff1b1a84fd54ff8bf57809b5c43f753dccc62f72f93ba4507bac2bd82018"],
  ["DYNAMICS.DYNM", 219812, "bf56441991312407db2e8479b989829ecd711d2155ec8c789962c80c2e588e85"],
  ["HAK02JMG.CHRM", 2080, "dcc36eb97c2adbac2d7c4057b1ddacfa78e8d5bd04968484a353b07b689289cc"],
  ["SEQDATA1.AUTH", 1820, "529bc62c6721402fa265c4952d5d9aae3d9ba42ce0807ee39436935a9f448422"],
  ["SEQDATA2.AUTH", 29596, "e56fd5983791b824f1f7b1ce40629a207df87f5081b723cc7b5d18d1c2af4b58"],
  ["YKDS500G.CHRM", 7776, "3176b44a5d6344b20ce6f4291a95d848a83b7f28c40f11a1199b26a7bc8fb9fc"],
  ["YKDS501G.CHRM", 8268, "2b1d852061e532119d0581578ad918e74d6494e9c39c9c2e525651d7abbe828d"],
].map(([name, byteLength, sha256]) => ({ name, byteLength, sha256 })));

const outputDirectory = path.join(repoRoot, "play/assets/dobuita/yq14");
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_yq14_activity_pack.mjs",
  resourceName: "YQ14",
  disc: 1,
  sourcePath: path.join(sourceRoot, "data/SCENE/01/D000/YQ14.PKS"),
  sourceManifestPath: "extracted_files/data/SCENE/01/D000/YQ14.PKS",
  archiveSha256: "78080bd152e5fd49afc311dc721ceee8383f8fec19e453a8e915376b5d702a1e",
  expectedMembers,
  bindingEvidence: "play/data/events/nativeEventPrograms.generated.json",
  selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot",
  audioManifest: "public/audio/world/yq14/manifest.json",
  outputDirectory,
  outputAssetPrefix: "play/assets/dobuita/yq14",
  manifestPath: path.join(outputDirectory, "manifest.json"),
  // BIN_ is an AUTH-addressed scene object, not a resident character. Keep
  // its archive member in this package so the runtime can instantiate the
  // exact CHRT-bound model without adding it to Dobuita's global placements.
  outputMembers: ["BINS501G.CHRM"],
  sceneObjects: {
    BIN_: {
      model: "BERHI204",
      browserFilename: "S1_YQ14_BINS501G.MT5",
      assetPath: "play/assets/dobuita/yq14/BINS501G.CHRM",
      lifecycle: { kind: "auth-scoped" },
      nativeBinding: {
        mapinfo: "extracted_files/data/SCENE/01/YQ14/MAPINFO.BIN",
        mapinfoSha256: "84ba191106cbc8f882790468bd8a7054f207bf7375e32355519fb6f49bc904bf",
        chrtOffset: "0x6241c",
        image: "BEER",
        defImageModel: "BERHI204",
        archiveMember: "BINS501G.CHRM",
        archiveMemberSha256: "77bc11a2d715a76838a2df1f98a16f498a95c2319867515d1a88428ee50e8e4d",
      },
    },
  },
  motionBanks: [{
    bank: 16,
    sourcePath: path.join(repoRoot, "play/assets/account/M_ZAKO.MOTN"),
    assetPath: "play/assets/account/M_ZAKO.MOTN",
    byteLength: 168080,
    sha256: "0562507487c808d2e1ad80f5e2fd2a3527172e01fd79501c64134db1ffccac3d",
    parseOptions: { sequenceIndices: [0, 1, 2, 3] },
    expectedSequences: [
      { index: 0, name: "AK_SY_PU_SYO_L2" },
      { index: 1, name: "F1ERROR0" },
      { index: 2, name: "F1ERROR1" },
      { index: 3, name: "F1ERROR2" },
    ],
  }],
  activities: [{
    slot: 0,
    primaryPointer: 0xaf81b,
    secondaryPointer: 0xaf828,
    file: "SEQDATA1.AUTH",
    actors: ["SMTH", "TONY", "AKIR"],
    durationFrames: 70,
    frameCount: 5,
    commandCounts: { camera: 1, move: 3, motion: 3, sound: 4 },
  }, {
    slot: 1,
    primaryPointer: 0xaf82d,
    secondaryPointer: 0xaf83a,
    file: "SEQDATA2.AUTH",
    actors: ["BIN_", "SMTH", "TONY", "AKIR"],
    durationFrames: 435,
    frameCount: 13,
    commandCounts: { camera: 1, move: 4, motion: 5, sound: 9, voice: 2 },
  }],
});

console.log(`Wrote exact YQ14 activity pack to ${outputDirectory}`);
