import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync("play/assets/hazuki/tgma/manifest.json"));
const lifecycle = JSON.parse(fs.readFileSync("tools/evidence/tgma-native-lifecycle.json"));

test("TGMA packages the exact letter activity and Fukuhara model variant", () => {
  assert.equal(manifest.source.sha256, "095c988fcb8cf05c8559188b8705cc720c48305e9f1f8de3b577d97d676b95c2");
  assert.equal(manifest.activities.length, 1);
  assert.deepEqual(
    [manifest.activities[0].slot, manifest.activities[0].primaryPointer, manifest.activities[0].secondaryPointer],
    [0, 0x601b8, 0x601bd],
  );
  assert.equal(manifest.packageActors.FUKU.modelCode, "FUB_M");
  assert.equal(manifest.attachedObjects.TEGS.assetPath, "play/assets/hazuki/tgma/MALS509G.CHRM");
  assert.equal(manifest.facialAssets.FUKU.bodyModelCode, "FUB_M");
  assert.equal(manifest.facialAssets.FUKU.faceCode, "FUB");
  assert.equal(manifest.facialAssets.FUKU.poses.kind, "neutral-fallback");
  assert.equal(
    manifest.facialAssets.FUKU.model.sha256,
    "d2723415939ce6b6387715a354921f64513a815216f0174892517cbdb5022054",
  );
  assert.equal(
    manifest.facialAssets.FUKU.table.sha256,
    "c2be5f63cb0918f4a26b982f68be29c5aadcae95fdb7a24a7ecbe4d6bc2c4f32",
  );
});

test("TGMA preserves independent attachment, visibility, and hinge timelines", () => {
  const letter = manifest.attachedObjects.TEGS;
  assert.deepEqual(letter.attachments, [{
    activitySlot: 0,
    frame: 1,
    parentActorTag: "AKIR",
    controlId: 18,
    translation: [0.12300000339746475, 0.01600000075995922, -0.052000001072883606],
    rotationRaw: [0xd48d, 0xd1b4, 0x5765],
  }]);
  assert.deepEqual(letter.presentation.map(value => [value.frame, value.visible]), [
    [350, true],
    [800, false],
  ]);
  assert.deepEqual(letter.nodeTransforms, lifecycle.letter.hinges.map(value => ({
    activitySlot: 0,
    ...(value.frame === undefined
      ? { firstFrame: value.firstFrame, lastFrame: value.lastFrame }
      : { frame: value.frame }),
    nodeKey: value.nodeKey,
    mode: value.mode,
    rotationRaw: value.rotationRaw,
  })));
});

test("TGMA compiles native callback hand and expression operations", () => {
  const activity = manifest.activities[0];
  assert.deepEqual(
    activity.nativeHandPoseCues.map(cue => [
      cue.frame,
      cue.actorTag,
      cue.side,
      cue.poseTableOffset,
      cue.durationNativeTicks,
    ]),
    [
      [1, "AKIR", "right", "0x5cee8", 1],
      [1, "AKIR", "left", "0x5cd20", 1],
      [1, "FUKU", "right", "0x5cd20", 1],
      [1, "FUKU", "left", "0x5cd20", 1],
      [715, "FUKU", "right", "0x5cb58", 15],
    ],
  );
  assert.deepEqual(Object.keys(manifest.nativeHandPoseTables).sort(), [
    "0x5cb58",
    "0x5cd20",
    "0x5cee8",
  ]);
  assert.equal(activity.nativeFaceClipCues.length, 12);
  assert.deepEqual(
    activity.nativeFaceClipCues.map(cue => cue.frame),
    [2, 90, 160, 274, 411, 465, 487, 511, 580, 790, 840, 900],
  );
  assert.deepEqual(
    Object.fromEntries([
      ...new Set(activity.nativeFaceGazeCues.map(cue => cue.callFileOffset)),
    ].map(call => [
      call,
      activity.nativeFaceGazeCues
        .filter(cue => cue.callFileOffset === call)
        .map(cue => cue.frame),
    ])),
    {
      "0x23d9a": Array.from({ length: 21 }, (_, index) => 466 + index),
      "0x239a6": [487],
      "0x23e16": Array.from({ length: 13 }, (_, index) => 791 + index),
      "0x23c0a": [804],
    },
  );
});

test("TGMA generated assets remain byte-identical to their manifest", () => {
  for (const output of manifest.outputs) {
    assert.equal(fs.statSync(output.path).size, output.byteLength);
  }
});
