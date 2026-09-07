import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const activity = JSON.parse(fs.readFileSync(
  "play/assets/sakuragaoka/evsn/manifest.json",
));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/evsn/manifest.json",
));

test("EVSN packages the exact four native rescue activities", () => {
  assert.deepEqual(activity.activities.map(value => value.slot), [0, 1, 2, 3]);
  assert.deepEqual(
    activity.activities.map(value => value.durationFrames),
    [230, 1671, 1080, 220],
  );
  assert.equal(activity.motionBanks[0].bank, 16);
  assert.equal(activity.activities.flatMap(value => value.motions).length, 16);
});

test("EVSN separates Kyosuke from his attached airplane", () => {
  assert.equal(activity.packageActors.KKEN.modelCode, "NZG_L");
  assert.equal(activity.packageActors.KKEN.assetPath, "play/assets/sakuragaoka/evsn/NZG_L.CHRM");
  assert.equal(activity.sceneObjects.AIRO.model, "OMHT201");
  assert.equal(activity.sceneObjects.AIRO.nativeBinding.parentActorTag, "KKEN");
  assert.equal(activity.sceneObjects.AIRO.nativeBinding.controlId, 12);
  assert.equal(
    activity.sceneObjects.AIRO.lifecycle.kind,
    "native-composite-owner",
  );
});

test("EVSN preserves retail voice omissions explicitly", () => {
  assert.equal(audio.voices.length, 34);
  assert.equal(audio.sounds.length, 15);
  assert.deepEqual(
    audio.voices.filter(value => value.unavailable).map(value => value.voiceId),
    ["01NVEA007", "01NVED007", "01NVED008"],
  );
});
