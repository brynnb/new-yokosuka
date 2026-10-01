import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { CharacterRuntime } from "../play/characters/CharacterRuntime.js";
import { AnimationStateMachine } from "../play/characters/AnimationStateMachine.js";
import { buildNativeClothBodyColliders } from "../play/characters/NativeClothCollision.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { MotnLoader } from "../src/MotnLoader.js";
import { evaluateRyoMotnFrame } from "../src/RyoMotnRuntime.js";
import { RYO_YK_RENDER_MATRIX_ROUTES } from "../src/RuntimeMatrixRecording.js";

const bodyPath = "public/models/S2_YDB1_YKC_M.MT5";
const shoesPath = "public/models/S3_DGCT_YKB_M.MT5";
const motionPath = ".disc-work/runtime-motion/MOTION.BIN";
const hasAssets = [bodyPath, shoesPath, motionPath].every(path => fs.existsSync(path));
const arrayBuffer = path => {
  const bytes = fs.readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

function runtimeFor(scene) {
  return new CharacterRuntime({
    scene,
    renderMatrixByKey: new Map(RYO_YK_RENDER_MATRIX_ROUTES),
    fetchArrayBuffer: async path => arrayBuffer(path),
  });
}

test("gameplay animates native jacket cloth with live collision controllers after cutscene release", {
  skip: !hasAssets && "requires locally extracted Ryo assets",
}, async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = runtimeFor(scene);
    const { loader, root, presentationModel } = await runtime.createModel({
      label: "Ryo", model: "S2_YDB1_YKC_M.MT5", modelUrl: bodyPath, ryoHeadAtlasFix: true,
    });
    const actorRoot = new BABYLON.TransformNode("player", scene);
    root.parent = actorRoot;
    const animation = new AnimationStateMachine({
      renderMatrixByKey: runtime.renderMatrixByKey,
      emotes: [], runtimeEmotes: [], pickerEmoteIds: new Set(), gameTicksPerSecond: 30,
      emoteBlendTicks: 3, locomotionBlendSeconds: 0.1, locomotionStates: new Set(["idle", "walk"]),
      applyPose: ({ routedMatrices, controllerMatrices }) => runtime.applyHumanoidAnimationPose(
        loader, root, runtime.retarget(routedMatrices), controllerMatrices),
    });
    const names = { idle: "AKI_AKI_STAND_DOWN_LP", walk: "A_WALK_L_02" };
    const motions = MotnLoader.parse(arrayBuffer(motionPath), { sequenceNames: Object.values(names) });
    animation.clips = Object.fromEntries(Object.entries(names).map(([state, name]) =>
      [state, animation.buildClip(motions, name)]));
    animation.apply();
    runtime.updateSecondaryMotion(root, 1 / 30);
    const cloth = runtime.nativeClothStates.get(root);
    assert.equal(cloth.acquired, true);
    assert.equal(presentationModel.latestControllerMatrices.length, 37);
    const body = root.getChildMeshes().find(m => m._mt5NodeAddress === 0xce48 && m.name === "mt5_tex_0");
    assert.ok(body.skeleton === root._mt5CharacterGpuRig.skeleton);
    const positions = Array.from(body.getVerticesData("position"));
    const garment = root.getChildMeshes().filter(m => m._mt5NativeClothSide);
    assert.ok(garment.every(m => m.skeleton === null && m.material.backFaceCulling));
    assert.ok(cloth.seamGroups.length > 0, "the jacket's authored panel join must be discovered");
    const assertConnectedGarment = () => {
      for (const seam of cloth.seamGroups) {
        const owners = new Set(seam.map(vertex => cloth.groups[vertex.nodeIndex].group.controlNode.parentAddr));
        assert.equal(owners.size, 1, "different attachment owners must not be sewn together");
        const points = seam.map(vertex => Array.from(vertex.child.getVerticesData("position")
          .slice(vertex.vertexIndex * 3, vertex.vertexIndex * 3 + 3)));
        for (const point of points) assert.deepEqual(point, points[0]);
      }
    };
    assertConnectedGarment();
    const colliders = () => buildNativeClothBodyColliders({
      modelCode: presentationModel.modelCode,
      controllerFamily: presentationModel.latestControllerFamily,
      controllerMatrices: presentationModel.latestControllerMatrices,
      characterSpaceMatrix: root._mt5CharacterContentRoot.computeWorldMatrix(true),
    });
    const before = colliders();
    assert.equal(before.length, 7);
    actorRoot.position.x = 3;
    const moved = colliders();
    for (let i = 0; i < before.length; i++) {
      assert.ok(Math.abs(moved[i].center[0] - before[i].center[0] - 3) < 1e-5);
      assert.equal(moved[i].radius, before[i].radius);
    }
    for (let tick = 0; tick < 30; tick++) {
      animation.update(1 / 30, "walk");
      runtime.updateSecondaryMotion(root, 1 / 30);
      assertConnectedGarment();
    }
    assert.ok(cloth.runtimeSeconds > 1);
    assert.deepEqual(Array.from(body.getVerticesData("position")), positions, "only garment buffers change");
    assert.notDeepEqual(colliders().map(c => c.center), moved.map(c => c.center), "collisions follow the walking pose");
    // AUTH and gameplay borrow this same model state. A render-only handoff
    // remains safe, and gameplay reacquires from a fresh full pose afterward.
    const owner = {};
    assert.equal(cloth.beginPresentation(owner), true);
    assert.equal(runtime.updateSecondaryMotion(root, 1 / 30), false);
    const seconds = cloth.runtimeSeconds;
    assert.equal(cloth.update(1 / 30), false);
    assert.equal(cloth.runtimeSeconds, seconds);
    cloth.endPresentation(owner);
    runtime.applyCharacterRigWorldMatrices(loader, root, presentationModel.latestRetargetedRoutes);
    runtime.updateSecondaryMotion(root, 1 / 30);
    assert.equal(cloth.acquired, false);
    assert.ok(garment.every(m => m.skeleton === body.skeleton));
    animation.apply();
    runtime.updateSecondaryMotion(root, 1 / 30);
    assert.ok(runtime.nativeClothStates.get(root) === cloth);
    assert.equal(cloth.acquired, true);
    assertConnectedGarment();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("grounding measures current GPU bones, not bind-pose geometry", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const root = new BABYLON.TransformNode("root", scene);
    root.position.y = 10;
    const mesh = BABYLON.MeshBuilder.CreateBox("foot", { size: 2 }, scene);
    mesh.parent = root;
    const skeleton = new BABYLON.Skeleton("rig", "rig", scene);
    const bone = new BABYLON.Bone("foot", skeleton, null, BABYLON.Matrix.Identity());
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 1;
    mesh.setVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind,
      new Float32Array(mesh.getTotalVertices() * 4), false, 4);
    const weights = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
    mesh.setVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind, weights, false, 4);
    bone.setPosition(new BABYLON.Vector3(0, -3, 0));
    const positions = Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind));
    assert.equal(runtimeFor(scene).minimumWorldY(root), 6);
    assert.deepEqual(Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)), positions);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("playable Ryo's body and jacket exteriors share lighting orientation while linings remain one-sided", {
  skip: !hasAssets && "requires locally extracted Ryo assets",
}, async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const { root } = await runtimeFor(scene).createModel({
      label: "Ryo", model: "S2_YDB1_YKC_M.MT5", modelUrl: bodyPath,
      texturePackUrl: "public/models/S2_YDB1_textures.bin", ryoHeadAtlasFix: true,
    });
    const body = root.getChildMeshes().find(mesh => mesh._mt5NodeAddress === 0xce48 && mesh.name === "mt5_tex_0");
    const exterior = root.getChildMeshes().filter(mesh => mesh._mt5NativeClothSide === "exterior");
    const lining = root.getChildMeshes().filter(mesh => mesh._mt5NativeClothSide === "lining");
    assert.ok(body && exterior.length === 2 && lining.length === 2);
    assert.equal(body.sideOrientation, BABYLON.Material.ClockWiseSideOrientation);
    assert.equal(body.material.backFaceCulling, false);
    assert.equal(body.material.twoSidedLighting, true);
    for (const mesh of exterior) {
      assert.equal(mesh.sideOrientation, body.sideOrientation);
      assert.equal(mesh.metadata.mt5TextureId, body.metadata.mt5TextureId);
    }
    for (const mesh of [...exterior, ...lining]) {
      assert.equal(mesh.material.backFaceCulling, true);
      assert.equal(mesh.material.twoSidedLighting, false);
      assert.ok(mesh.skeleton === body.skeleton);
      assert.ok(mesh.computeBonesUsingShaders);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("playable Ryo keeps posed geometry and footwear without per-frame vertex buffers", {
  skip: !hasAssets && "requires locally extracted Ryo models and MOTION.BIN",
}, async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const runtime = runtimeFor(scene);
    const { loader, root } = await runtime.createModel({
      label: "Ryo", model: "S2_YDB1_YKC_M.MT5", modelUrl: bodyPath,
      ryoHeadAtlasFix: true,
      outdoorFootwear: {
        model: "S3_DGCT_YKB_M.MT5", modelUrl: shoesPath,
        renderKeys: [18, 19, 23, 24],
      },
    });
    assert.ok(root._mt5CharacterGpuRig);
    assert.ok(root._mt5OutdoorFootwear.root._mt5CharacterGpuRig);
    // The gameplay presenter calls cloth after body animation, even for
    // render-matrix-only actors. Missing solver inputs must not detach the
    // jacket from the GPU rig (the old CPU bake masked this ownership bug).
    runtime.updateSecondaryMotion(root, 1 / 60);
    assert.equal(runtime.nativeClothStates.get(root).acquired, false);
    for (const mesh of root._mt5CharacterGpuRig.skinnedMeshes) {
      assert.equal(mesh.skeleton, root._mt5CharacterGpuRig.skeleton);
    }
    const referenceLoader = new Mt5Loader(scene, {
      characterRigMode: "baked", characterRigSeamMode: "weld",
      mirrorCharacterX: true, ryoHeadAtlasFix: true,
      ryoHeadAtlasMode: "obj-raw", textureAddressMode: "clamp",
    });
    const [reference] = await referenceLoader.load(arrayBuffer(bodyPath), null);
    const names = ["AKI_AKI_STAND_DOWN_LP", "A_WALK_L_02", "AKI_AKI_RUN_MID_LP"];
    const motions = MotnLoader.parse(arrayBuffer(motionPath), { sequenceNames: names });
    let vertexBuffers = 0;
    const originals = new Map();
    for (const key of ["createVertexBuffer", "createDynamicVertexBuffer"]) {
      const original = engine[key];
      originals.set(key, original);
      engine[key] = function (...args) { vertexBuffers++; return original.apply(this, args); };
    }
    let maximumPositionError = 0;
    try {
      for (const name of names) {
        const sequence = motions.getSequence(name);
        assert.ok(sequence, `missing test motion ${name}`);
        for (const frame of [0, 7, 15]) {
          const pose = evaluateRyoMotnFrame(sequence, frame).matrices;
          const routes = new Map(RYO_YK_RENDER_MATRIX_ROUTES.map(([key, index]) => [key, pose[index]]));
          vertexBuffers = 0;
          runtime.applyCharacterRigWorldMatrices(loader, root, routes);
          assert.equal(vertexBuffers, 0, `${name}:${frame} must only update bone matrices`);
          root._mt5CharacterGpuRig.skeleton.prepare(true);
          referenceLoader.applyCharacterRigWorldMatrices(reference, routes);
          for (const [index, node] of root._mt5Nodes.entries()) {
            const meshes = node.mesh.getChildren().filter(m => m._mt5SourcePositions);
            const expectedMeshes = reference._mt5Nodes[index].mesh.getChildren()
              .filter(m => m._mt5SourcePositions);
            assert.equal(meshes.length, expectedMeshes.length);
            for (const [part, mesh] of meshes.entries()) {
              const actual = mesh.getPositionData(true, true);
              const expected = expectedMeshes[part].getPositionData(true, true);
              assert.equal(actual.length, expected.length);
              for (let i = 0; i < actual.length; i++) {
                maximumPositionError = Math.max(maximumPositionError, Math.abs(actual[i] - expected[i]));
              }
            }
          }
          // Controllers/attachments continue to receive the complete authored pose.
          assert.deepEqual(root._mt5CharacterWorldMatrices,
            loader.characterRigWorldMatrices(root, routes));
          assert.ok(root._mt5OutdoorFootwear.root._mt5CharacterWorldMatrices.size > 0);
        }
      }
    } finally {
      for (const [key, original] of originals) engine[key] = original;
    }
    assert.ok(maximumPositionError < 0.0001, `GPU/baked position error: ${maximumPositionError}`);
    const footKeys = new Set([18, 19, 23, 24]);
    const footwear = root._mt5OutdoorFootwear;
    for (const outdoor of [true, false, true]) {
      // Populate first to prove visibility changes invalidate the cached set.
      loader.characterRigSourceBoundsByNode(root);
      runtime.setOutdoorFootwear(root, outdoor);
      const bounds = loader.characterRigSourceBoundsByNode(root);
      assert.equal(footwear.root.isEnabled(), outdoor);
      for (const node of root._mt5Nodes) {
        if (!footKeys.has(runtime.signedRenderKey(node))) continue;
        assert.equal(node.mesh.isEnabled(), !outdoor);
        if (outdoor) assert.equal(bounds.has(node.addr), false);
      }
    }
    const skeletons = scene.skeletons.length;
    root.dispose(false, true);
    assert.equal(scene.skeletons.length, skeletons - 2, "both body and footwear skeletons are disposed");
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
