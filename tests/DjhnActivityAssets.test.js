import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthSequence } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/assets/dobuita/djhn/manifest.json",
));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/djhn/manifest.json",
));

function hash(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

test("DJHN packages all seven exact native activities and their audio", () => {
  assert.equal(manifest.nativeBinding.resourceName, "DJHN");
  assert.equal(manifest.activities.length, 7);
  assert.deepEqual(manifest.activities.map(value => value.slot), [20, 21, 22, 23, 24, 25, 26]);
  assert.equal(audio.voices.length, 47);
  assert.equal(audio.voices.filter(value => value.unavailable === true).length, 1);
  assert.equal(audio.sounds.length, 22);
  for (const output of manifest.outputs) {
    assert.equal(fs.statSync(output.path).size, output.byteLength);
    assert.equal(hash(output.path), output.sha256);
  }
});

test("DJHN resolves every authored motion from its exact native bank", () => {
  const motion = MotnLoader.parse(fs.readFileSync(
    "play/assets/dobuita/djhn/M_01JUCE.MOTN",
  ));
  for (const activity of manifest.activities) {
    const sequence = parseAuthSequence(fs.readFileSync(
      `play/assets/dobuita/djhn/${activity.archiveMember}`,
    ));
    assert.deepEqual(sequence.actors, ["AKIR", "YKHI"]);
    for (const cue of activity.motions) {
      assert.equal(motion.sequences[cue.sequenceIndex].name, cue.motionName);
      assert.equal(motion.sequences[cue.sequenceIndex].valid, true);
    }
  }
});

test("DJHN CAN1 uses exact activity-scoped native handoff data", () => {
  const can = manifest.attachedObjects.CAN1;
  assert.equal(can.assetPath, "play/assets/dobuita/djhn/COKS520G.CHRM");
  assert.equal(hash(can.assetPath), "964fa92a9e7345a68e3208d51adc9b1aa11bc162410057aab8e9bf009af21fbc");
  assert.deepEqual(
    can.attachments.map(value => [value.activitySlot, value.frame, value.action || "attach"]),
    [
      [22, 160, "attach"], [22, 255, "attach"], [22, 1810, "detach"],
      [23, 115, "attach"], [23, 220, "attach"], [23, 1107, "detach"],
    ],
  );
});
