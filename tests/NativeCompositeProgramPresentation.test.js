import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  NativeCompositeProgramPresentation,
} from "../play/events/NativeCompositeProgramPresentation.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import { Mt5Loader } from "../src/Mt5Loader.js";

function closeQuaternion(actual, expected) {
  for (const key of ["x", "y", "z", "w"]) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, key);
  }
}

test("composite presentation replays native transforms and restores its owner", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("ryo", scene);
    root.position.set(9, 8, 7);
    root.rotation.set(0.1, 0.2, 0.3);
    root.scaling.set(2, 2, 2);
    const body = BABYLON.MeshBuilder.CreateBox("body", {}, scene);
    body.parent = root;
    const original = {
      position: root.position.asArray(),
      rotation: root.rotation.asArray(),
      scaling: root.scaling.asArray(),
      enabled: root.isEnabled(),
      visible: body.isVisible,
    };
    const state = createNativeSceneGameplayState();
    state.writeObjectVector("AKIR", [1, 2, 3].map(nativeFloat32Word));
    // Room history for an actor outside this program is deliberately ignored
    // when the ownership cursor is established.
    state.writeObjectRuntimeFlag("ROOM", true);
    const actor = {
      actorCode: "AKIR",
      root,
      associatedSecondaryVectorKind: "float32-position",
    };
    const syncs = [];
    const presentation = new NativeCompositeProgramPresentation({
      sceneState: state,
      resolveProgramActor: (_owner, tag) => tag === "AKIR" ? actor : null,
      syncActorTransform: tag => syncs.push(tag),
    });
    const owner = {};

    assert.equal(presentation.begin(owner, ["AKIR"]), true);
    assert.deepEqual(root.position.asArray(), [-1, 2, 3]);

    state.applyObjectVectorOperation({
      objectTag: "AKIR",
      flags: 0x38000000,
      vector: [0, 0x00004000, 0],
    });
    state.writeObjectPresentationFlag("AKIR", false);
    state.writeObjectRuntimeFlag("AKIR", false);
    assert.equal(presentation.update(owner), 3);
    closeQuaternion(
      root.rotationQuaternion,
      Mt5Loader.sourceOrderQuaternion(0, -Math.PI / 2, 0),
    );
    assert.equal(body.isVisible, false);
    assert.equal(root.isEnabled(), false);

    state.writeObjectPresentationFlag("AKIR", true);
    state.writeObjectRuntimeFlag("AKIR", true);
    assert.equal(presentation.update(owner), 2);
    assert.equal(body.isVisible, true);
    assert.equal(root.isEnabled(), true);

    state.applyObjectVectorOperation({
      objectTag: "AKIR",
      flags: 0x78000000,
      vector: [-4, 5, 6].map(nativeFloat32Word),
    });
    assert.equal(presentation.update(owner), 1);
    assert.deepEqual(root.position.asArray(), [4, 5, 6]);
    assert.deepEqual(syncs, ["AKIR", "AKIR", "AKIR"]);

    assert.equal(presentation.end(owner), true);
    assert.deepEqual(root.position.asArray(), original.position);
    assert.deepEqual(root.rotation.asArray(), original.rotation);
    assert.deepEqual(root.scaling.asArray(), original.scaling);
    assert.equal(root.rotationQuaternion, null);
    assert.equal(root.isEnabled(), original.enabled);
    assert.equal(body.isVisible, original.visible);
    assert.deepEqual(syncs, ["AKIR", "AKIR", "AKIR", "AKIR"]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite presentation requires explicit ownership for live mutations", () => {
  const state = createNativeSceneGameplayState();
  const presentation = new NativeCompositeProgramPresentation({
    sceneState: state,
    resolveProgramActor: (_owner, tag) => (
      tag === "VIRT" ? { actorCode: tag, stateOnly: true } : null
    ),
  });
  const owner = {};
  presentation.begin(owner, ["VIRT"]);
  state.writeObjectVector("VIRT", [0, 0, 0]);
  assert.equal(presentation.update(owner), 1);

  state.writeObjectRuntimeFlag("MISS", true);
  assert.throws(
    () => presentation.update(owner),
    /unowned actor MISS/,
  );
  assert.throws(
    () => presentation.end({}),
    /owner is not active/,
  );
  assert.equal(presentation.end(owner), true);
});

test("composite presentation applies and restores native object scale", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("scaled", scene);
    root.scaling.set(2, 3, 4);
    const state = createNativeSceneGameplayState();
    state.writeObjectScaleVector(
      "KOI0",
      [1.4, 0.75, 1.25].map(nativeFloat32Word),
    );
    const presentation = new NativeCompositeProgramPresentation({
      sceneState: state,
      resolveProgramActor: () => ({ actorCode: "KOI0", root }),
    });
    const owner = {};

    presentation.begin(owner, ["KOI0"]);
    assert.deepEqual(
      root.scaling.asArray(),
      [Math.fround(1.4), Math.fround(0.75), Math.fround(1.25)],
    );
    presentation.end(owner);
    assert.deepEqual(root.scaling.asArray(), [2, 3, 4]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite presentation fails closed when a declared actor has no root", () => {
  const state = createNativeSceneGameplayState();
  const presentation = new NativeCompositeProgramPresentation({
    sceneState: state,
    resolveProgramActor: () => ({ actorCode: "AKIR" }),
  });
  assert.throws(
    () => presentation.begin({}, ["AKIR"]),
    /has no presentation root/,
  );
});

