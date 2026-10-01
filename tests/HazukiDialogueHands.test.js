import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import evidence from "../tools/evidence/hazuki-dialogue-native-callback-ir.json" with { type: "json" };

test("each Hazuki dialogue preview preserves its own owner's hand initialization", () => {
  for (const [resource, slot, ownerId, setupId, actors] of [
    ["mska", 0, "0x2309c", "0x26aa4", ["AKIR", "FUKU"]],
    ["tgma", 0, "0x23210", "0x26aa4", ["AKIR", "FUKU"]],
    ["kakg", 2, "0x25b80", "0x26aa4", ["AKIR", "FUKU"]],
    ["kakg", 3, "0x26440", "0x26be0", ["AKIR", "INE_"]],
  ]) {
    const manifest = JSON.parse(readFileSync(`play/assets/hazuki/${resource}/manifest.json`));
    const activity = manifest.activities.find(activity => activity.slot === slot);
    const owner = evidence.supportingFunctions.find(fn => fn.id === ownerId);
    const actions = owner.blocks.flatMap(block => block.actions);
    const start = actions.findIndex(action => action.operationHex === "0x0050" && action.arguments[0].value === slot);
    assert.ok(start > 0);
    assert.ok(actions.slice(0, start).some(action => action.kind === "directCall" && action.targetFileOffset === setupId));
    assert.deepEqual(activity.nativeHandPoseCues.slice(0, 4).map(cue =>
      [cue.frame, cue.actorTag, cue.side, cue.poseTableOffset]), actors.flatMap(actor =>
      [[0, actor, "left", "0x5ca74"], [0, actor, "right", "0x5ca74"]]));
    assert.equal(manifest.nativeHandPoseTables["0x5ca74"].vectors.length, 19);
  }
});

test("KAKG retains its late immediate pose change, without applying it to Ine's scene", () => {
  const manifest = JSON.parse(readFileSync("play/assets/hazuki/kakg/manifest.json"));
  assert.deepEqual(manifest.activities[0].nativeHandPoseCues.slice(4).map(cue =>
    [cue.frame, cue.actorTag, cue.side, cue.poseTableOffset, cue.durationNativeTicks]), [
    [1321, "AKIR", "right", "0x5d278", 1], [1321, "AKIR", "left", "0x5d278", 1],
    [1321, "FUKU", "right", "0x5d278", 1], [1321, "FUKU", "left", "0x5d278", 1],
  ]);
  assert.equal(manifest.activities[1].nativeHandPoseCues.length, 4);
});
