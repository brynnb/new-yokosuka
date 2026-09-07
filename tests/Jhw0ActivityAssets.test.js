import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

const root = "play/assets/hazuki/jhw0";
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
const audio = JSON.parse(fs.readFileSync("public/audio/world/jhw0/manifest.json", "utf8"));
const lifecycle = JSON.parse(fs.readFileSync(
  "tools/evidence/jhw0-native-lifecycle.json",
  "utf8",
));
const music = JSON.parse(fs.readFileSync("public/music/manifest.json", "utf8"));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("JHW0 retains all exact owner-installed activities and dependencies", () => {
  assert.equal(manifest.nativeBinding.resourceName, "JHW0");
  assert.equal(lifecycle.owner.playerFacingEntryFunction, "0x464bc");
  assert.equal(lifecycle.owner.activityOwnerFunction, "0x45308");
  assert.deepEqual(
    manifest.activities.map(value => [
      value.slot,
      value.primaryPointer,
      value.secondaryPointer,
    ]),
    [
      [9, 0x5f5fd, 0x5f60a], [10, 0x5f60f, 0x5f61c],
      [11, 0x5f621, 0x5f62e], [12, 0x5f633, 0x5f640],
      [13, 0x5f645, 0x5f652], [14, 0x5f657, 0x5f664],
      [15, 0x5f669, 0x5f676], [16, 0x5f67b, 0x5f688],
    ],
  );
  for (const output of manifest.outputs) {
    const bytes = fs.readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength);
    assert.equal(sha256(bytes), output.sha256);
  }
  assert.equal(audio.voices.length, 41);
  assert.equal(audio.sounds.length, 24);
  assert.deepEqual(
    [...new Set(audio.voices.map(value => value.speakerId))].sort(),
    ["AKIR", "FUKU"],
  );
  assert.ok(audio.voices.every(value => (
    typeof value.displayText === "string" && value.lipSync
  )));
  assert.equal(music.tracks.bgm099.source.sha256, lifecycle.resourceCluster.music === "BGM099.SND"
    ? "8f97e7415c729e53767861d6ab590b41652afad3f2fd13a2d347b7af00714f08"
    : null);
});

test("JHW0 resolves every authored performance without fallback motion", () => {
  const motion = MotnLoader.parse(fs.readFileSync(`${root}/M_01FUK.MOTN`));
  for (const activity of manifest.activities) {
    const bytes = fs.readFileSync(`${root}/${activity.archiveMember}`);
    const sequence = parseAuthSequence(bytes);
    const movement = parseAuthMovement(bytes);
    const camera = parseAuthCamera(bytes);
    const resolved = resolveAuthMotions(sequence, new Map([[16, motion]]));
    assert.deepEqual(sequence.actors, ["AKIR", "FUKU"]);
    assert.equal(movement.actors.length, 2);
    assert.equal(camera.cameras.length, 1);
    assert.ok(resolved.length > 0);
    assert.ok(resolved.every(value => value.motionValid));
  }
});
