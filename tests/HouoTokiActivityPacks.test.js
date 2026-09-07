import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Mt5Loader } from "../src/Mt5Loader.js";

const json = path => JSON.parse(readFileSync(path, "utf8"));
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const houo = json("play/assets/hazuki/houo/manifest.json");
const toki = json("play/assets/dobuita/toki/manifest.json");
const houoAudio = json("public/audio/world/houo/manifest.json");
const tokiAudio = json("public/audio/world/toki/manifest.json");

function assertOutputs(manifest) {
  for (const output of manifest.outputs) {
    assert.equal(readFileSync(output.path).length, output.byteLength, output.path);
    assert.equal(digest(output.path), output.sha256, output.path);
  }
}

test("HOUO packages the exact Phoenix Mirror activity and prop", () => {
  assert.equal(houo.source.sha256, "4e225fb669724ffa169e49dd55c122bf434da972a03e1b3be919c77ea048cf0d");
  assert.equal(houo.activities.length, 1);
  assert.deepEqual(houo.activities[0].actors, ["AKIR", "FUKU", "MIRR"]);
  assert.equal(houo.activities[0].durationFrames, 1810);
  assert.equal(houo.activities[0].commandCounts.voice, 16);
  assert.equal(houo.sceneObjects.MIRR.assetPath, "play/assets/hazuki/houo/PNX02M6G.CHRM");
  assert.equal(
    houo.sceneObjects.MIRR.textureAssetPath,
    "play/assets/hazuki/houo/HOUO_textures.bin",
  );
  assert.equal(houo.activities[0].nativeFaceClipCues.length, 37);
  assert.equal(houo.activities[0].nativeFaceControllerCues.length, 16);
  assert.deepEqual(
    houo.activities[0].nativeFaceControllerCues.map(cue => cue.frame),
    [880, 882, 885, 887, 910, 912, 915, 917, 1200, 1202, 1205, 1207, 1220, 1222, 1225, 1227],
  );
  assert.deepEqual(houo.activities[0].nativeDetailedHandDefaults.map(cue => ({
    actorTag: cue.actorTag,
    sides: cue.sides,
  })), [
    { actorTag: "AKIR", sides: ["left", "right"] },
    { actorTag: "FUKU", sides: ["left", "right"] },
  ]);
  const textureOutput = houo.outputs.find(output => (
    output.path === "play/assets/hazuki/houo/HOUO_textures.bin"
  ));
  assert.equal(textureOutput.byteLength, 163936);
  assert.deepEqual(textureOutput.source.recordOffsets, [36, 131172]);
  assert.deepEqual(textureOutput.source.textureIds, [
    "a0a0d7966530315f",
    "969fcb616330315f",
  ]);
  const textureBytes = readFileSync(textureOutput.path);
  const textureIndex = Mt5Loader.buildTexturePackIndex(textureBytes.buffer.slice(
    textureBytes.byteOffset,
    textureBytes.byteOffset + textureBytes.byteLength,
  ));
  assert.deepEqual([...textureIndex.keys()], [
    "2530713760_1597059173",
    "1640734614_1597059171",
  ]);
  assertOutputs(houo);
});

test("TOKI packages one canonical Chinese-letter scene despite three replay installs", () => {
  assert.equal(toki.source.sha256, "507a20816d8a73a2a41700e90b4bc8e62e9a2b4dc4ad865cdfd9e555f459a38e");
  assert.equal(toki.activities.length, 1);
  assert.deepEqual(toki.activities[0].actors, ["AKIR", "ASDA"]);
  assert.equal(toki.activities[0].durationFrames, 5355);
  assert.equal(toki.activities[0].commandCounts.voice, 41);
  assert.equal(toki.attachedObjects.TEGS.assetPath, "play/assets/dobuita/toki/MALS509G.MT5");
  assert.match(toki.nativeBinding.selectionRule, /later installs replay identical bytes/);
  assertOutputs(toki);
});

test("HOUO and TOKI ship every authored voice and exact SFX binding", () => {
  assert.equal(houoAudio.voices.length, 16);
  assert.equal(houoAudio.sounds.length, 11);
  assert.equal(tokiAudio.voices.length, 41);
  assert.equal(tokiAudio.sounds.length, 16);
  for (const manifest of [houoAudio, tokiAudio]) {
    assert.ok(manifest.voices.every(voice => !voice.unavailable && voice.asset));
    for (const voice of manifest.voices) {
      assert.equal(digest(voice.asset), voice.sha256, voice.voiceId);
    }
    for (const sound of manifest.sounds) {
      for (const asset of sound.assets || [sound]) {
        assert.equal(digest(asset.asset), asset.sha256, sound.sourcePath);
      }
    }
  }
});
