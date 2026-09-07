import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  createNativeAseqFacialPresentation,
} from "../play/events/NativeAseqFacialPresentation.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import {
  nativeTalkActorPoses,
  parseNativeTalkPoseAsset,
} from "../src/NativeTalkPoses.js";

const manifest = JSON.parse(fs.readFileSync(
  "play/assets/cutscenes/native-faces/manifest.generated.json",
  "utf8",
));
const audio = JSON.parse(fs.readFileSync(
  "public/audio/world/drauth/manifest.json",
  "utf8",
));
const ybhnAudio = JSON.parse(fs.readFileSync(
  "public/audio/world/ybhn/manifest.json",
  "utf8",
));
const bebfAudio = JSON.parse(fs.readFileSync(
  "public/audio/world/bebf/manifest.json",
  "utf8",
));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function arrayBuffer(filename) {
  const value = fs.readFileSync(filename);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

test("every declared native face has exact presentation assets", () => {
  assert.equal(manifest.schema, "new-yokosuka-native-face-pack-v1");
  const voicedActors = [...new Set(
    [...audio.voices, ...ybhnAudio.voices].map(record => record.speakerId),
  )].sort();
  assert.deepEqual(
    voicedActors.filter(actorTag => !Object.hasOwn(manifest.facialAssets, actorTag)),
    [],
  );

  const posePaths = new Set();
  for (const [actorTag, face] of Object.entries(manifest.facialAssets)) {
    assert.equal(face.actorTag, actorTag);
    assert.equal(face.attachmentRenderKey, -67);
    assert.equal(face.faceRootRenderKey, 3);
    assert.deepEqual(face.eyeRenderKeys, [77, 78]);
    assert.equal(face.poses.actorTag, actorTag);
    for (const asset of [face.model, face.table, face.poses]) {
      const bytes = fs.readFileSync(asset.path);
      assert.equal(bytes.length, asset.byteLength);
      assert.equal(sha256(bytes), asset.sha256);
    }
    posePaths.add(face.poses.path);
  }
  for (const [actorTag, face] of Object.entries(manifest.facialAssets)) {
    const poseAsset = parseNativeTalkPoseAsset(
      fs.readFileSync(face.poses.path),
    );
    const poses = nativeTalkActorPoses(
      poseAsset,
      actorTag,
      face.table.sha256,
    );
    assert.equal(poses.upperPoses.length, 80);
    assert.equal(poses.mouthPoses.length, 80);
  }
  assert.equal(posePaths.size, 3);
});

test("named native face variants preserve authored actor identity", () => {
  const face = manifest.facialVariants.JKB;
  assert.equal(face.actorTag, "JAKR");
  assert.equal(face.bodyModelCode, "JKB_M");
  assert.equal(face.faceCode, "JKB");
  for (const asset of [face.model, face.table, face.poses]) {
    const bytes = fs.readFileSync(asset.path);
    assert.equal(bytes.length, asset.byteLength);
    assert.equal(sha256(bytes), asset.sha256);
  }
  const poseAsset = parseNativeTalkPoseAsset(fs.readFileSync(face.poses.path));
  const poses = nativeTalkActorPoses(poseAsset, "JAKR", face.table.sha256);
  assert.equal(poses.upperPoses.length, 80);
  assert.equal(poses.mouthPoses.length, 80);
  assert.notEqual(face.model.sha256, manifest.facialAssets.JAKR.model.sha256);
});

test("packaged Dobuita detailed faces apply each actor's authored speech poses", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    for (const [actorTag, bodyModelCode] of [
      ["SMTH", "GIB_M"],
      ["TONY", "GIJ_M"],
    ]) {
      const bodyLoader = new Mt5Loader(scene, {
        backFaceCulling: false,
        mirrorCharacterX: true,
        nativeTwiddledRectUV: true,
        textureAddressMode: "clamp",
        characterRigMode: "gpu",
        characterRigSeamMode: "weld",
        materialSideOrientation: null,
      });
      const [renderRoot] = await bodyLoader.load(
        arrayBuffer(`play/assets/characters/${bodyModelCode}.CHRM`),
        null,
        { sourceFilename: `${bodyModelCode}.CHRM` },
      );
      bodyLoader.invalidateCharacterRigSourceBounds(renderRoot);
      bodyLoader.mergeCharacterGpuRigMeshes(renderRoot, {
        preserveRenderKeySubtrees: [-0x43, -0x42, -0x41],
      });
      bodyLoader.applyCharacterRigWorldMatrices(renderRoot, null);

      const root = new BABYLON.TransformNode(`actor_${actorTag}`, scene);
      renderRoot.parent = root;
      const model = {
        loader: bodyLoader,
        root,
        renderRoot,
        modelCode: bodyModelCode,
      };
      const faces = createNativeAseqFacialPresentation({
        scene,
        actors: {
          activeActor: value => value === actorTag
            ? { actorCode: actorTag, root, model }
            : null,
          componentWorldPosition: () => null,
        },
        definitions: { [actorTag]: manifest.facialAssets[actorTag] },
        loadAsset: filename => arrayBuffer(filename),
      });
      await faces.prepare({ actors: [actorTag] });

      const owner = {};
      assert.equal(faces.begin(owner, [actorTag]), true);
      assert.equal(faces.apply(owner, { frame: 0 }), true);
      const primaryMesh = faces.entries.get(actorTag).primaryMeshes[0];
      const neutral = Array.from(primaryMesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      ));
      const voice = audio.voices.find(record => (
        record.speakerId === actorTag
      ));
      assert.ok(voice?.lipSync, actorTag);
      assert.equal(faces.play(owner, { name: "voice", audio: voice }), true);
      assert.equal(faces.apply(owner, { frame: 4 }), true);
      const speaking = Array.from(primaryMesh.getVerticesData(
        BABYLON.VertexBuffer.PositionKind,
      ));
      assert.notDeepEqual(speaking, neutral, actorTag);
      const integration = faces.active.faces.get(actorTag).surfaceIntegration;
      assert.ok(integration.removedTriangleCount > 0, actorTag);
      assert.ok(integration.retainedTriangleCount > 0, actorTag);
      assert.equal(faces.end(owner), true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("BEBF Shenhua FACE integrates with the exact canonical JOMO body", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    const bodyLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      nativeTwiddledRectUV: true,
      textureAddressMode: "clamp",
      characterRigMode: "gpu",
      characterRigSeamMode: "weld",
      materialSideOrientation: null,
    });
    const [renderRoot] = await bodyLoader.load(
      arrayBuffer("public/models/S3_JOMO_SIN_M.MT5"),
      null,
      { sourceFilename: "S3_JOMO_SIN_M.MT5" },
    );
    bodyLoader.invalidateCharacterRigSourceBounds(renderRoot);
    bodyLoader.mergeCharacterGpuRigMeshes(renderRoot, {
      preserveRenderKeySubtrees: [-0x43, -0x42, -0x41],
    });
    bodyLoader.applyCharacterRigWorldMatrices(renderRoot, null);
    const root = new BABYLON.TransformNode("actor_SINF", scene);
    renderRoot.parent = root;
    const model = {
      loader: bodyLoader,
      root,
      renderRoot,
      modelCode: "SIN_M",
    };
    const faces = createNativeAseqFacialPresentation({
      scene,
      actors: {
        activeActor: actorTag => actorTag === "SINF"
          ? { actorCode: "SINF", root, model }
          : null,
        componentWorldPosition: () => null,
      },
      definitions: { SINF: manifest.facialAssets.SINF },
      loadAsset: filename => arrayBuffer(filename),
    });
    await faces.prepare({ actors: ["SINF"] });
    const owner = {};
    assert.equal(faces.begin(owner, ["SINF"]), true);
    const voice = bebfAudio.voices.find(value => value.speakerId === "SINF");
    assert.ok(voice?.lipSync);
    assert.equal(faces.play(owner, { name: "voice", audio: voice }), true);
    assert.equal(faces.apply(owner, { frame: 4 }), true);
    const integration = faces.active.faces.get("SINF").surfaceIntegration;
    assert.ok(integration.removedTriangleCount > 0);
    assert.ok(integration.retainedTriangleCount > 0);
    assert.equal(faces.end(owner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("SAKR young-Ryo FACE integrates with the exact JKB body variant", async () => {
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new BABYLON.Scene(engine);
  try {
    const bodyLoader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      nativeTwiddledRectUV: true,
      textureAddressMode: "clamp",
      characterRigMode: "gpu",
      characterRigSeamMode: "weld",
      materialSideOrientation: null,
    });
    const [renderRoot] = await bodyLoader.load(
      arrayBuffer("extracted_files/data/SCENE/01/MODEL/CHARA/JKB_M.MT5"),
      null,
      { sourceFilename: "S1_YD01_JKB_M.MT5" },
    );
    bodyLoader.invalidateCharacterRigSourceBounds(renderRoot);
    bodyLoader.mergeCharacterGpuRigMeshes(renderRoot, {
      preserveRenderKeySubtrees: [-0x43, -0x42, -0x41],
    });
    bodyLoader.applyCharacterRigWorldMatrices(renderRoot, null);
    const root = new BABYLON.TransformNode("actor_JAKR", scene);
    renderRoot.parent = root;
    const model = { loader: bodyLoader, root, renderRoot, modelCode: "JKB_M" };
    const faces = createNativeAseqFacialPresentation({
      scene,
      actors: {
        activeActor: actorTag => actorTag === "JAKR"
          ? { actorCode: "JAKR", root, model }
          : null,
        componentWorldPosition: () => null,
      },
      definitions: { JAKR: manifest.facialVariants.JKB },
      loadAsset: filename => arrayBuffer(filename),
    });
    await faces.prepare({ actors: ["JAKR"] });
    const owner = {};
    assert.equal(faces.begin(owner, ["JAKR"]), true);
    const voice = JSON.parse(fs.readFileSync(
      "public/audio/world/sakr/manifest.json",
    )).voices.find(value => value.speakerId === "JAKR");
    assert.ok(voice?.lipSync);
    assert.equal(faces.play(owner, { name: "voice", audio: voice }), true);
    assert.equal(faces.apply(owner, { frame: 4 }), true);
    const integration = faces.active.faces.get("JAKR").surfaceIntegration;
    // JKB's body attachment is only the replaceable low-detail face surface,
    // so unlike the adult bodies no body-side triangles remain at this node.
    assert.ok(integration.removedTriangleCount > 0);
    assert.equal(integration.retainedTriangleCount, 0);
    assert.equal(faces.end(owner), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
