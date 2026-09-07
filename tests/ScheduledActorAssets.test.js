import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../src/Mt5Loader.js";

const completeAssetManifest = JSON.parse(
  fs.readFileSync("play/data/scheduled-actor-assets.json", "utf8"),
);

function arrayBuffer(filename) {
  const bytes = fs.readFileSync(filename);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

test("DOR_L preserves opaque jacket pixels in its blended hair atlas", async () => {
  const model = arrayBuffer("play/assets/characters/DOR_L.CHRM");
  const textures = arrayBuffer("play/assets/characters/DOR_textures.bin");
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      backFaceCulling: false,
      mirrorCharacterX: true,
      nativeTwiddledRectUV: true,
      textureAddressMode: "clamp",
      characterRigMode: "gpu",
      characterRigSeamMode: "weld",
    });
    loader.setTexturePackIndex(
      Mt5Loader.buildTexturePackIndex(textures),
      null,
      textures,
      null,
    );
    const [root] = await loader.load(model, textures);
    assert.deepEqual(
      root._mt5CharacterContentRoot?.scaling.asArray(),
      [-1, 1, 1],
    );
    assert.equal(
      root._mt5Nodes
        .filter((node) => node.mesh)
        .every((node) => (
          node.mesh.parent === root._mt5CharacterContentRoot
        )),
      true,
    );
    const blendedMaterials = new Set(
      root.getChildMeshes()
        .map((mesh) => mesh.material)
        .filter((material) => (
          material?.transparencyMode
          === BABYLON.StandardMaterial.MATERIAL_ALPHABLEND
        )),
    );

    assert.ok(blendedMaterials.size > 0);
    for (const material of blendedMaterials) {
      assert.equal(material.alpha, 1);
      assert.equal(material.useAlphaFromDiffuseTexture, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("exact-edge HUMANS atlases clamp instead of sampling the opposite edge", async () => {
  const model = arrayBuffer("play/assets/characters/BLA_M.CHRM");
  const textures = arrayBuffer("play/assets/characters/BLA_textures.bin");
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, {
      nativeTwiddledRectUV: true,
      textureAddressMode: "clamp",
      characterRigMode: "gpu",
      characterRigSeamMode: "weld",
    });
    loader.setTexturePackIndex(
      Mt5Loader.buildTexturePackIndex(textures),
      null,
      textures,
      null,
    );
    const [root] = await loader.load(model, textures);
    const texturedMeshes = root.getChildMeshes().filter(
      mesh => mesh.material?.diffuseTexture,
    );
    assert.ok(texturedMeshes.length > 0);
    assert.equal(
      texturedMeshes.every(mesh => (
        mesh.material.diffuseTexture.wrapU
          === BABYLON.Texture.CLAMP_ADDRESSMODE
        && mesh.material.diffuseTexture.wrapV
          === BABYLON.Texture.CLAMP_ADDRESSMODE
      )),
      true,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("every source-mapped scheduled actor asset instantiates losslessly", async () => {
  for (const asset of completeAssetManifest.assets) {
    const model = arrayBuffer(
      `play/assets/characters/${asset.modelFile}`,
    );
    const textures = arrayBuffer(
      `play/assets/characters/${asset.textureFile}`,
    );
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
      const loader = new Mt5Loader(scene, {
        backFaceCulling: true,
        nativeTwiddledRectUV: true,
        characterRigMode: "gpu",
        characterRigSeamMode: "weld",
        materialSideOrientation: BABYLON.Material.ClockWiseSideOrientation,
      });
      loader.setTexturePackIndex(
        Mt5Loader.buildTexturePackIndex(textures),
        null,
        textures,
        null,
      );
      const [root] = await loader.load(model, textures);
      assert.ok(root, asset.mappedModelCode);
      assert.ok(root.getChildMeshes().length > 0, asset.mappedModelCode);
      assert.ok(
        root.getChildMeshes().reduce(
          (count, mesh) => count + mesh.getTotalVertices(),
          0,
        ) > 0,
        asset.mappedModelCode,
      );
      assert.ok(root._mt5CharacterGpuRig, asset.mappedModelCode);
      assert.equal(
        root.getChildMeshes()
          .filter((mesh) => mesh.getTotalVertices() > 0)
          .every((mesh) => (
            mesh.skeleton === root._mt5CharacterGpuRig.skeleton
            && mesh.computeBonesUsingShaders
          )),
        true,
        `${asset.mappedModelCode} is not fully GPU skinned`,
      );
      assert.equal(
        loader.textureCache.size,
        loader.textureIds.size,
        `${asset.mappedModelCode} has missing textures`,
      );
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
});
