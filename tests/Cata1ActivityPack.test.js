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

test("CATA1 preserves detailed Ryo poses and Megumi's body-hand cues per shot", () => {
  assert.deepEqual(activity.activities.map(record => record.nativeHandPoseCues.length), [6, 7, 5]);
  assert.deepEqual(activity.activities.map(record => record.nativeBodyHandPoseCues.length), [4, 2, 4]);
  assert.equal(activity.handAssets.MEGM.mode, "body-only");
  for (const record of activity.activities) {
    assert.deepEqual(record.nativeBodyHandPoseCues.slice(0, 2).map(cue => [cue.frame, cue.actorTag, cue.targetIndex]),
      [[0, "AKIR", 8], [0, "MEGM", 8]]);
    assert.ok(record.nativeHandPoseCues.every(cue => cue.actorTag === "AKIR" && cue.frame < record.durationFrames));
    for (const cue of record.nativeHandPoseCues) assert.equal(activity.nativeHandPoseTables[cue.poseTableOffset].vectors.length, 19);
  }
  assert.deepEqual(activity.activities[2].nativeBodyHandPoseCues.slice(2).map(cue => [cue.frame, cue.channel, cue.targetIndex]),
    [[150, 1, 1], [800, 1, 8]]);
});

test("CATA1 compiles tagged hand props to their exact reused-slot activities", () => {
  assert.deepEqual(Object.keys(activity.attachedObjects), ["NBO1", "NBO2", "NBO3", "ABRG"]);
  for (const tag of ["NBO1", "NBO2", "NBO3"]) {
    const object = activity.attachedObjects[tag];
    assert.equal(object.sceneObject, true);
    assert.equal(object.assetPath, undefined); // Borrow, never load a duplicate.
    assert.deepEqual(object.attachments.filter(cue => cue.action === "attach")
      .map(cue => cue.parentActorTag), ["AKIR", "AKIR"]);
    assert.deepEqual(object.attachments.map(cue => [cue.activityId, cue.frame, cue.controlId ?? null]), [
      ["CATA1/SEQDATA1.AUTH", 1, 18],
      ["CATA1/SEQDATA1.AUTH", 140, 12],
      ["CATA1/SEQDATA1.AUTH", 270, null],
    ]);
  }
  const tofu = activity.attachedObjects.ABRG.attachments;
  assert.deepEqual(tofu.map(cue => [cue.activityId, cue.frame, cue.action]), [
    ["CATA1/SEQDATA2.AUTH", 1, "attach"], ["CATA1/SEQDATA2.AUTH", 120, "detach"],
  ]);
  // The reused native frame vector changes only one or two components for
  // each fish. Their common X/Y and distinct Z must survive basic-block splits.
  const vectors = ["NBO1", "NBO2", "NBO3"].map(tag => activity.attachedObjects[tag].attachments[0].translation);
  assert.deepEqual(vectors.map(v => v.map(n => Number(n.toFixed(3)))), [
    [0.116, 0.016, -0.03], [0.116, 0.016, -0.02], [0.116, 0.01, -0.01],
  ]);
});
