import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateNativeTalkVertices,
  nativeTalkActorPoses,
  NativeTalkDeltaTransition,
  parseNativeTalkPoseAsset,
} from "../src/NativeTalkPoses.js";

const POSE_PATH =
  "play/assets/cutscenes/native-faces/native-talk-poses.generated.json";

test("generated TALK poses retain the independent native Ryo oracle", () => {
  const asset = parseNativeTalkPoseAsset(readFileSync(POSE_PATH));
  const ryo = nativeTalkActorPoses(
    asset,
    "AKIR",
    "1b0f9d6317bcda987476eb99043e203575eed68920c93a0adf91482d918abd67",
  );
  assert.equal(asset.poseDuration, 79);
  assert.equal(ryo.upperPoses.length, 80);
  assert.equal(ryo.mouthPoses.length, 80);
  assert.deepEqual(Array.from(ryo.mouthPoses[1].slice(0, 3)), [
    -0.0016194581985473633,
    1.642678881808024e-9,
    -0.0032559186220169067,
  ]);
  assert.deepEqual(Array.from(ryo.mouthPoses[1].slice(12, 15)), [
    -0.00010854005813598633,
    -0.000007987022399902344,
    0.0005072616040706635,
  ]);
  assert.notDeepEqual(
    Array.from(ryo.upperPoses[60]),
    Array.from(ryo.upperPoses[0]),
    "authored upper-face clip families must not collapse to neutral",
  );
});

test("FUB TALK output uses its exact table and retains mouth and upper-face motion", () => {
  const asset = parseNativeTalkPoseAsset(readFileSync(
    "play/assets/cutscenes/native-faces/fub-talk-poses.generated.json",
  ));
  const poses = nativeTalkActorPoses(asset, "FUKU",
    "c2be5f63cb0918f4a26b982f68be29c5aadcae95fdb7a24a7ecbe4d6bc2c4f32");
  assert.equal(poses.faceCode, "FUB");
  assert.equal(poses.upperPoses.length, 80);
  assert.equal(poses.mouthPoses.length, 80);
  assert.notDeepEqual(poses.upperPoses[0], poses.upperPoses[1]);
  assert.notDeepEqual(poses.mouthPoses[0], poses.mouthPoses[1]);
  assert.throws(
    () => nativeTalkActorPoses(asset, "FUKU",
      "0da346204075039870a014ed304b2c77af9a410f3a07e2a1f8f4196743725047"),
    /do not match FUKU FTBL/,
  );
});

test("TALK transitions and FTBL contributions compose both native lanes", () => {
  const neutral = new Float32Array(75);
  const target = new Float32Array(75);
  target[0] = 0.4;
  const transition = new NativeTalkDeltaTransition(neutral);
  transition.transition(target, 2);
  transition.advanceTick();
  assert.equal(transition.current[0], Math.fround(0.2));
  transition.advanceTick();
  assert.equal(transition.current[0], Math.fround(0.4));

  const upper = new Float32Array(75);
  const mouth = new Float32Array(75);
  upper[0] = 0.25;
  mouth[0] = 0.5;
  const result = evaluateNativeTalkVertices({
    sourcePositions: new Float32Array([1, 2, 3]),
    vertexContributions: [[{ controlIndex: 0, weight: 0.5 }]],
    upperDeltas: upper,
    mouthDeltas: mouth,
  });
  assert.deepEqual(Array.from(result), [1.375, 2, 3]);
});
