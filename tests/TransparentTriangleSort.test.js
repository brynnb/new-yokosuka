import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as B from "@babylonjs/core";
import { enableTransparentTriangleSorting } from "../src/rendering/TransparentTriangleSort.js";
import { loadNativeCharacterModel } from "../play/characters/NativeCharacterModelLoader.js";

test("transparent triangles follow camera depth without changing authored topology", () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  try {
    const camera = new B.FreeCamera("camera", new B.Vector3(0, 0, -10), scene);
    camera.setTarget(B.Vector3.Zero());
    const mesh = new B.Mesh("two layered sheets", scene);
    mesh.setVerticesData(B.VertexBuffer.PositionKind, [
      -1, -1, 1, 1, -1, 1, 0, 1, 1,
      -1, -1, 3, 1, -1, 3, 0, 1, 3,
    ]);
    const authored = [0, 1, 2, 3, 4, 5];
    mesh.setIndices(authored);
    const material = new B.StandardMaterial("alpha", scene);
    material.alpha = 0.7;
    material.backFaceCulling = false;
    material.separateCullingPass = true;
    mesh.material = material;
    const subMesh = mesh.subMeshes[0];
    const uploads = [];
    const update = mesh.updateIndices.bind(mesh);
    mesh.updateIndices = (indices, offset, gpuOnly) => {
      uploads.push(Array.from(indices));
      assert.equal(gpuOnly, true);
      return update(indices, offset, gpuOnly);
    };
    enableTransparentTriangleSorting(mesh);
    enableTransparentTriangleSorting(mesh);
    assert.equal(mesh.onBeforeRenderObservable.observers.length, 1);
    const draw = () => {
      mesh.computeWorldMatrix(true);
      camera.getViewMatrix(true);
      mesh.onBeforeRenderObservable.notifyObservers(mesh);
    };
    draw();
    assert.deepEqual(uploads.at(-1), [3, 4, 5, 0, 1, 2]);
    assert.equal(mesh.subMeshes[0], subMesh, "keep the active draw's submesh alive");
    assert.equal(mesh.getIndices(), authored, "picking keeps authored triangle IDs");
    assert.equal(material.backFaceCulling, false);
    assert.equal(material.separateCullingPass, false);
    assert.equal(material.alpha, 0.7);
    draw();
    assert.equal(uploads.length, 1, "unchanged order does not upload another buffer");

    camera.position.z = 10;
    camera.setTarget(B.Vector3.Zero());
    draw();
    assert.deepEqual(uploads.at(-1), authored);

    mesh.rotation.y = Math.PI;
    mesh.scaling.x = -1;
    draw();
    assert.deepEqual(uploads.at(-1), [3, 4, 5, 0, 1, 2],
      "actor transforms affect depth, not authored triangle winding");

    scene.useRightHandedSystem = true;
    camera.getViewMatrix(true);
    draw();
    assert.deepEqual(uploads.at(-1), [3, 4, 5, 0, 1, 2]);

    mesh.setIndices([3, 4, 5, 0, 1, 2]);
    draw();
    assert.deepEqual(mesh.getIndices(), [3, 4, 5, 0, 1, 2],
      "later surface-ownership edits become the new source topology");
    const count = uploads.length;
    material.alpha = 1;
    draw();
    assert.equal(uploads.length, count, "temporary opaque inspection skips sorting");
    mesh.dispose();
    assert.equal(mesh.onBeforeRenderObservable.observers.length, 0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("transparent sorting uses the posed skeleton, not the bind vertices", () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  try {
    const camera = new B.FreeCamera("camera", new B.Vector3(0, 0, -10), scene);
    camera.setTarget(B.Vector3.Zero());
    const mesh = new B.Mesh("skinned layers", scene);
    mesh.setVerticesData(B.VertexBuffer.PositionKind, [
      -1, -1, 1, 1, -1, 1, 0, 1, 1,
      -1, -1, 3, 1, -1, 3, 0, 1, 3,
    ]);
    mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
    ]);
    mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind,
      Array.from({length: 24}, (_, i) => i % 4 === 0 ? 1 : 0));
    mesh.setIndices([0, 1, 2, 3, 4, 5]);
    mesh.skeleton = new B.Skeleton("skeleton", "skeleton", scene);
    const movingBone = new B.Bone("first", mesh.skeleton, null, B.Matrix.Identity());
    new B.Bone("second", mesh.skeleton, null, B.Matrix.Identity());
    mesh.material = new B.StandardMaterial("alpha", scene);
    mesh.material.alpha = 0.5;
    let drawn;
    const update = mesh.updateIndices.bind(mesh);
    mesh.updateIndices = (indices, ...args) => {
      drawn = Array.from(indices);
      return update(indices, ...args);
    };
    enableTransparentTriangleSorting(mesh);
    const draw = () => {
      mesh.skeleton.prepare(true);
      mesh.computeWorldMatrix(true);
      camera.getViewMatrix(true);
      mesh.onBeforeRenderObservable.notifyObservers(mesh);
    };
    draw();
    assert.deepEqual(drawn, [3, 4, 5, 0, 1, 2]);
    movingBone.setPosition(new B.Vector3(0, 0, 5));
    draw();
    assert.deepEqual(drawn, [0, 1, 2, 3, 4, 5]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native character loading sorts blended hair without changing alpha or batching it away", async () => {
  const engine = new B.NullEngine();
  const buffer = path => {
    const bytes = readFileSync(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  };
  try {
    for (const code of ["YHI_L", "DOR_L"]) {
      const scene = new B.Scene(engine);
      try {
        const {renderRoot} = await loadNativeCharacterModel({
          scene,
          modelBuffer: buffer(`play/assets/characters/${code}.CHRM`),
          texturePack: buffer(`play/assets/characters/${code.slice(0, 3)}_textures.bin`),
          sourceFilename: `${code}.CHRM`,
        });
        const blended = renderRoot._mt5CharacterGpuRig.skinnedMeshes.filter(
          mesh => mesh.isEnabled() && mesh.material?._mt5AlphaMode === "blend",
        );
        assert.ok(blended.length > 0);
        for (const mesh of blended) {
          assert.ok(mesh.onBeforeRenderObservable.observers.length > 0);
          assert.ok(mesh._mt5NodeAddress, "original transparent surfaces remain unmerged");
          assert.equal(mesh.material.separateCullingPass, false);
          assert.equal(mesh.material.backFaceCulling, false);
          assert.equal(mesh.material.needAlphaBlendingForMesh(mesh), true);
          assert.equal(mesh.material.alpha, 1);
          assert.equal(mesh.material.diffuseTexture.hasAlpha, true);
        }
      } finally {
        scene.dispose();
      }
    }
  } finally {
    engine.dispose();
  }
});
