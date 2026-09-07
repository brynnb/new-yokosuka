import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { parseAuthSequence } from "../src/AuthSequence.js";
import {
  enrichNativeAseqActivityFrames,
  validateNativeAseqActivityMetadata,
} from "../play/events/NativeAseqActivityCommands.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/assets/dobuita/toki/manifest.json",
  "utf8",
));

test("TOKI retains the exact TEGS owner attachment and hinge timeline", () => {
  const letter = manifest.attachedObjects.TEGS;
  assert.deepEqual(letter.attachments.map(value => [
    value.frame,
    value.action || "attach",
    value.parentActorTag || null,
  ]), [
    [1906, "attach", "AKIR"],
    [2046, "attach", "ASDA"],
    [3300, "attach", "ASDA"],
    [4215, "attach", "ASDA"],
    [5051, "attach", "AKIR"],
    [5174, "detach", null],
  ]);
  assert.deepEqual(letter.nodeTransforms.map(value => ({
    ...(value.frame === undefined
      ? { firstFrame: value.firstFrame, lastFrame: value.lastFrame }
      : { frame: value.frame }),
    nodeKey: value.nodeKey,
    mode: value.mode,
    rotationRaw: value.rotationRaw,
  })), [
    { frame: 0, nodeKey: 152, mode: "set", rotationRaw: [0, 0, 0] },
    { frame: 0, nodeKey: 153, mode: "set", rotationRaw: [0, 0, 0] },
    {
      firstFrame: 1972, lastFrame: 1991, nodeKey: 152,
      mode: "add", rotationRaw: [0, 0, 1456],
    },
    {
      firstFrame: 2000, lastFrame: 2020, nodeKey: 153,
      mode: "add", rotationRaw: [0, 0, -1456],
    },
    { frame: 5051, nodeKey: 152, mode: "set", rotationRaw: [0, 0, 0] },
    { frame: 5051, nodeKey: 153, mode: "set", rotationRaw: [0, 0, 0] },
  ]);
});

test("TOKI compiles its native face, hand, and look-point callback cues", () => {
  const activity = manifest.activities[0];
  assert.deepEqual(
    activity.nativeFaceClipCues.map(value => value.frame),
    [1707, 1875, 3141, 3382, 4125, 4215],
  );
  assert.deepEqual(activity.nativeHandPoseCues.map(value => [
    value.frame,
    value.actorTag,
    value.side,
    value.poseTableOffset,
    value.durationNativeTicks,
  ]), [
    [2046, "ASDA", "right", "0x3310", 8],
    [2046, "ASDA", "left", "0x33f4", 8],
    [4620, "ASDA", "right", "0x3310", 1],
    [4620, "ASDA", "left", "0x33f4", 1],
  ]);
  assert.deepEqual(Object.keys(manifest.nativeHandPoseTables), ["0x3310", "0x33f4"]);
  assert.equal(manifest.handAssets.ASDA.rig.vertexCount, 301);
  assert.equal(activity.nativeActorLookPointCues.length, 210);
  assert.deepEqual(
    activity.nativeActorLookPointCues.slice(0, 3).map(value => value.frame),
    [131, 132, 133],
  );
  assert.equal(activity.nativeActorLookPointCues[208].frame, 339);
  assert.deepEqual(activity.nativeActorLookPointCues[209], {
    activitySlot: 0,
    frame: 386,
    actorTag: "AKIR",
    selector: -98312,
    mode: 0,
    target: null,
    callFileOffset: "0xbee",
  });
});

test("TOKI callback resources retain exact hashes", () => {
  for (const filename of ["KAS_HM.BIN", "KAS_TL.MT5", "KAS_TR.MT5"]) {
    const output = manifest.outputs.find(value => value.path.endsWith(`/${filename}`));
    assert.ok(output, filename);
    assert.equal(fs.statSync(output.path).size, output.byteLength);
  }
});

test("TOKI look-point metadata compiles into ordinary AUTH activity commands", () => {
  const record = manifest.activities[0];
  const sequence = parseAuthSequence(fs.readFileSync(
    "play/assets/dobuita/toki/SEQDATA2.AUTH",
  ));
  const frames = enrichNativeAseqActivityFrames({
    record,
    sequence,
    frames: sequence.frames,
    metadata: validateNativeAseqActivityMetadata(manifest),
  });
  const command = frames.find(value => value.frame === 131).commands.find(
    value => value.name === "actor-look-point",
  );
  assert.equal(command.actorTag, "AKIR");
  assert.equal(command.target.actorTag, "ASDA");
  assert.equal(command.target.selector, 5);
});
