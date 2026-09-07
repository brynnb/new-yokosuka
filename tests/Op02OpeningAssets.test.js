import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseAuthSequence } from "../src/AuthSequence.js";

const manifest = JSON.parse(readFileSync(
  "play/assets/introduction/op02/manifest.json", "utf8",
));
const audio = JSON.parse(readFileSync(
  "public/audio/world/op02/manifest.json", "utf8",
));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("OP02 opening outputs are pinned exact native resources", () => {
  for (const output of manifest.outputs) {
    const bytes = readFileSync(output.path);
    assert.equal(bytes.length, output.byteLength, output.path);
    assert.equal(sha256(bytes), output.sha256, output.path);
  }
  assert.equal(manifest.activities.length, 7);
  assert.equal(manifest.facialAssets.SINF.bodyModelCode, "MGR_M");
  assert.equal(manifest.facialAssets.SINF.attachmentRenderKey, -67);
  assert.equal(
    manifest.facialAssets.SINF.texturePack.path,
    "play/assets/introduction/op02/OP02_textures.bin",
  );
  assert.equal(audio.sounds.length, 1);
  assert.equal(audio.sounds[0].nativeSegments.length, 26);
  assert.deepEqual(
    manifest.ownerAudioCommands.map(value => [
      value.commandHex,
      value.kind,
      value.trackId || null,
    ]),
    [
      ["a82b0000", "music", "bgm019"],
      ["a0040000", "native-control-no-output", null],
      ["a00a0000", "native-control-no-output", null],
    ],
  );
});

test("OP02 retains its numbered native map-layer resources", () => {
  assert.deepEqual(manifest.mapLayers, [
    { nativeName: "MAP01", browserFilename: "S1_OP02_MAP01.MT5" },
    { nativeName: "MAP02", browserFilename: "S1_OP02_MAP02.MT5" },
  ]);
  assert.deepEqual(manifest.mapGeometryMasks, [{
    browserFilename: "S1_OP02_MAP03.MT5",
    nodeAddress: 0xd10,
  }]);
  assert.deepEqual(
    manifest.activities.map(track => [
      track.index,
      track.browserMapVisibility.map(value => value.visible),
    ]),
    [
      [0, [true, true]], [1, [true, true]], [2, [true, true]],
      [3, [true, true]], [4, [true, true]], [5, [true, true]],
      [6, [true, true]],
    ],
  );
});

test("OP02 retains Shenhua's captured native cloth runtime state", () => {
  assert.equal(manifest.packageActors.SINF.nativeClothRuntimeMode, 4);
  assert.equal(
    manifest.packageActors.SINF.nativeSecondaryMotionRuntimeMode,
    1,
  );
  const definition = manifest.clothTracks.SINF;
  const bytes = readFileSync(definition.path);
  assert.equal(definition.controlType, -70);
  assert.equal(definition.frameRate, 30);
  assert.equal(definition.frameCount, 1313);
  assert.deepEqual(definition.firstCoordinate, [2, 2]);
  assert.deepEqual(definition.lastCoordinate, [5, 57]);
  assert.deepEqual(definition.activityOrder, [2, 3, 4, 5]);
  assert.equal(definition.byteLength, bytes.length);
  assert.equal(definition.sha256, sha256(bytes));
});

test("OP02 classifies every authored hawk TMNM stream", () => {
  assert.deepEqual(manifest.nodeMotion.playbackKindsBySequenceIndex, [
    "transition", "loop", "transition", "loop",
    "transition", "transition", "transition", "loop",
  ]);
});

test("OP02's terminal FACE/CLIP records retain their authored actor target", () => {
  const bytes = readFileSync("play/assets/introduction/op02/SEQDATA5.AUTH");
  const sequence = parseAuthSequence(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const effects = sequence.frames.flatMap(frame => frame.commands).filter(
    command => command.name === "effect",
  );
  assert.deepEqual(effects.map(command => ({
    actorTag: command.actorTag,
    effectType: command.effectType,
    pattern: command.pattern,
    speed: command.speed,
  })), [
    { actorTag: "SINF", effectType: 6, pattern: 0, speed: 1 },
    { actorTag: "SINF", effectType: 1, pattern: 0, speed: 10 },
    { actorTag: "SINF", effectType: 2, pattern: 0, speed: 10 },
  ]);
});
