import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

const root = "play/assets/dobuita/ybhn";
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/ybhn/manifest.json",
  "utf8",
));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("YBHN retains its exact native activity, motion, and audio dependencies", () => {
  assert.equal(manifest.nativeBinding.resourceName, "YBHN");
  assert.deepEqual(
    manifest.activities.map(value => [
      value.slot,
      value.primaryPointer,
      value.secondaryPointer,
    ]),
    [[27, 0xaf8ae, 0xaf8bb]],
  );
  for (const output of manifest.outputs) {
    const bytes = fs.readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength);
    assert.equal(sha256(bytes), output.sha256);
  }
  assert.equal(audio.voices.length, 26);
  assert.equal(audio.sounds.length, 9);
  assert.deepEqual(
    [...new Set(audio.voices.map(value => value.speakerId))].sort(),
    ["AKIR", "HRSK"],
  );
  assert.ok(audio.voices.every(value => value.displayText && value.lipSync));
});

test("YBHN resolves both authored performances without fallback motion", () => {
  const motionBytes = fs.readFileSync(`${root}/M_01YOB.MOTN`);
  const motion = MotnLoader.parse(motionBytes);
  const activity = manifest.activities[0];
  const authBytes = fs.readFileSync(`${root}/${activity.archiveMember}`);
  const sequence = parseAuthSequence(authBytes);
  const movement = parseAuthMovement(authBytes);
  const camera = parseAuthCamera(authBytes);
  const resolved = resolveAuthMotions(sequence, new Map([[16, motion]]));

  assert.deepEqual(sequence.actors, ["AKIR", "HRSK"]);
  assert.equal(sequence.durationFrames, 2130);
  assert.equal(movement.actors.length, 2);
  assert.equal(camera.cameras.length, 1);
  assert.equal(resolved.length, 2);
  assert.ok(resolved.every(value => value.motionValid));
  assert.deepEqual(
    resolved.map(value => value.motionName),
    [
      "SIN_NOZ_AT1_MATIBUSE_YOBIKOUKAERI_0100",
      "AKI_AT1_MATIBUSE_YOBIKOUKAERI_0100",
    ],
  );
});
