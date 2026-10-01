// Requires the project's actual @babylonjs/core installation. No game assets.
// These integration tests are separate from the dependency-free contract tests.
import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import {
  enableTransparentTriangleSorting,
  setTransparentTriangleSortMode,
} from "../src/rendering/TransparentTriangleSort.js";

function fixture(t) {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); setTransparentTriangleSortMode("optimized"); });
  const camera = new B.FreeCamera("camera", new B.Vector3(0, 0, -10), scene);
  camera.setTarget(B.Vector3.Zero());
  scene.activeCamera = camera;
  const mesh = new B.Mesh("layers", scene);
  mesh.setVerticesData(B.VertexBuffer.PositionKind, [
    -1, -1, 1, 1, -1, 1, 0, 1, 1,
    -1, -1, 3, 1, -1, 3, 0, 1, 3,
  ], true);
  mesh.setIndices([0, 1, 2, 3, 4, 5]);
  mesh.material = new B.StandardMaterial("blended", scene);
  mesh.material.alpha = 0.7;
  mesh.material.backFaceCulling = false;
  mesh.material.separateCullingPass = true;
  let gpu = Array.from(mesh.getIndices());
  let sorting = false;
  const setIndices = mesh.setIndices.bind(mesh);
  mesh.setIndices = (indices, ...args) => {
    gpu = Array.from(indices);
    return setIndices(indices, ...args);
  };
  const updateIndices = mesh.updateIndices.bind(mesh);
  mesh.updateIndices = (indices, offset, gpuOnly) => {
    if (sorting) assert.equal(gpuOnly, true);
    gpu = Array.from(indices);
    return updateIndices(indices, offset, gpuOnly);
  };
  enableTransparentTriangleSorting(mesh);
  enableTransparentTriangleSorting(mesh);
  assert.equal(mesh.onBeforeRenderObservable.observers.length, 1);

  function drawAndCompare(mode = "optimized") {
    setTransparentTriangleSortMode(mode);
    mesh.skeleton?.prepare(true);
    mesh.computeWorldMatrix(true);
    camera.getViewMatrix(true);
    const indices = mesh.getIndices();
    const topology = Array.from(indices);
    const subMesh = mesh.subMeshes[0];
    const positions = mesh.getPositionData(true, true);
    assert.ok(positions);
    const matrix = mesh.getWorldMatrix().multiply(camera.getViewMatrix()).m;
    const depths = Array.from({length: indices.length / 3}, (_, triangle) => {
      let depth = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = indices[triangle * 3 + corner] * 3;
        depth += positions[offset] * matrix[2]
          + positions[offset + 1] * matrix[6]
          + positions[offset + 2] * matrix[10];
      }
      return depth * (scene.useRightHandedSystem ? -1 : 1);
    });
    const order = depths.map((_, i) => i).sort((a, b) => depths[b] - depths[a] || a - b);
    const expected = order.flatMap(triangle => topology.slice(triangle * 3, triangle * 3 + 3));
    sorting = true;
    try { mesh.onBeforeRenderObservable.notifyObservers(mesh); }
    finally { sorting = false; }
    assert.deepEqual(gpu, expected);
    assert.equal(mesh.getIndices(), indices, "retain CPU index identity");
    assert.deepEqual(Array.from(mesh.getIndices()), topology, "retain authored triangle IDs");
    assert.equal(mesh.subMeshes[0], subMesh, "retain active SubMesh");
    assert.equal(mesh.material.alpha, 0.7);
    assert.equal(mesh.material.backFaceCulling, false);
    return [...gpu];
  }
  return {scene, mesh, camera, drawAndCompare};
}

test("real Babylon: camera, transforms, handedness and topology match reference ordering", t => {
  const {mesh, scene, camera, drawAndCompare} = fixture(t);
  assert.deepEqual(drawAndCompare(), [3, 4, 5, 0, 1, 2]);
  drawAndCompare(); drawAndCompare("legacy");
  camera.position.z = 10; camera.setTarget(B.Vector3.Zero()); drawAndCompare();
  mesh.rotation.y = Math.PI; mesh.scaling.x = -1; drawAndCompare();
  scene.useRightHandedSystem = true; drawAndCompare();
  mesh.setIndices([3, 4, 5, 0, 1, 2]); drawAndCompare();
  const positions = mesh.getVerticesData(B.VertexBuffer.PositionKind).slice();
  for (let i = 0; i < 3; i += 1) positions[i * 3 + 2] = 8;
  mesh.updateVerticesData(B.VertexBuffer.PositionKind, positions);
  drawAndCompare();
  const indices = mesh.getIndices();
  [indices[0], indices[1]] = [indices[1], indices[0]];
  mesh.updateIndices(indices); drawAndCompare();
  mesh.dispose();
  assert.equal(mesh.onBeforeRenderObservable.observers.length, 0);
});

test("real Babylon: skeletal deformation remains live", t => {
  const {mesh, scene, drawAndCompare} = fixture(t);
  mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ]);
  mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind,
    Array.from({length: 24}, (_, i) => i % 4 === 0 ? 1 : 0));
  mesh.skeleton = new B.Skeleton("skeleton", "skeleton", scene);
  const bone = new B.Bone("moving", mesh.skeleton, null, B.Matrix.Identity());
  new B.Bone("fixed", mesh.skeleton, null, B.Matrix.Identity());
  assert.deepEqual(drawAndCompare(), [3, 4, 5, 0, 1, 2]);
  bone.setPosition(new B.Vector3(0, 0, 5));
  assert.deepEqual(drawAndCompare(), [0, 1, 2, 3, 4, 5]);
  drawAndCompare("legacy");
  bone.setPosition(B.Vector3.Zero()); drawAndCompare();
});

test("real Babylon: morph influence and target edits are not cached across frames", t => {
  const {mesh, scene, drawAndCompare} = fixture(t);
  const manager = new B.MorphTargetManager(scene);
  const target = new B.MorphTarget("move first layer", 0, scene);
  const positions = Float32Array.from(mesh.getVerticesData(B.VertexBuffer.PositionKind));
  for (let i = 0; i < 3; i += 1) positions[i * 3 + 2] = 8;
  target.setPositions(positions);
  manager.addTarget(target);
  mesh.morphTargetManager = manager;
  assert.deepEqual(drawAndCompare(), [3, 4, 5, 0, 1, 2]);
  target.influence = 1;
  assert.deepEqual(drawAndCompare(), [0, 1, 2, 3, 4, 5]);
  for (let i = 0; i < 3; i += 1) positions[i * 3 + 2] = -8;
  target.setPositions(positions.slice()); drawAndCompare();
  target.influence = 0; drawAndCompare();
});
