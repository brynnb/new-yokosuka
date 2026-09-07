import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { parseTmnmMotion, sampleTmnmSequence } from "../src/TmnmMotion.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  createNativeTmnmMotionPresentation,
} from "../play/events/NativeTmnmMotionPresentation.js";
import {
  createNativeCutsceneCharacterLoader,
} from "../play/cutscenes/NativeCutsceneCharacterLoader.js";

const motion = parseTmnmMotion(readFileSync(
  "play/assets/introduction/op02/M_TORI.MOTN",
));

test("parses the exact hawk TMNM sequence inventory", () => {
  assert.deepEqual(motion.sequences.map(value => ({
    name: value.name,
    playbackKind: value.playbackKind,
    durationFrames: value.durationFrames,
    nodeCount: value.nodeCount,
  })), [
    { name: "TMN_TAK_7_FLY_KAKKU", playbackKind: "transition", durationFrames: 50, nodeCount: 58 },
    { name: "TMN_TAK_7_FLY_LP", playbackKind: "loop", durationFrames: 25, nodeCount: 58 },
    { name: "TMN_TAK_7_KAKKU_FLY", playbackKind: "transition", durationFrames: 68, nodeCount: 58 },
    { name: "TMN_TAK_7_KAKKU_LP", playbackKind: "loop", durationFrames: 24, nodeCount: 58 },
    { name: "TMN_TAK_7_KAKKU_KOGEKI", playbackKind: "transition", durationFrames: 68, nodeCount: 58 },
    { name: "TMN_TAK_8_KAKKU_KOUKA", playbackKind: "transition", durationFrames: 43, nodeCount: 54 },
    { name: "TMN_TAK_8_KOUKA_KAKKU", playbackKind: "transition", durationFrames: 27, nodeCount: 54 },
    { name: "TMN_TAK_8_KOUKA_LP", playbackKind: "loop", durationFrames: 5, nodeCount: 54 },
  ]);
});

