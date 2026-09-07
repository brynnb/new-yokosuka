import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  NativeAseqAttachedObjectRuntime,
} from "../play/events/NativeAseqAttachedObjectRuntime.js";

const definitions = {
  RYUK: {
    browserFilename: "S1_OP00_DRGS502G.MT5",
    attachments: [{
      activitySlot: 20,
      frame: 0,
      parentActorTag: "SORY",
      controlId: 12,
      translation: [0.06, 0, 0.08],
      rotationRaw: [0x2888, 0, 0xc444],
    }],
  },
};

test("AUTH FIXO props follow the exact parent controller and hide between activities", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const mirror = new BABYLON.TransformNode("mirror", scene);
    mirror._filename = "S1_OP00_DRGS502G.MT5";
    mirror.position.set(7, 8, 9);
    const parentRoot = new BABYLON.TransformNode("lan-di", scene);
    const parentMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const actor = {
      root: parentRoot,
      model: {
        latestControllerFamily: {
          nodes: [{ index: 3, type: 12 }],
        },
        latestControllerMatrices: [null, null, null, parentMatrix],
      },
    };
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions,
      resolveActor: actorTag => actorTag === "SORY" ? actor : null,
    });

    assert.equal(await runtime.load([mirror]), 1);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(runtime.beginActivity({ slot: 14 }), 0);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(runtime.beginActivity({ slot: 20 }), 1);
    assert.equal(runtime.update(), true);
    assert.equal(mirror.isEnabled(), true);
    assert.equal(mirror.parent, parentRoot);
    assert.ok(Math.abs(mirror.position.x + 0.06) < 1e-6);
    assert.ok(Math.abs(mirror.position.y) < 1e-6);
    assert.ok(Math.abs(mirror.position.z - 0.08) < 1e-6);

    assert.equal(runtime.beginActivity({ slot: 16 }), 0);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(mirror.parent, null);
    assert.deepEqual(mirror.position.asArray(), [7, 8, 9]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH FIXO props activate at their derived activity frame", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const mirror = new BABYLON.TransformNode("mirror", scene);
    mirror._filename = "S1_OP00_DRGS502G.MT5";
    const parentRoot = new BABYLON.TransformNode("lan-di", scene);
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: {
        RYUK: {
          browserFilename: "S1_OP00_DRGS502G.MT5",
          attachments: [
            {
              activitySlot: 20,
              frame: 5,
              parentActorTag: "SORY",
              controlId: 12,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            {
              activitySlot: 20,
              frame: 8,
              parentActorTag: "SORY",
              controlId: 12,
              translation: [1, 0, 0],
              rotationRaw: [0, 0, 0],
            },
          ],
        },
      },
      resolveActor: () => ({
        root: parentRoot,
        model: {
          latestControllerFamily: { nodes: [{ index: 0, type: 12 }] },
          latestControllerMatrices: [[
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
          ]],
        },
      }),
    });

    await runtime.load([mirror]);
    assert.equal(runtime.beginActivity({ slot: 20 }), 2);
    assert.equal(runtime.update(4), true);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(runtime.update(5), true);
    assert.equal(mirror.isEnabled(), true);
    assert.ok(Math.abs(mirror.position.x) < 1e-6);
    assert.equal(runtime.update(8), true);
    assert.ok(Math.abs(mirror.position.x + 1) < 1e-6);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH FIXO props fail closed until the authored controller exists", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const mirror = new BABYLON.TransformNode("mirror", scene);
    mirror._filename = "S1_OP00_DRGS502G.MT5";
    const parentRoot = new BABYLON.TransformNode("lan-di", scene);
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions,
      resolveActor: () => ({
        root: parentRoot,
        model: {
          latestControllerFamily: { nodes: [{ index: 2, type: 18 }] },
          latestControllerMatrices: [],
        },
      }),
    });
    await runtime.load([mirror]);
    runtime.beginActivity({ slot: 20 });
    assert.equal(runtime.update(), false);
    assert.equal(mirror.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH FIXO props support standalone activity handoffs and detach cues", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const can = new BABYLON.TransformNode("can", scene);
    can._filename = "S1_D000_COKS520G.MT5";
    const ryoRoot = new BABYLON.TransformNode("ryo", scene);
    const wangRoot = new BABYLON.TransformNode("wang", scene);
    const matrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const actors = new Map([
      ["AKIR", { root: ryoRoot }],
      ["YKHI", { root: wangRoot }],
    ]);
    for (const actor of actors.values()) actor.model = {
      latestControllerFamily: { nodes: [{ index: 0, type: 18 }] },
      latestControllerMatrices: [matrix],
    };
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: {
        CAN1: {
          browserFilename: "S1_D000_COKS520G.MT5",
          attachments: [
            {
              activitySlot: 22,
              frame: 160,
              parentActorTag: "AKIR",
              controlId: 18,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            {
              activitySlot: 22,
              frame: 255,
              parentActorTag: "YKHI",
              controlId: 18,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            { activitySlot: 22, frame: 1810, action: "detach" },
          ],
        },
      },
      resolveActor: tag => actors.get(tag),
    });
    await runtime.load([can]);
    assert.equal(runtime.beginActivity({ slot: 22 }), 3);
    runtime.update(159);
    assert.equal(can.isEnabled(), false);
    runtime.update(160);
    assert.equal(can.parent, ryoRoot);
    runtime.update(255);
    assert.equal(can.parent, wangRoot);
    runtime.update(1810);
    assert.equal(can.isEnabled(), false);
    runtime.endActivity();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH FIXO props instantiate exact package-owned models when absent", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const can = new BABYLON.TransformNode("can", scene);
    can._filename = "S1_D000_COKS520G.MT5";
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: {
        CAN1: {
          browserFilename: "S1_D000_COKS520G.MT5",
          assetPath: "play/assets/dobuita/djhn/COKS520G.CHRM",
          attachments: [{
            activitySlot: 22,
            frame: 0,
            parentActorTag: "AKIR",
            controlId: 18,
            translation: [0, 0, 0],
            rotationRaw: [0, 0, 0],
          }],
        },
      },
      resolveActor: () => null,
      instantiateAsset: async definition => {
        assert.equal(definition.assetPath, "play/assets/dobuita/djhn/COKS520G.CHRM");
        return [can];
      },
    });
    assert.equal(await runtime.load([]), 1);
    assert.equal(can.isEnabled(), false);
    runtime.clear();
    assert.equal(can.isDisposed(), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("AUTH FIXO presentation and articulated nodes seek from authored state", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const letter = new BABYLON.TransformNode("letter", scene);
    letter._filename = "MALS509G.CHRM";
    const hinge = new BABYLON.TransformNode("hinge", scene);
    hinge.parent = letter;
    hinge.rotation.set(0, 0, 0);
    letter._mt5Nodes = [{
      renderKey: 0x98,
      mesh: hinge,
      pos: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: 0, z: 0 },
    }];
    const parentRoot = new BABYLON.TransformNode("ryo", scene);
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: {
        TEGS: {
          browserFilename: "MALS509G.CHRM",
          attachments: [{
            activitySlot: 0,
            frame: 1,
            parentActorTag: "AKIR",
            controlId: 18,
            translation: [0, 0, 0],
            rotationRaw: [0, 0, 0],
          }],
          presentation: [
            { activitySlot: 0, frame: 350, visible: true },
            { activitySlot: 0, frame: 800, visible: false },
          ],
          nodeTransforms: [
            { activitySlot: 0, frame: 1, nodeKey: 0x98, mode: "set", rotationRaw: [0, 0, 10] },
            { activitySlot: 0, firstFrame: 400, lastFrame: 423, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, 20] },
            { activitySlot: 0, firstFrame: 752, lastFrame: 775, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, -20] },
          ],
        },
      },
      resolveActor: () => ({
        root: parentRoot,
        model: {
          latestControllerFamily: { nodes: [{ index: 0, type: 18 }] },
          latestControllerMatrices: [[
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
          ]],
        },
      }),
    });
    await runtime.load([letter]);
    runtime.beginActivity({ slot: 0 });
    runtime.update(349);
    assert.equal(letter.isEnabled(), false);
    runtime.update(350);
    assert.equal(letter.isEnabled(), true);
    runtime.update(423);
    const openRotation = hinge.rotationQuaternion.clone();
    runtime.update(775);
    assert.ok(Math.abs(hinge.rotationQuaternion.z) < 0.001);
    runtime.update(423);
    assert.ok(Math.abs(hinge.rotationQuaternion.z - openRotation.z) < 1e-6);
    runtime.update(800);
    assert.equal(letter.isEnabled(), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
