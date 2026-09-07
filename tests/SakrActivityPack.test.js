import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const activity = JSON.parse(fs.readFileSync(
  "play/assets/yd01/sakr/manifest.json",
));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/sakr/manifest.json",
));

test("SAKR package reuses canonical world and actor bodies", () => {
  assert.equal(activity.nativeBinding.resourceName, "SAKR");
  assert.equal(activity.activities.length, 1);
  assert.deepEqual(activity.activities[0].actors, ["IWAO", "JAKR"]);
  assert.equal(activity.activities[0].durationFrames, 1559);
  assert.deepEqual(activity.activities[0].commandCounts, {
    camera: 1,
    move: 2,
    motion: 13,
    voice: 12,
    sound: 6,
  });
  assert.equal(
    activity.packageActors.IWAO.browserFilename,
    "S1_YD01_IWA_M.MT5",
  );
  assert.equal(
    activity.packageActors.JAKR.browserFilename,
    "S1_YD01_JKB_M.MT5",
  );
  assert.equal(activity.packageActors.IWAO.assetPath, undefined);
  assert.equal(activity.packageActors.JAKR.assetPath, undefined);
  assert.equal(
    activity.outputs.some(output => /(?:MAP|IWA_M|JKB_M)\.(?:MAPM|CHRM)$/.test(output.path)),
    false,
  );
});

test("SAKR audio preserves exact reused voice and authored SFX identities", () => {
  assert.equal(audio.sources.stream.sha256,
    "e6426b93a52461b4541f45eba7aee3427601ee300e1447dc8f6caadf55431410");
  assert.equal(audio.sources.soundBank.sha256,
    "cf1e1202e3072d46e45f6d0bb2ed27b96552d1fe5d8ad713ab940c75fb01a8e6");
  assert.equal(audio.voices.length, 11);
  assert.equal(audio.sounds.length, 5);
  assert.deepEqual(
    audio.sounds.map(sound => sound.commandHex),
    ["a9040000", "a9040100", "a9040200", "a9040300", "a9040400"],
  );
  assert.equal(
    audio.voices.find(voice => voice.voiceId === "A0128A001")?.speakerId,
    "JAKR",
  );
});