test("keeps the hawk's blended rig nodes independently sortable", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const manifest = JSON.parse(readFileSync(
      "play/assets/introduction/op02/manifest.json",
      "utf8",
    ));
    const loadAsset = async path => {
      const bytes = readFileSync(path);
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    };
    const instantiate = createNativeCutsceneCharacterLoader({ scene, loadAsset });
    const definition = manifest.packageActors.HAWK.variants[0];
    const actor = await instantiate({
      ...definition,
      actorTag: "HAWK",
      label: "Hawk",
      characterScale: 1,
    });
    const renderMeshes = actor.model.renderRoot
      .getChildMeshes(false)
      .filter(mesh => mesh.getTotalVertices() > 0);
    assert.equal(renderMeshes.length, 58);
    assert.equal(renderMeshes.every(mesh => (
      mesh.material?._mt5AlphaMode === "blend"
      && mesh.material.backFaceCulling === false
    )), true);
    actor.root.dispose(false, true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("samples native half-float, fixed-turn, and interpolated channels", () => {
  const sequence = motion.sequences[1];
  const frame0 = sampleTmnmSequence(motion, sequence, 0);
  const frameHalf = sampleTmnmSequence(motion, sequence, 0.5);
  assert.deepEqual(frame0[0], {
    sx: 1, sy: 1, sz: 1,
    rx: 0, ry: 0, rz: 0,
    tx: 0, ty: 0, tz: 0,
  });
  assert.equal(frame0.length, 58);
  assert.ok(frameHalf.some((pose, index) => (
    pose.rx !== frame0[index].rx
    || pose.ry !== frame0[index].ry
    || pose.rz !== frame0[index].rz
  )));
});

test("installs hawk TMNM poses into the GPU character rig", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const manifest = JSON.parse(readFileSync(
      "play/assets/introduction/op02/manifest.json",
      "utf8",
    ));
    const loadAsset = async path => {
      const bytes = readFileSync(path);
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    };
    const actor = await createNativeCutsceneCharacterLoader({ scene, loadAsset })({
      ...manifest.packageActors.HAWK.variants[0],
      actorTag: "HAWK",
      label: "Hawk",
      characterScale: 1,
    });
    const { loader, renderRoot } = actor.model;
    const presentation = createNativeTmnmMotionPresentation({
      actors: { activeActor: tag => tag === "HAWK" ? actor : null },
      definition: {
        actorTag: "HAWK",
        path: "hawk-motion",
        initialSequenceIndex: 1,
      },
      loadAsset: () => motion.view.buffer.slice(
        motion.view.byteOffset,
        motion.view.byteOffset + motion.view.byteLength,
      ),
    });
    assert.equal(await presentation.prepare(), true);
    const owner = {};
    assert.equal(presentation.begin(owner, ["HAWK"]), true);
    assert.equal(presentation.apply(owner, 10), true);
    const blendedBounds = renderRoot._mt5CharacterGpuRig.skinnedMeshes
      .filter(mesh => mesh.material?._mt5AlphaMode === "blend")
      .map(mesh => mesh.getBoundingInfo().boundingBox.center.asArray()
        .map(value => value.toFixed(4)).join(","));
    assert.ok(
      new Set(blendedBounds).size > 20,
      "animated blended pieces need distinct centers for transparent sorting",
    );
    const animated = renderRoot._mt5CharacterWorldMatrices.get(
      renderRoot._mt5Nodes[1].addr,
    );
    const bind = loader.sourceWorldMatrixForNode(renderRoot._mt5Nodes[1]);
    assert.notDeepEqual(animated, bind, "wing node must receive an animated rig matrix");
    assert.equal(presentation.select(owner, 0, 10), true);
    assert.equal(presentation.apply(owner, 60), true);
    const transitionEnd = [...renderRoot._mt5CharacterWorldMatrices.get(
      renderRoot._mt5Nodes[1].addr,
    )];
    assert.equal(presentation.apply(owner, 160), true);
    assert.deepEqual(
      [...renderRoot._mt5CharacterWorldMatrices.get(renderRoot._mt5Nodes[1].addr)],
      transitionEnd,
      "a one-shot TMNM transition must hold its terminal pose",
    );
    assert.equal(presentation.select(owner, 1, 160), true);
    assert.equal(presentation.apply(owner, 170), true);
    const loopFrameTen = [...renderRoot._mt5CharacterWorldMatrices.get(
      renderRoot._mt5Nodes[1].addr,
    )];
    assert.equal(presentation.apply(owner, 195), true);
    assert.deepEqual(
      [...renderRoot._mt5CharacterWorldMatrices.get(renderRoot._mt5Nodes[1].addr)],
      loopFrameTen,
      "a native LP state must wrap from its selection-relative clock",
    );
    assert.equal(presentation.end(owner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native program resource selection drives the following AUTH activity", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      mirrorCharacterX: true,
      characterRigMode: "gpu",
    });
    const modelBytes = readFileSync("play/assets/introduction/op02/models/TAK02M7G.CHRM");
    const [renderRoot] = await loader.load(
      modelBytes.buffer.slice(
        modelBytes.byteOffset,
        modelBytes.byteOffset + modelBytes.byteLength,
      ),
      null,
      { sourceFilename: "TAK02M7G.CHRM" },
    );
    loader.mergeCharacterGpuRigMeshes(renderRoot);
    const presentation = createNativeTmnmMotionPresentation({
      actors: {
        activeActor: tag => tag === "HAWK"
          ? { model: { loader, renderRoot } }
          : null,
      },
      definition: {
        actorTag: "HAWK",
        path: "hawk-motion",
        initialSequenceIndex: 1,
        resourceIds: [0xe001, 0xe002],
      },
      loadAsset: () => motion.view.buffer.slice(
        motion.view.byteOffset,
        motion.view.byteOffset + motion.view.byteLength,
      ),
    });
    await presentation.prepare();
    const programOwner = {};
    const activityOwner = {};
    assert.equal(presentation.beginProgram(programOwner), true);
    assert.equal(presentation.applyResource(programOwner, {
      objectTag: "HAWK",
      resourceId: 0xe001,
    }), true);
    assert.equal(presentation.begin(activityOwner, ["HAWK"]), true);
    assert.equal(presentation.apply(activityOwner, 10), true);
    const carriedPose = [...renderRoot._mt5CharacterWorldMatrices.get(
      renderRoot._mt5Nodes[1].addr,
    )];
    assert.equal(presentation.end(activityOwner, "complete"), true);
    assert.deepEqual(
      [...renderRoot._mt5CharacterWorldMatrices.get(renderRoot._mt5Nodes[1].addr)],
      carriedPose,
      "a successful AUTH cut must retain the last rendered TMNM pose",
    );
    const followingActivityOwner = {};
    assert.equal(presentation.begin(followingActivityOwner, ["HAWK"]), true);
    assert.equal(presentation.apply(followingActivityOwner, 0), true);
    assert.deepEqual(
      [...renderRoot._mt5CharacterWorldMatrices.get(renderRoot._mt5Nodes[1].addr)],
      carriedPose,
      "a selected TMNM state must retain its clock across AUTH cuts",
    );
    assert.equal(presentation.end(followingActivityOwner, "complete"), true);
    assert.equal(presentation.endProgram(programOwner), true);
    assert.notDeepEqual(
      [...renderRoot._mt5CharacterWorldMatrices.get(renderRoot._mt5Nodes[1].addr)],
      carriedPose,
      "program cleanup must release the retained cinematic pose",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("TMNM resource selection requests its hierarchy-compatible model variant", async () => {
  const selections = [];
  const owner = {};
  const presentation = createNativeTmnmMotionPresentation({
    actors: {
      activeActor: () => null,
      selectProgramActorVariant(programOwner, actorTag, modelCode) {
        selections.push([programOwner, actorTag, modelCode]);
        return {};
      },
    },
    definition: {
      actorTag: "HAWK",
      path: "hawk-motion",
      initialSequenceIndex: 1,
      resourceIds: [
        0xe001, 0xe002, 0xe003, 0xe004,
        0xe005, 0xe006, 0xe007, 0xe008,
      ],
      modelCodesBySequenceIndex: [
        "TAK02M7G", "TAK02M7G", "TAK02M7G", "TAK02M7G",
        "TAK02M7G", "TAK02M8G", "TAK02M8G", "TAK02M8G",
      ],
    },
    loadAsset: () => motion.view.buffer.slice(
      motion.view.byteOffset,
      motion.view.byteOffset + motion.view.byteLength,
    ),
  });
  await presentation.prepare();
  assert.equal(presentation.beginProgram(owner), true);
  assert.equal(presentation.applyResource(owner, {
    objectTag: "HAWK",
    resourceId: 0xe006,
  }), true);
  assert.deepEqual(selections, [[owner, "HAWK", "TAK02M8G"]]);
  assert.equal(presentation.endProgram(owner), true);
});
