import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractNativeAseqCallbackHandPresentation, extractNativeAseqHandInitialization } from "../tools/lib/NativeAseqCallbackPresentation.mjs";
import manifest from "../play/assets/dobuita/d0w0/manifest.json" with { type: "json" };
import evidence from "../tools/evidence/d0w0-native-callback-ir.json" with { type: "json" };

test("all twelve Yamagishi variants retain callback/helper hand poses", () => {
  assert.equal(manifest.activities.length, 12);
  assert.equal(Object.keys(manifest.nativeHandPoseTables).length, 4);
  assert.equal(manifest.handAssets.YAMA.rig.vertexCount, 306);
  for (const activity of manifest.activities) {
    assert.ok(activity.nativeHandPoseCues.length >= 2);
    for (const cue of activity.nativeHandPoseCues) {
      assert.ok(cue.frame >= 0 && cue.frame < activity.durationFrames);
      assert.equal(manifest.nativeHandPoseTables[cue.poseTableOffset].vectors.length, 19);
    }
  }
  const seven = manifest.activities.find(activity => activity.slot === 10);
  assert.deepEqual(seven.nativeHandPoseCues.map(cue => [cue.frame, cue.side, cue.poseTableOffset]), [
    [0, "right", "0xa2c6c"], [0, "left", "0xa2c6c"],
    [0, "left", "0xad758"], [80, "left", "0xa2c6c"],
  ]);
  assert.deepEqual(seven.nativeBodyHandPoseCues.slice(0, 2).map(cue => [cue.frame, cue.actorTag, cue.targetIndex]),
    [[0, "AKIR", 8], [0, "YAMA", 8]]);
  assert.equal(seven.nativeBodyHandPoseCues[2].frame, 230);
  assert.equal(seven.nativeBodyHandPoseCues[2].releaseDetailed, true);
  const first = manifest.activities[0];
  assert.deepEqual(first.nativeHandComponentCues.map(cue => [cue.frame, cue.side, cue.rotationRaw]),
    [[0, "left", [-8920, 4004, -5643]], [920, "left", [0, 0, 0]]]);
  assert.deepEqual(first.nativeHandPoseCues.slice(0, 3).map(cue => cue.poseTableOffset),
    ["0xa2c6c", "0xa2c6c", "0xad590"]);
  assert.equal(manifest.attachedObjects.COP_.sceneObject, true, "borrow AUTH cup, never duplicate it");
  assert.deepEqual(manifest.attachedObjects.COP_.attachments.map(cue => [cue.frame, cue.action]),
    [[0, "attach"], [1606, "detach"]]);
  assert.equal(manifest.attachedObjects.COP_.attachments[0].controlId, 18);
});

test("timed helper extraction is deterministic and fails on unsupported helper control flow", () => {
  const bytes = readFileSync("extracted_files/data/SCENE/01/D000/MAPINFO.BIN");
  const nativeFunction = evidence.supportingFunctions.find(fn => fn.id === "0x59704");
  const options = { bytes, nativeFunction, callbackFunction: 0x59704,
    activitySlot: 10, functions: evidence.supportingFunctions };
  const extracted = extractNativeAseqCallbackHandPresentation(options);
  const activity = manifest.activities.find(activity => activity.slot === 10);
  assert.deepEqual(extracted.nativeHandPoseCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + 2 })), activity.nativeHandPoseCues);
  assert.deepEqual(extracted.nativeBodyHandPoseCues.map(cue => ({ ...cue, sourceOrder: cue.sourceOrder + 2 })), activity.nativeBodyHandPoseCues.slice(2));
  const functions = structuredClone(evidence.supportingFunctions);
  functions.find(fn => fn.id === "0x59f8c").blocks[0].terminator = { kind: "unknown" };
  assert.throws(() => extractNativeAseqCallbackHandPresentation({ ...options, functions }), /unsupported control flow/);
  const setup = { ...options, nativeFunction: evidence.supportingFunctions.find(fn => fn.id === "0x59de8") };
  assert.equal(extractNativeAseqHandInitialization(setup).nativeBodyHandPoseCues.length, 2);
  const conditionalFunctions = structuredClone(evidence.supportingFunctions);
  conditionalFunctions.find(fn => fn.id === "0x9fb0").blocks.find(block => block.id === "0x9fe0").successors = [];
  assert.throws(() => extractNativeAseqHandInitialization({ ...setup, functions: conditionalFunctions }), /conditional hand effects/);
});

test("wrist extraction retains exact constants but reports dynamic lanes without partial poses", () => {
  const bytes = readFileSync("extracted_files/data/SCENE/01/D000/MAPINFO.BIN");
  const nativeFunction = structuredClone(evidence.supportingFunctions.find(fn => fn.id === "0x58988"));
  const options = { bytes, nativeFunction, callbackFunction: 0x58988,
    activitySlot: 4, functions: evidence.supportingFunctions };
  const original = extractNativeAseqCallbackHandPresentation(options);
  assert.deepEqual(original.nativeHandComponentCues.map(cue => [cue.frame, cue.rotationRaw]),
    [[0, [-8920, 4004, -5643]], [920, [0, 0, 0]]]);
  const block = nativeFunction.blocks.find(block => block.actions.some(action => action.callFileOffset === "0x589f8"));
  const index = block.actions.findIndex(action => action.callFileOffset === "0x589f8");
  block.actions[index].arguments[3] = { kind: "frame-address", offset: 0 };
  block.actions.splice(index, 0, { kind: "frameFieldExpressionWrite", width: 4,
    offset: 0, callFileOffset: "0x589f6" });
  const dynamic = extractNativeAseqCallbackHandPresentation(options);
  assert.deepEqual(dynamic.nativeHandComponentCues, []);
  assert.equal(dynamic.nativeHandComponentLimitations.length, 1);
  assert.match(dynamic.nativeHandComponentLimitations[0].reason, /dynamic native frame-vector writes/);
  // Omission renumbers mixed command ordinals, not finger poses or their
  // relative execution order. Compare the ordered, timed pose payloads.
  const poses = cues => cues.map(({ sourceOrder, ...pose }) => pose);
  assert.deepEqual(poses(dynamic.nativeHandPoseCues), poses(original.nativeHandPoseCues));
});
