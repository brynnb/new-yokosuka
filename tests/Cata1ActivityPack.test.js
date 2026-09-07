import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activity = JSON.parse(readFileSync(
  "play/assets/yamanose/cata1/manifest.json",
));
const audio = JSON.parse(readFileSync(
  "public/audio/world/cata1/manifest.json",
));

test("CATA1 packages the exact three native kitten-care activities", () => {
  assert.deepEqual(
    activity.activities.map(value => value.archiveMember),
    ["SEQDATA0.AUTH", "SEQDATA1.AUTH", "SEQDATA2.AUTH"],
  );
  assert.deepEqual(activity.activities.map(value => value.slot), [0, 0, 0]);
  assert.deepEqual(activity.activities.map(value => value.durationFrames), [3150, 2391, 1370]);
  assert.equal(activity.activities.flatMap(value => value.motions).length, 56);
});

test("CATA1 preserves exact CHRT tag-to-model identities", () => {
  assert.equal(activity.sceneObjects.NBOX.model, "DANM400G");
  assert.deepEqual(
    ["NBO1", "NBO2", "NBO3", "NBO4", "NBO5"]
      .map(tag => activity.sceneObjects[tag].model),
    Array(5).fill("NIBM400G"),
  );
  assert.deepEqual(
    ["BNB1", "BNB2", "BNB3"].map(tag => activity.sceneObjects[tag].model),
    Array(3).fill("NIBM401G"),
  );
  assert.equal(activity.sceneObjects.ABRG.model, "KRIS500G");
  assert.equal(activity.packageActors.CATM.assetPath, undefined);
  assert.equal(activity.packageActors.CATM.browserFilename, "S3_JU00_KC1_M.MT5");
});

test("CATA1 audio uses the exact native stream and sound bank", () => {
  assert.equal(audio.sources.stream.path, "extracted_files/data/SCENE/01/STREAM/01CAT1.AFS");
  assert.equal(audio.sources.soundBank.path, "extracted_files/data/SCENE/01/SOUND/A1_NEKO1.SND");
  assert.equal(audio.voices.length, 53);
  assert.equal(audio.sounds.length, 22);
});
