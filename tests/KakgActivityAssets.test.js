import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";

const root = "play/assets/hazuki/kakg";
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
const fukuAudio = JSON.parse(fs.readFileSync(
  "public/audio/world/kakg-fuku/manifest.json",
  "utf8",
));
const ineAudio = JSON.parse(fs.readFileSync(
  "public/audio/world/kakg-ine/manifest.json",
  "utf8",
));
const lifecycle = JSON.parse(fs.readFileSync(
  "tools/evidence/kakg-native-lifecycle.json",
  "utf8",
));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("KAKG retains only its exact standalone conversational activities", () => {
  assert.equal(manifest.nativeBinding.resourceName, "KAKG");
  assert.equal(lifecycle.owner.playerFacingEntryFunction, "0x3cfa0");
  assert.deepEqual(
    manifest.activities.map(value => [
      value.slot,
      value.primaryPointer,
      value.secondaryPointer,
    ]),
    [
      [2, 0x5f167, 0x5f16c],
      [3, 0x5f16d, 0x5f172],
    ],
  );
  for (const output of manifest.outputs) {
    const bytes = fs.readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength);
    assert.equal(sha256(bytes), output.sha256);
  }
  assert.equal(fukuAudio.voices.length, 22);
  assert.equal(ineAudio.voices.length, 9);
  assert.deepEqual(
    [...new Set(fukuAudio.voices.map(value => value.speakerId))].sort(),
    ["AKIR", "FUKU"],
  );
  assert.deepEqual(
    [...new Set(ineAudio.voices.map(value => value.speakerId))].sort(),
    ["AKIR", "INE_"],
  );
  assert.ok([...fukuAudio.voices, ...ineAudio.voices].every(value => (
    typeof value.displayText === "string" && value.lipSync
  )));
});

test("KAKG resolves every authored performance without fallback motion", () => {
  const motions = new Map([
    [32, MotnLoader.parse(fs.readFileSync(`${root}/M_01KAK.MOTN`))],
    [48, MotnLoader.parse(fs.readFileSync(`${root}/M_01CRY.MOTN`))],
  ]);
  for (const activity of manifest.activities) {
    const bytes = fs.readFileSync(`${root}/${activity.archiveMember}`);
    const sequence = parseAuthSequence(bytes);
    const movement = parseAuthMovement(bytes);
    const camera = parseAuthCamera(bytes);
    const resolved = resolveAuthMotions(sequence, motions);
    assert.equal(movement.actors.length, sequence.actors.length);
    assert.equal(camera.cameras.length, 1);
    assert.ok(resolved.length > 0);
    assert.ok(resolved.every(value => value.motionValid));
  }
});