test("associated secondary vectors require exact per-actor presentation", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("cat", scene);
    const state = createNativeSceneGameplayState();
    const actor = { actorCode: "CATM", root };
    const presentation = new NativeCompositeProgramPresentation({
      sceneState: state,
      resolveProgramActor: () => actor,
    });
    const owner = {};
    presentation.begin(owner, ["CATM"]);
    state.applyObjectVectorOperation({
      objectTag: "CATM",
      flags: 0x78000000,
      vector: [0, 0x00004000, 0],
    });
    assert.throws(
      () => presentation.update(owner),
      /no exact associated secondary-vector presentation/,
    );
    assert.equal(presentation.end(owner), true);

    actor.associatedSecondaryVectorKind = "fixed-turn-rotation";
    const nextOwner = {};
    presentation.begin(nextOwner, ["CATM"]);
    state.applyObjectVectorOperation({
      objectTag: "CATM",
      flags: 0x78000000,
      vector: [0, 0x00004000, 0],
    });
    assert.equal(presentation.update(nextOwner), 1);
    closeQuaternion(
      root.rotationQuaternion,
      Mt5Loader.sourceOrderQuaternion(0, -Math.PI / 2, 0),
    );
    presentation.end(nextOwner);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite presentation rolls back a partially invalid update", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const ryoRoot = new BABYLON.TransformNode("ryo", scene);
    ryoRoot.position.set(8, 7, 6);
    const body = BABYLON.MeshBuilder.CreateBox("body", {}, scene);
    body.parent = ryoRoot;
    const catRoot = new BABYLON.TransformNode("cat", scene);
    const actors = new Map([
      ["AKIR", { actorCode: "AKIR", root: ryoRoot }],
      ["CATM", { actorCode: "CATM", root: catRoot }],
    ]);
    const state = createNativeSceneGameplayState();
    const presentation = new NativeCompositeProgramPresentation({
      sceneState: state,
      resolveProgramActor: (_owner, tag) => actors.get(tag),
    });
    const owner = {};
    presentation.begin(owner, ["AKIR", "CATM"]);

    state.writeObjectPresentationFlag("AKIR", false);
    assert.equal(presentation.update(owner), 1);
    assert.equal(body.isVisible, false);

    state.writeObjectPresentationFlag("AKIR", true);
    state.writeObjectVector("AKIR", [1, 2, 3].map(nativeFloat32Word));
    state.applyObjectVectorOperation({
      objectTag: "CATM",
      flags: 0x78000000,
      vector: [0, 0x00004000, 0],
    });
    assert.throws(
      () => presentation.update(owner),
      /no exact associated secondary-vector presentation/,
    );
    assert.deepEqual(ryoRoot.position.asArray(), [8, 7, 6]);
    assert.equal(body.isVisible, false);

    actors.get("CATM").associatedSecondaryVectorKind = "fixed-turn-rotation";
    assert.equal(presentation.update(owner), 3);
    assert.deepEqual(ryoRoot.position.asArray(), [-1, 2, 3]);
    assert.equal(body.isVisible, true);
    presentation.end(owner);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("composite presentation follows an actor variant within one program lease", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const firstRoot = new BABYLON.TransformNode("hawk-flight", scene);
    const secondRoot = new BABYLON.TransformNode("hawk-soar", scene);
    firstRoot.position.set(1, 2, 3);
    secondRoot.position.set(4, 5, 6);
    let actor = { actorCode: "HAWK", root: firstRoot };
    const state = createNativeSceneGameplayState();
    const owner = {};
    const presentation = new NativeCompositeProgramPresentation({
      sceneState: state,
      resolveProgramActor: () => actor,
    });

    presentation.begin(owner, ["HAWK"]);
    state.writeObjectRuntimeFlag("HAWK", false);
    presentation.update(owner);
    assert.equal(firstRoot.isEnabled(), false);

    actor = { actorCode: "HAWK", root: secondRoot };
    state.writeObjectVector("HAWK", [7, 8, 9].map(nativeFloat32Word));
    presentation.update(owner);
    assert.deepEqual(secondRoot.position.asArray(), [-7, 8, 9]);
    assert.equal(firstRoot.position.x, 1);

    presentation.end(owner);
    assert.deepEqual(firstRoot.position.asArray(), [1, 2, 3]);
    assert.deepEqual(secondRoot.position.asArray(), [4, 5, 6]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
