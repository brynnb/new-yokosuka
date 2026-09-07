import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { NullEngine, Scene } from "@babylonjs/core";

import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import {
  ScheduledActorMotionRuntime,
} from "../play/characters/ScheduledActorMotionRuntime.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  RYO_YK_RENDER_MATRIX_ROUTES,
} from "../src/RuntimeMatrixRecording.js";

function arrayBuffer(path) {
  const bytes = fs.readFileSync(path);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

test("character preview idle applies to a playable character rig", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const renderMatrixByKey = new Map(RYO_YK_RENDER_MATRIX_ROUTES);
  const loader = new Mt5Loader(scene, {
    characterRigMode: "baked",
    characterRigSeamMode: "weld",
  });
  const [root] = await loader.load(
    arrayBuffer("play/assets/characters/FUK_M.CHRM"),
    null,
  );
  const characterRuntime = new CharacterRuntime({
    scene,
    renderMatrixByKey,
    fetchArrayBuffer: async () => {
      throw new Error("unexpected fetch");
    },
  });
  characterRuntime.setReferenceBind(loader, root);

  const name = "YKI_AKI_KAMAE1_LP";
  const sequence = MotnLoader.parse(
    arrayBuffer("play/assets/account/M_ZAKO.MOTN"),
    { sequenceNames: [name] },
  ).getSequence(name);
  const motionRuntime = new ScheduledActorMotionRuntime({
    renderMatrixByKey,
    characterRuntime,
    fetchArrayBuffer: async () => {
      throw new Error("unexpected fetch");
    },
    bankUrls: {},
  });
  motionRuntime.sequences.set(`preview:${name}`, sequence);
  const model = {
    loader,
    renderRoot: root,
    modelCode: "FUK_M",
    humanoidControlRigs: new Map(),
  };

  assert.equal(motionRuntime.applyNamed(model, {
    bank: "preview",
    name,
    loop: true,
  }, 0.5), true);
  assert.ok(model.latestRetargetedRoutes.size > 0);

  root.dispose(false, true);
  scene.dispose();
  engine.dispose();
});
