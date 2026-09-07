import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNativeAseqActivityPack,
  parseIpacActivityArchive,
  sha256,
} from "../tools/lib/NativeAseqActivityPack.mjs";

const archivePath = "extracted_files/data/SCENE/01/D000/YQ14.PKS";
const sharedMotionPath = "play/assets/account/M_ZAKO.MOTN";

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
].map(([name, byteLength, digest]) => Object.freeze({
  name,
  byteLength,
  sha256: digest,
})));

test("generic activity compiler reads gzip-wrapped native archives", () => {
  const archive = parseIpacActivityArchive(fs.readFileSync(archivePath), "YQ14");
  assert.equal(archive.compressed, true);
  assert.deepEqual(
    archive.members.map(member => [member.name, member.bytes.length, sha256(member.bytes)]),
    expectedMembers.map(member => [member.name, member.byteLength, member.sha256]),
  );
});

test("generic activity compiler reuses an exact canonical motion bank", (context) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "yq14-pack-"));
  context.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  const manifestPath = path.join(outputDirectory, "manifest.json");
  const manifest = buildNativeAseqActivityPack({
    generatedBy: "tests/NativeAseqActivityPack.test.js",
    resourceName: "YQ14",
    disc: 1,
    sourcePath: archivePath,
    sourceManifestPath: "extracted_files/data/SCENE/01/D000/YQ14.PKS",
    archiveSha256: "78080bd152e5fd49afc311dc721ceee8383f8fec19e453a8e915376b5d702a1e",
    expectedMembers,
    bindingEvidence: "play/data/events/nativeEventPrograms.generated.json",
    selectionRule: "zero-based AUTH-extension ordinal selected by operation-0x013e slot",
    outputDirectory,
    outputAssetPrefix: "play/assets/dobuita/yq14",
    manifestPath,
    outputMembers: ["BINS501G.CHRM"],
    sceneObjects: {
      BIN_: {
        model: "BERHI204",
        browserFilename: "S1_YQ14_BINS501G.MT5",
        assetPath: "play/assets/dobuita/yq14/BINS501G.CHRM",
      },
    },
    motionBanks: [{
      bank: 16,
      sourcePath: sharedMotionPath,
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

  assert.deepEqual(manifest.motionBanks, [{
    bank: 16,
    path: "play/assets/account/M_ZAKO.MOTN",
    byteLength: 168080,
    sha256: "0562507487c808d2e1ad80f5e2fd2a3527172e01fd79501c64134db1ffccac3d",
  }]);
  assert.equal(manifest.sceneObjects.BIN_.model, "BERHI204");
  assert.ok(!fs.existsSync(path.join(outputDirectory, "M_ZAKO.MOTN")));
  assert.deepEqual(
    fs.readdirSync(outputDirectory).sort(),
    ["BINS501G.CHRM", "SEQDATA1.AUTH", "SEQDATA2.AUTH", "manifest.json"],
  );
  assert.deepEqual(
    manifest.activities.map(activity => activity.motions.map(motion => motion.motionName)),
    [["F1ERROR1", "F1ERROR0", "F1ERROR2"], [
      "F1ERROR1",
      "F1ERROR0",
      "AK_SY_PU_SYO_L2",
      "F1ERROR1",
      "F1ERROR0",
    ]],
  );
});
