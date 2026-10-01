import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";

import {
  NativeAseqAttachedObjectRuntime,
} from "../play/events/NativeAseqAttachedObjectRuntime.js";
import { compileNativeAseqAttachedObjects } from "../tools/lib/NativeAseqActivityPack.mjs";

const definitions = {
  RYUK: {
    browserFilename: "S1_OP00_DRGS502G.MT5",
    attachments: [{
      activityId: "activity-20",
      frame: 0,
      parentActorTag: "SORY",
      controlId: 12,
      translation: [0.06, 0, 0.08],
      rotationRaw: [0x2888, 0, 0xc444],
    }],
  },
};

test("attachment generation rejects ambiguous reused slots instead of assigning all shots", () => {
  const activities = [
    { slot: 20, activityId: "first" }, { slot: 20, activityId: "second" },
  ];
  const native = { PROP: { attachments: [{ activitySlot: 20, frame: 1 }] } };
  assert.throws(() => compileNativeAseqAttachedObjects(native, activities), /one exact activity/);
  native.PROP.attachments[0].activityId = "second";
  assert.equal(compileNativeAseqAttachedObjects(native, activities).PROP.attachments[0].activityId, "second");
});

test("reused slots attach existing tagged props and return AUTH-driven objects without duplicates", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const actorRoot = new BABYLON.TransformNode("actor", scene);
    actorRoot.position.set(10, 2, 3);
    const fish1 = new BABYLON.TransformNode("fish-1", scene);
    const fish2 = new BABYLON.TransformNode("fish-2", scene);
    fish1._filename = fish2._filename = "FISH.MT5";
    const props = new Map([["NBO1", { root: fish1 }], ["NBO2", { root: fish2 }]]);
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: Object.fromEntries([...props].map(([tag]) => [tag, {
        browserFilename: "FISH.MT5", sceneObject: true,
        attachments: [
          { activityId: "middle", frame: 1, parentActorTag: "AKIR", controlId: 18, translation: [1, 0, 0], rotationRaw: [0, 0, 0] },
          { activityId: "middle", frame: 5, action: "detach" },
        ],
      }])),
      resolveSceneObject: tag => props.get(tag),
      resolveActor: () => ({ root: actorRoot, model: {
        renderRoot: actorRoot,
        latestControllerFamily: { nodes: [{ index: 0, type: 18 }] },
        latestControllerMatrices: [Array.from(BABYLON.Matrix.Identity().asArray())],
      } }),
      instantiateAsset: () => { throw new Error("must borrow tagged scene object"); },
    });
    assert.equal(await runtime.load([fish1, fish2]), 2);
    assert.equal(runtime.beginActivity({ slot: 0, activityId: "first", actors: [] }), 0);
    assert.equal(runtime.beginActivity({ slot: 0, activityId: "middle", actors: ["NBO1", "NBO2"] }), 4);
    fish1.setEnabled(true);
    fish2.setEnabled(true);
    assert.equal(runtime.update(1), true);
    assert.equal(fish1.parent, null);
    assert.deepEqual(fish1.position.asArray(), [9, 2, 3]);
    assert.notEqual(runtime.objects.get("NBO1").root, runtime.objects.get("NBO2").root);
    // AUTH writes its world pose before attachment evaluation. Detach must not
    // hide that pose or restore the old pre-load transform over it.
    fish1.position.set(4, 5, 6);
    assert.equal(runtime.update(5), true);
    assert.equal(fish1.isEnabled(), true);
    assert.deepEqual(fish1.position.asArray(), [4, 5, 6]);
    assert.equal(runtime.beginActivity({ slot: 0, activityId: "last", actors: [] }), 0);
    assert.deepEqual(fish1.position.asArray(), [4, 5, 6]);
    runtime.clear();
    assert.equal(fish1.isDisposed(), false);
    assert.throws(() => runtime.beginActivity({ slot: 0 }), /exact activity ID/);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

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
        renderRoot: parentRoot,
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
    assert.equal(runtime.beginActivity({ activityId: "activity-14" }), 0);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(runtime.beginActivity({ activityId: "activity-20" }), 1);
    assert.equal(runtime.update(), true);
    assert.equal(mirror.isEnabled(), true);
    assert.equal(mirror.parent, parentRoot);
    assert.ok(Math.abs(mirror.position.x + 0.06) < 1e-6);
    assert.ok(Math.abs(mirror.position.y) < 1e-6);
    assert.ok(Math.abs(mirror.position.z - 0.08) < 1e-6);

    assert.equal(runtime.beginActivity({ activityId: "activity-16" }), 0);
    assert.equal(mirror.isEnabled(), false);
    assert.equal(mirror.parent, null);
    assert.deepEqual(mirror.position.asArray(), [7, 8, 9]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

for (const sceneObject of [false, true]) {
  test(`AUTH ${sceneObject ? "borrowed" : "standalone"} props include the rendered model transform`, async () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
      const actorRoot = new BABYLON.TransformNode("actor", scene);
      actorRoot.position.set(10, 2, 3);
      actorRoot.rotation.y = 0.3;
      const modelOffset = new BABYLON.TransformNode("model-offset", scene);
      modelOffset.parent = actorRoot;
      modelOffset.rotation.y = Math.PI;
      modelOffset.position.y = 0.25;
      modelOffset.scaling.setAll(1.4);
      const renderRoot = new BABYLON.TransformNode("render-root", scene);
      renderRoot.parent = modelOffset;
      const contentRoot = new BABYLON.TransformNode("character-content", scene);
      contentRoot.parent = renderRoot;
      contentRoot.scaling.x = -1;
      const prop = new BABYLON.TransformNode("prop", scene);
      prop._filename = "PROP.MT5";
      const worldRoot = new BABYLON.TransformNode("prop-world-parent", scene);
      worldRoot.position.set(2, 3, 4);
      worldRoot.rotation.y = -0.5;
      if (sceneObject) prop.parent = worldRoot;
      const controller = Mt5Loader.sourceTransformMatrix({
        scl: { x: 1, y: 1, z: 1 },
        rot: { x: 0.2, y: -0.7, z: 0.4 },
        pos: { x: 0.5, y: 1, z: 0.2 },
      });
      const runtime = new NativeAseqAttachedObjectRuntime({
        definitions: { PROP: {
          browserFilename: "PROP.MT5", sceneObject,
          attachments: [{
            activityId: "shot", frame: 0, parentActorTag: "AKIR", controlId: 18,
            translation: [0.1, 0.2, 0.3], rotationRaw: [8192, 0, 0],
          }],
        } },
        resolveSceneObject: () => ({ root: prop }),
        resolveActor: () => ({ root: actorRoot, model: {
          renderRoot,
          latestControllerFamily: { nodes: [{ index: 0, type: 18 }] },
          latestControllerMatrices: [controller],
        } }),
      });
      await runtime.load([prop]);
      runtime.beginActivity({ activityId: "shot", actors: ["PROP"] });
      prop.setEnabled(true);
      assert.equal(runtime.update(0), true);
      assert.equal(prop.parent, sceneObject ? worldRoot : renderRoot);
      const local = Mt5Loader.sourceTransformMatrix({
        scl: { x: 1, y: 1, z: 1 },
        rot: { x: Math.PI / 4, y: 0, z: 0 },
        pos: { x: 0.1, y: 0.2, z: 0.3 },
      });
      const sourceToWorld = BABYLON.Matrix.FromArray(Mt5Loader.rowMultiply(local, controller))
        .multiply(contentRoot.computeWorldMatrix(true));
      // Check both grip position and orientation against the rendered rig's
      // source space. The prop geometry has already been reflected by loading.
      for (const point of [BABYLON.Vector3.Zero(), new BABYLON.Vector3(0.2, 0.4, -0.1)]) {
        const expected = BABYLON.Vector3.TransformCoordinates(point, sourceToWorld);
        const actual = BABYLON.Vector3.TransformCoordinates(
          new BABYLON.Vector3(-point.x, point.y, point.z), prop.computeWorldMatrix(true),
        );
        assert.ok(BABYLON.Vector3.Distance(expected, actual) < 1e-5);
      }
      runtime.clear();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
}

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
              activityId: "activity-20",
              frame: 5,
              parentActorTag: "SORY",
              controlId: 12,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            {
              activityId: "activity-20",
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
          renderRoot: parentRoot,
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
    assert.equal(runtime.beginActivity({ activityId: "activity-20" }), 2);
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
          renderRoot: parentRoot,
          latestControllerFamily: { nodes: [{ index: 2, type: 18 }] },
          latestControllerMatrices: [],
        },
      }),
    });
    await runtime.load([mirror]);
    runtime.beginActivity({ activityId: "activity-20" });
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
      renderRoot: actor.root,
      latestControllerFamily: { nodes: [{ index: 0, type: 18 }] },
      latestControllerMatrices: [matrix],
    };
    const runtime = new NativeAseqAttachedObjectRuntime({
      definitions: {
        CAN1: {
          browserFilename: "S1_D000_COKS520G.MT5",
          attachments: [
            {
              activityId: "activity-22",
              frame: 160,
              parentActorTag: "AKIR",
              controlId: 18,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            {
              activityId: "activity-22",
              frame: 255,
              parentActorTag: "YKHI",
              controlId: 18,
              translation: [0, 0, 0],
              rotationRaw: [0, 0, 0],
            },
            { activityId: "activity-22", frame: 1810, action: "detach" },
          ],
        },
      },
      resolveActor: tag => actors.get(tag),
    });
    await runtime.load([can]);
    assert.equal(runtime.beginActivity({ activityId: "activity-22" }), 3);
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
            activityId: "activity-22",
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
            activityId: "activity-0",
            frame: 1,
            parentActorTag: "AKIR",
            controlId: 18,
            translation: [0, 0, 0],
            rotationRaw: [0, 0, 0],
          }],
          presentation: [
            { activityId: "activity-0", frame: 350, visible: true },
            { activityId: "activity-0", frame: 800, visible: false },
          ],
          nodeTransforms: [
            { activityId: "activity-0", frame: 1, nodeKey: 0x98, mode: "set", rotationRaw: [0, 0, 10] },
            { activityId: "activity-0", firstFrame: 400, lastFrame: 423, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, 20] },
            { activityId: "activity-0", firstFrame: 752, lastFrame: 775, nodeKey: 0x98, mode: "add", rotationRaw: [0, 0, -20] },
          ],
        },
      },
      resolveActor: () => ({
        root: parentRoot,
        model: {
          renderRoot: parentRoot,
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
    runtime.beginActivity({ activityId: "activity-0" });
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
