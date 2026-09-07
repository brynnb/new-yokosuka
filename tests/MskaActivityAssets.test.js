import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

const root = "play/assets/hazuki/mska";
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
const audio = JSON.parse(fs.readFileSync("public/audio/world/mska/manifest.json", "utf8"));
const lifecycle = JSON.parse(fs.readFileSync(
  "tools/evidence/mska-native-lifecycle.json",
  "utf8",
));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("MSKA retains its exact activity and complete native dependencies", () => {
  assert.equal(manifest.nativeBinding.resourceName, "MSKA");
  assert.equal(lifecycle.owner.playerFacingEntryFunction, "0x3aec8");
  assert.deepEqual(
    manifest.activities.map(value => [
      value.slot,
      value.primaryPointer,
      value.secondaryPointer,
    ]),
    [[0, 0x5ee04, 0x5ee09]],
  );
  for (const output of manifest.outputs) {
    const bytes = fs.readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength);
    assert.equal(sha256(bytes), output.sha256);
  }
  assert.equal(audio.voices.length, 5);
  assert.equal(audio.sounds.length, 7);
  assert.deepEqual(
    [...new Set(audio.voices.map(value => value.speakerId))].sort(),
    ["AKIR", "FUKU"],
  );
  assert.ok(audio.voices.every(value => (
    typeof value.displayText === "string" && value.lipSync
  )));
});

test("MSKA resolves every authored performance without fallback motion", () => {
  const motion = MotnLoader.parse(fs.readFileSync(`${root}/M_0126.MOTN`));
  const activity = manifest.activities[0];
  const bytes = fs.readFileSync(`${root}/${activity.archiveMember}`);
  const sequence = parseAuthSequence(bytes);
  const movement = parseAuthMovement(bytes);
  const camera = parseAuthCamera(bytes);
  const resolved = resolveAuthMotions(sequence, new Map([[20, motion]]));
  assert.deepEqual(sequence.actors, ["AKIR", "FUKU"]);
  assert.equal(movement.actors.length, 2);
  assert.equal(camera.cameras.length, 1);
  assert.equal(resolved.length, 4);
  assert.ok(resolved.every(value => value.motionValid));
});
