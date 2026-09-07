import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import op00Manifest from "../play/assets/introduction/op00/manifest.json" with {
  type: "json",
};
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  deformNativeHandVertices,
  nativeHandPoseTarget,
  parseNativeHandRig,
  stepNativeHandPoseTransition,
} from "../src/NativeHandRig.js";

function arrayBuffer(filename) {
  const value = readFileSync(filename);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

test("native HAND rig deforms Ryo's authored slot-5 pose", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const rig = parseNativeHandRig(
      arrayBuffer("play/assets/introduction/op00/hands/YKB_HM.BIN"),
    );
    assert.equal(rig.boneCount, 71);
    assert.equal(rig.vertexCount, 306);
    assert.equal(
      rig.influenceCounts.reduce((sum, value) => sum + value, 0),
      619,
    );

    const modelBuffer = arrayBuffer(
      "play/assets/introduction/op00/hands/YKB_TL.MT5",
    );
    const loader = new Mt5Loader(scene, {
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const [root] = await loader.load(modelBuffer, null);
    const node = root._mt5Nodes.find(value => value.model?.nbVertex === 306);
    const view = new DataView(modelBuffer);
    const source = Float32Array.from({ length: 306 * 6 }, (_, index) => (
      view.getFloat32(node.model.vertexAddr + index * 4, true)
    ));
    const pose = nativeHandPoseTarget(
      op00Manifest.nativeHandPoseTables["0x217f4"].vectors,
    );
    const deformed = deformNativeHandVertices(rig, source, pose, 1);
    const nativeSlot5FirstVertex = [
      0.10711140930652618,
      -0.004727736581116915,
      -0.02867182344198227,
      0.41434603929519653,
      -0.5103831887245178,
      -0.745689332485199,
    ];
    nativeSlot5FirstVertex.forEach((expected, index) => {
      assert.ok(
        Math.abs(deformed[index] - expected) < 1e-6,
        `slot-5 vertex channel ${index}`,
      );
    });
    root.dispose(false, true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native HAND transitions use the game's two-tick interpolation", () => {
  const state = {
    current: new Int32Array(71 * 3),
    target: new Int32Array(71 * 3),
    remainingNativeTicks: 10,
    active: true,
  };
  state.target[0] = 100;
  const values = [];
  while (state.active) {
    assert.equal(stepNativeHandPoseTransition(state), true);
    values.push(state.current[0]);
  }
  assert.deepEqual(values, [20, 40, 60, 80, 100, 100]);
  assert.equal(state.remainingNativeTicks, 0);
});

test("native HAND rigs retain their asset-authored vertex topology", () => {
  const rig = parseNativeHandRig(
    arrayBuffer("play/assets/dobuita/toki/KAS_HM.BIN"),
    {
      transformNodeCount: 71,
      vertexCount: 301,
      pointerOffsets: [24, 168, 8864, 5848, 6456, 9168],
    },
  );
  assert.equal(rig.boneCount, 71);
  assert.equal(rig.vertexCount, 301);
  assert.equal(rig.influenceCounts.length, 301);
  assert.equal(rig.influenceCounts.reduce((sum, value) => sum + value, 0), 602);
});
