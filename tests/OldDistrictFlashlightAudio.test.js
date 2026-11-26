import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const prefix = "public/audio/world/e1kaiqte";
const manifestPath = prefix + "/manifest.json";
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const registry = JSON.parse(readFileSync("src/runtime-assets.generated.json")).assets;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("MKSG registers the five source commands, complete scores and original playback samples", () => {
  assert.deepEqual(registry[manifestPath], { sha256: sha256(manifestBytes), size: manifestBytes.length });
  assert.equal(manifest.sampleRate, 44100);
  assert.deepEqual(manifest.sounds.map(sound => [
    sound.command, sound.literalOffset, sound.scoreHex, sound.sampleId, sound.frames,
  ]), [
    ["A9040100", 0x21494, "c0df017f80ff", 6, 18535],
    ["A9040200", 0x20b04, "c0df027f80ff", 3, 47484],
    ["A9040300", 0x219a0, "c0df037f80ff", 2, 58307],
    ["A9040400", 0x21760, "c0df047f80ff", 1, 34291],
    ["A9040500", 0x21790, "c0df057f80ff", 0, 53429],
  ]);
  for (const sound of manifest.sounds) {
    assert.equal(sound.asset, prefix + "/" + sound.command + ".wav");
    assert.equal(sound.trimmedBootFrames, 2618);
    assert.deepEqual(registry[sound.asset], { sha256: sound.sha256, size: 44 + 4 * sound.frames });
  }
});

test("restored MKSG WAVs retain both AICA channels and their complete audible tails", t => {
  if (!manifest.sounds.some(sound => existsSync(sound.asset))) {
    return t.skip("Original WAV pack is not hydrated in this checkout");
  }
  for (const sound of manifest.sounds) {
    const wav = readFileSync(sound.asset);
    assert.equal(sha256(wav), sound.sha256, sound.command);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), manifest.sampleRate);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), 4 * sound.frames);
    assert.ok(wav.subarray(44, 52).some(byte => byte !== 0));
    assert.notEqual(wav.readUInt32LE(wav.length - 4), 0);
  }
});
