import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import manifest from "../play/assets/hazuki/houo/manifest.json" with { type: "json" };
import evidence from "../tools/evidence/houo-native-callback-ir.json" with { type: "json" };
import {
  extractNativeAseqCallbackPresentation,
  extractNativeAseqHandInitialization,
} from "../tools/lib/NativeAseqCallbackPresentation.mjs";

test("HOUO preserves both actors' owner poses before the immediate mirror grip", () => {
  const bytes = readFileSync("extracted_files/data/SCENE/01/JHD0/MAPINFO.BIN");
  const owner = extractNativeAseqHandInitialization({
    bytes, nativeFunction: evidence.supportingFunctions.find(fn => fn.id === "0x26b4c"),
    functions: evidence.supportingFunctions, activitySlot: 9,
  });
  const callback = extractNativeAseqCallbackPresentation({
    bytes, callbackFunction: 0x24158, nativeFunction: evidence.function,
    durationFrames: 1810, activitySlot: 9,
  });
  assert.equal(callback.nativeDetailedHandDefaults.length, 0);
  assert.deepEqual(callback.nativeHandPoseCues.map(cue => [cue.actorTag, cue.side, cue.frame, cue.durationNativeTicks]),
    [["AKIR", "right", 0, 1]]);
  assert.deepEqual(owner.nativeHandPoseCues.map(cue => [cue.actorTag, cue.side]),
    [["AKIR", "left"], ["AKIR", "right"], ["FUKU", "left"], ["FUKU", "right"]]);
  assert.deepEqual(manifest.activities[0].nativeHandPoseCues,
    [...owner.nativeHandPoseCues, ...callback.nativeHandPoseCues]);
  assert.deepEqual(manifest.nativeHandPoseTables,
    { ...owner.nativeHandPoseTables, ...callback.nativeHandPoseTables });
  assert.notDeepEqual(manifest.nativeHandPoseTables["0x5ca74"].vectors,
    manifest.nativeHandPoseTables["0x5d35c"].vectors);
  assert.equal(manifest.activities[0].nativeDetailedHandDefaults, undefined);
});

test("HAND initialization refuses conditional setup instead of inventing a default", () => {
  const fn = structuredClone(evidence.supportingFunctions.find(fn => fn.id === "0x26b4c"));
  // A resolved branch which skips setup must still fail; reconverging
  // visibility-only branches are now supported by the shared extractor.
  fn.blocks[0].successors.push("skip-hands");
  fn.blocks.push({ id: "skip-hands", actions: [], terminator: null, successors: [] });
  assert.throws(() => extractNativeAseqHandInitialization({
    bytes: readFileSync("extracted_files/data/SCENE/01/JHD0/MAPINFO.BIN"), nativeFunction: fn,
    functions: evidence.supportingFunctions, activitySlot: 9,
  }), /conditional hand effects/);
});
