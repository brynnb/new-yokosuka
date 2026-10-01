import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import manifest from "../play/assets/hazuki/jhw0/manifest.json" with { type: "json" };
import evidence from "../tools/evidence/jhw0-native-callback-ir.json" with { type: "json" };
import { extractNativeAseqCallbackHandPresentation } from "../tools/lib/NativeAseqCallbackPresentation.mjs";

test("all eight training variants preserve their own callback's hand timeline", () => {
  const bytes = readFileSync("extracted_files/data/SCENE/01/JHD0/MAPINFO.BIN");
  const callbacks = ["0x43d40", "0x44000", "0x443e4", "0x44504", "0x4482c", "0x44d28", "0x446d4", "0x44a50"];
  assert.equal(manifest.activities.length, 8);
  for (const [index, activity] of manifest.activities.entries()) {
    const nativeFunction = evidence.supportingFunctions.find(fn => fn.id === callbacks[index]);
    const actual = extractNativeAseqCallbackHandPresentation({
      bytes, callbackFunction: Number.parseInt(nativeFunction.id, 16), nativeFunction, activitySlot: activity.slot,
    });
    const initial = activity.nativeHandPoseCues.slice(0, 4);
    assert.deepEqual(initial.map(cue => [cue.actorTag, cue.side, cue.frame, cue.poseTableOffset]), [
      ["AKIR", "right", 0, "0x5cd20"], ["AKIR", "left", 0, "0x5cd20"],
      ["FUKU", "right", 0, "0x5cd20"], ["FUKU", "left", 0, "0x5cd20"],
    ]);
    assert.deepEqual(activity.nativeHandPoseCues.slice(4), actual.nativeHandPoseCues);
    assert.ok(actual.nativeHandPoseCues.some(cue => cue.frame > 0));
    for (const cue of activity.nativeHandPoseCues) {
      assert.ok(cue.frame < activity.durationFrames);
      assert.ok(cue.durationNativeTicks > 0);
      assert.equal(manifest.nativeHandPoseTables[cue.poseTableOffset].vectors.length, 19);
    }
  }
});

test("training callback initialization can span multiple straight-line blocks", () => {
  const first = manifest.activities[0].nativeHandPoseCues.slice(4);
  assert.deepEqual(first.slice(0, 2).map(cue => [cue.frame, cue.durationNativeTicks]), [[0, 1], [0, 8]]);
  assert.deepEqual(first.slice(2).map(cue => cue.frame), [170, 170, 220, 300, 450, 450]);
});
