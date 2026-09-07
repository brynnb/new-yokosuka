import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../src/AuthSequence.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { parseNativeHandRig } from "../src/NativeHandRig.js";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const variants = [{
  root: "play/assets/sakuragaoka/dnoz-ski",
  audio: "public/audio/world/dnoz-ski/manifest.json",
  motion: "M_01SKI.MOTN",
  pointers: [[0, 0x38e2, 0x38ef], [1, 0x38fd, 0x390a]],
  voices: 33,
}, {
  root: "play/assets/sakuragaoka/dnoz",
  audio: "public/audio/world/dnoz/manifest.json",
  motion: "M_01FUL.MOTN",
  pointers: [[0, 0x393d, 0x394a], [1, 0x3958, 0x3965]],
  voices: 23,
}];

test("DNOZ retains two exact ordered-fragment scenes and their dedicated audio", () => {
  for (const variant of variants) {
    const manifest = JSON.parse(fs.readFileSync(`${variant.root}/manifest.json`, "utf8"));
    const audio = JSON.parse(fs.readFileSync(variant.audio, "utf8"));
    assert.equal(manifest.nativeBinding.resourceName, "DNOZ");
    assert.equal(manifest.source.format, "loose-files");
    assert.deepEqual(
      manifest.activities.map(value => [value.slot, value.primaryPointer, value.secondaryPointer]),
      variant.pointers,
    );
    assert.ok(manifest.activities.every(value => value.nativeFaceClipCues.length > 0));
    assert.equal(Object.keys(manifest.sceneObjects).length, 14);
    assert.ok(Object.values(manifest.sceneObjects).every(
      value => value.lifecycle.kind === "room-script-persistent",
    ));
    assert.ok(manifest.activities.every(value => (
      value.nativeSceneObjectStates.length === 14
      && value.nativeSceneObjectStates.filter(state => state.presented).length === 7
    )));
    for (const output of manifest.outputs) {
      const bytes = fs.readFileSync(output.path);
      assert.equal(bytes.length, output.byteLength);
      assert.equal(sha256(bytes), output.sha256);
    }
    assert.equal(audio.voices.length, variant.voices);
    assert.deepEqual([...new Set(audio.voices.map(value => value.speakerId))].sort(), ["AKIR", "HRSK"]);
    assert.ok(audio.voices.every(value => typeof value.displayText === "string" && value.lipSync));
  }
});

test("DNOZ shares one exact authored environment and retains Nozomi's native HAND cue", () => {
  const environment = JSON.parse(fs.readFileSync(
    "play/assets/sakuragaoka/dnoz-environment/manifest.json", "utf8",
  ));
  assert.equal(environment.layers.length, 14);
  for (const layer of environment.layers) {
    const bytes = fs.readFileSync(
      `play/assets/sakuragaoka/dnoz-environment/${layer.outputName}`,
    );
    assert.equal(bytes.length, layer.byteLength);
    assert.equal(sha256(bytes), layer.sha256);
  }

  const ski = JSON.parse(fs.readFileSync(
    "play/assets/sakuragaoka/dnoz-ski/manifest.json", "utf8",
  ));
  assert.deepEqual(ski.handAssets.HRSK.bodyHandRenderKeys, { left: -66, right: -65 });
  assert.equal(ski.handAssets.HRSK.left.rootRenderKey, 11);
  assert.equal(ski.handAssets.HRSK.right.rootRenderKey, 6);
  assert.equal(ski.handAssets.HRSK.rig.vertexCount, 299);
  assert.deepEqual(ski.handAssets.HRSK.rig.pointerOffsets, [24, 168, 8304, 5848, 6344, 8608]);
  assert.deepEqual(ski.activities[1].nativeHandPoseCues, [{
    activitySlot: 1,
    frame: 2780,
    actorTag: "HRSK",
    side: "right",
    poseTableOffset: "0x37a0",
    durationNativeTicks: 16,
    callFileOffset: "0xf8a",
  }]);
  assert.ok(ski.nativeHandPoseTables["0x37a0"]);

  const tears = JSON.parse(fs.readFileSync(
    "play/assets/sakuragaoka/dnoz/manifest.json", "utf8",
  ));
  assert.deepEqual(tears.activities[1].nativeFaceGazeCues, [{
    activitySlot: 1,
    frame: 1162,
    actorTag: "AKIR",
    mode: 0,
    durationNativeTicks: 16,
    callFileOffset: "0x1896",
  }, {
    activitySlot: 1,
    frame: 1560,
    actorTag: "AKIR",
    mode: 2,
    durationNativeTicks: 8,
    target: {
      kind: "actor-component",
      actorTag: "HRSK",
      selector: 18,
      associated: false,
      offset: [0, 0, 0],
    },
    callFileOffset: "0x1946",
  }]);
});

test("DNOZ hand rig topology matches both exact detailed-hand surfaces", async () => {
  const definition = JSON.parse(fs.readFileSync(
    "play/assets/sakuragaoka/dnoz-ski/manifest.json", "utf8",
  )).handAssets.HRSK;
  const rigBytes = fs.readFileSync(definition.rig.path);
  const rig = parseNativeHandRig(rigBytes, definition.rig);
  assert.equal(rig.vertexCount, 299);

  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    for (const side of ["left", "right"]) {
      const bytes = fs.readFileSync(definition[side].model.path);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const loader = new Mt5Loader(scene, {
        mirrorCharacterX: true,
        characterRigMode: "gpu",
      });
      const [root] = await loader.load(buffer, null);
      const renderKey = definition[side].rootRenderKey;
      const node = root._mt5Nodes.find(value => (
        (value.flag << 16 >> 16) === renderKey && value.model
      ));
      assert.equal(node?.model?.nbVertex, rig.vertexCount, side);
      root.dispose(false, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("both DNOZ scenes resolve every authored performance without fallback motion", () => {
  for (const variant of variants) {
    const manifest = JSON.parse(fs.readFileSync(`${variant.root}/manifest.json`, "utf8"));
    const motion = MotnLoader.parse(fs.readFileSync(`${variant.root}/${variant.motion}`));
    for (const activity of manifest.activities) {
      const bytes = fs.readFileSync(`${variant.root}/${activity.archiveMember}`);
      const sequence = parseAuthSequence(bytes);
      const resolved = resolveAuthMotions(sequence, new Map([[16, motion]]));
      assert.deepEqual(sequence.actors, ["AKIR", "HRSK"]);
      assert.equal(parseAuthMovement(bytes).actors.length, 2);
      assert.equal(parseAuthCamera(bytes).cameras.length, 1);
      assert.ok(resolved.length > 0);
      assert.ok(resolved.every(value => value.motionValid));
    }
  }
});
