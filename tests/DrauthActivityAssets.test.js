import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../src/AuthSequence.js";
import { parseAuthStrings } from "../src/AuthStrings.js";
import { MotnLoader } from "../src/MotnLoader.js";

const root = "play/assets/dobuita/drauth";
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("bundled DRAUTH outputs retain their exact native member hashes", () => {
  assert.equal(manifest.schema, "new-yokosuka-aseq-activity-pack-v1");
  assert.equal(
    manifest.nativeBinding.evidence,
    "tools/evidence/operation-0050-evidence.json",
  );
  assert.deepEqual(
    manifest.activities.map(activity => [
      activity.slot,
      activity.primaryPointer,
      activity.secondaryPointer,
    ]),
    [[0, 0xb138a, 0xb1391], [1, 0xb1392, 0xb1399]],
  );
  for (const output of manifest.outputs) {
    const bytes = fs.readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength);
    assert.equal(sha256(bytes), output.sha256);
  }
});

test("bundled DRAUTH activities resolve every authored motion exactly", () => {
  const motionBytes = fs.readFileSync(`${root}/M_01REV.MOTN`);
  const motionPackage = MotnLoader.parse(motionBytes, {
    sequenceIndices: Array.from({ length: 9 }, (_, index) => index),
  });
  assert.equal(motionPackage.sequences.length, 9);
  assert.ok(motionPackage.sequences.every(sequence => sequence.valid));
  assert.ok(
    motionPackage.sequences.every(sequence => sequence.valueData.complete),
  );
  assert.deepEqual(
    motionPackage.sequences[4].valueData.unusedValueHalfwords,
    [0],
  );

  for (const expected of manifest.activities) {
    const bytes = fs.readFileSync(`${root}/${expected.archiveMember}`);
    const sequence = parseAuthSequence(bytes);
    const movement = parseAuthMovement(bytes);
    const camera = parseAuthCamera(bytes);
    const strings = parseAuthStrings(bytes);
    const resolved = resolveAuthMotions(sequence, motionPackage);
    assert.equal(sequence.durationFrames, expected.durationFrames);
    assert.equal(sequence.frames.length, expected.frameCount);
    assert.deepEqual(sequence.actors, expected.actors);
    assert.equal(movement.actors.length, expected.actors.length);
    assert.equal(camera.cameras.length, 1);
    assert.ok(strings.strings.length > 0);
    for (const { commands } of sequence.frames) {
      for (const command of commands) {
        if (Number.isInteger(command.stringIndex)) {
          assert.ok(command.stringIndex < strings.strings.length);
        }
      }
    }
    assert.equal(resolved.length, expected.motions.length);
    assert.ok(resolved.every(event => event.motionValid));
    assert.deepEqual(
      resolved.map(event => event.motionName),
      expected.motions.map(event => event.motionName),
    );
  }
});
