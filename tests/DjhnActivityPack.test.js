import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { extractNativeAseqCallbackObjectPresentation } from "../tools/lib/NativeAseqCallbackObjectPresentation.mjs";
import { sha256 } from "../tools/lib/NativeAseqActivityPack.mjs";

const manifest = JSON.parse(readFileSync("play/assets/dobuita/djhn/manifest.json"));

test("DJHN retains the shared room letter and both authored attachment lifetimes", () => {
  const letter = manifest.attachedObjects.MALS;
  assert.equal(sha256(readFileSync(letter.assetPath)),
    "0d5182cde209ca1c188e4a7af48f65e79d0d5713469bd2c951a0af69a624dd39");
  assert.deepEqual(letter.attachments.map(cue => [
    cue.activityId, cue.frame, cue.action, cue.parentActorTag ?? null,
  ]), [
    ["DJHN/SEQDATA3.AUTH", 580, "attach", "AKIR"],
    ["DJHN/SEQDATA3.AUTH", 700, "attach", "AKIR"],
    ["DJHN/SEQDATA3.AUTH", 1160, "detach", null],
    ["DJHN/SEQDATA5.AUTH", 239, "attach", "AKIR"],
    ["DJHN/SEQDATA5.AUTH", 678, "detach", null],
  ]);
  assert.equal(letter.nodeTransforms.length, 12);
  for (const cue of letter.nodeTransforms) {
    assert.ok([152, 153].includes(cue.nodeKey));
    assert.ok(cue.source.evidence.endsWith("native-callback-ir.json"));
  }
  assert.equal(manifest.activities.find(a => a.slot === 24).nativeFaceClipCues.length, 8);
});

test("callback object selection preserves exact prop data without interpreting other owners", () => {
  const ir = JSON.parse(readFileSync("tools/evidence/djhn-seqdata3-native-callback-ir.json"));
  const bytes = readFileSync("extracted_files/data/SCENE/01/D000/MAPINFO.BIN");
  assert.equal(sha256(bytes), ir.source.mapinfoSha256);
  const args = {
    bytes, callbackFunction: 0x891b8, nativeFunction: ir.function,
    durationFrames: 2260, activitySlot: 22,
  };
  const full = extractNativeAseqCallbackObjectPresentation(args);
  const look = full.nativeActorLookPointCues;
  assert.equal(look.length, 307);
  assert.deepEqual(look[0].target, { kind: "object-base", objectTag: "MALS", offset: [0, 0, 0] });
  assert.deepEqual([look[0].frame, look.at(-2).frame, look.at(-1).frame], [675, 980, 981]);
  assert.equal(look.at(-1).target, null);
  assert.deepEqual(manifest.activities.find(a => a.slot === 22).nativeActorLookPointCues, look);
  const selected = extractNativeAseqCallbackObjectPresentation({ ...args, objectTags: ["MALS"] });
  assert.deepEqual(selected.attachedObjectCues.map(cue => cue.frame), [580, 700, 700, 1160]);
  assert.deepEqual(selected.attachedObjectCues[0].rotationRaw, [29527, 43165, 51901]);
  assert.equal(selected.nodeTransformCues.length, 6);
  assert.deepEqual(selected.nativeActorLookPointCues, []);
});
