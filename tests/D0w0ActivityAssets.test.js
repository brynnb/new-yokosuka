import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(
  "play/assets/dobuita/d0w0/manifest.json",
));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/d0w0/manifest.json",
));
const lifecycle = JSON.parse(fs.readFileSync(
  "tools/evidence/d0w0-native-lifecycle.json",
));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("D0W0 packages all twelve exact owner-selected activities", () => {
  assert.equal(manifest.nativeBinding.resourceName, "D0W0");
  assert.deepEqual(manifest.activities.map(activity => activity.slot), [
    4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  assert.deepEqual(lifecycle.owner.slots, manifest.activities.map(
    activity => activity.slot,
  ));
  assert.equal(audio.schema, "new-yokosuka-aseq-audio-pack-v2");
  assert.equal(audio.voices.length, 71);
  assert.equal(audio.sounds.length, 20);
});

test("D0W0 resolves every authored motion from its one exact activity bank", () => {
  assert.deepEqual(manifest.motionBanks.map(bank => bank.bank), [16]);
  for (const activity of manifest.activities) {
    assert.ok(activity.motions.length > 0);
    assert.ok(activity.motions.every(motion => (
      motion.motionBank === 16 && typeof motion.motionName === "string"
    )));
  }
});

test("D0W0's COP_ scene object is the exact archive-local cup", () => {
  const cup = manifest.sceneObjects.COP_;
  assert.equal(cup.lifecycle.kind, "auth-scoped");
  assert.equal(cup.browserFilename, "S1_D000_CUPK300G.MT5");
  const bytes = fs.readFileSync(cup.assetPath);
  assert.equal(sha256(bytes), cup.nativeBinding.archiveMemberSha256);
});
