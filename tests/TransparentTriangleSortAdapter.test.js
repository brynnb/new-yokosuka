import assert from "node:assert/strict";
import test from "node:test";
import {
  enableTransparentTriangleSorting,
  setTransparentTriangleSortMode,
  setTransparentTriangleSortDiagnostics,
  getTransparentTriangleSortStatistics,
} from "../src/rendering/TransparentTriangleSort.js";

// Engine-independent adapter contract tests. These do NOT emulate Babylon's
// skinning, rendering or GPU. Separate Babylon integration tests cover those
// API boundaries when @babylonjs/core is installed.
class TestMatrix {
  constructor() {
    this.m = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  clone() { const result = new TestMatrix(); result.m.set(this.m); return result; }
  multiplyToRef(right, result) {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        let sum = 0;
        for (let i = 0; i < 4; i += 1) sum += this.m[row * 4 + i] * right.m[i * 4 + col];
        result.m[row * 4 + col] = sum;
      }
    }
  }
}
function fixture(t) {
  setTransparentTriangleSortMode("optimized");
  setTransparentTriangleSortDiagnostics(true);
  t.after(() => { setTransparentTriangleSortMode("optimized"); setTransparentTriangleSortDiagnostics(false); });
  const view = new TestMatrix();
  const world = new TestMatrix();
  const scene = {activeCamera: {getViewMatrix: () => view}, useRightHandedSystem: false};
  const observers = [];
  const mesh = {
    indices: [0, 1, 2, 3, 4, 5],
    positions: Float32Array.from([-1, -1, 1, 1, -1, 1, 0, 1, 1, -1, -1, 3, 1, -1, 3, 0, 1, 3]),
    geometry: {_indexBufferIsUpdatable: false},
    subMeshes: [{}],
    material: {alpha: 0.7, separateCullingPass: true, needAlphaBlendingForMesh() { return this.alpha < 1; }},
    uploads: [], sets: 0, reads: 0,
    getIndices() { return this.indices; },
    getTotalIndices() { return this.indices.length; },
    getTotalVertices() { return this.positions.length / 3; },
    getScene: () => scene,
    getWorldMatrix: () => world,
    getPositionData(skeleton, morph) {
      assert.equal(skeleton, true); assert.equal(morph, true);
      this.reads += 1; return this.positions;
    },
    setIndices(indices, count, updatable, preserveSubmeshes) {
      assert.equal(count, null); assert.equal(updatable, true); assert.equal(preserveSubmeshes, true);
      this.indices = indices; this.geometry._indexBufferIsUpdatable = true;
      this.gpu = [...indices]; this.sets += 1;
    },
    updateIndices(indices, offset, gpuOnly) {
      assert.equal(offset, undefined); assert.equal(gpuOnly, true);
      this.gpu = [...indices]; this.uploads.push([...indices]);
    },
    onBeforeRenderObservable: {observers, add: fn => observers.push(fn)},
  };
  return {mesh, scene, view, world, draw: () => observers.forEach(fn => fn(mesh))};
}

test("adapter preserves authored topology and installs only once", t => {
  const {mesh, draw} = fixture(t);
  const authored = mesh.indices;
  const subMesh = mesh.subMeshes[0];
  enableTransparentTriangleSorting(mesh); enableTransparentTriangleSorting(mesh);
  assert.equal(mesh.onBeforeRenderObservable.observers.length, 1);
  draw(); draw();
  assert.deepEqual(mesh.gpu, [3, 4, 5, 0, 1, 2]);
  assert.equal(mesh.indices, authored);
  assert.equal(mesh.subMeshes[0], subMesh);
  assert.equal(mesh.material.alpha, 0.7);
  assert.equal(mesh.material.separateCullingPass, false);
  assert.equal(mesh.sets, 1);
  assert.equal(mesh.uploads.length, 1);
  const stats = getTransparentTriangleSortStatistics();
  assert.equal(stats.passes, 2); assert.equal(stats.skippedSorts, 1);
});

test("off mode bypasses skinning/sorting and re-enabling catches up", t => {
  const {mesh, draw} = fixture(t);
  enableTransparentTriangleSorting(mesh); draw();
  const gpu = [...mesh.gpu];
  setTransparentTriangleSortMode("off");
  for (let v = 0; v < 3; v += 1) mesh.positions[v * 3 + 2] = 8;
  draw();
  assert.equal(mesh.reads, 1); assert.deepEqual(mesh.gpu, gpu);
  assert.equal(getTransparentTriangleSortStatistics().bypassedPasses, 1);
  setTransparentTriangleSortMode("legacy"); draw();
  assert.deepEqual(mesh.gpu, mesh.indices);
  setTransparentTriangleSortMode("optimized"); draw();
  assert.deepEqual(mesh.gpu, mesh.indices);
  assert.equal(getTransparentTriangleSortStatistics().skippedSorts, 1);
});

test("camera, position and same-array topology updates remain live", t => {
  const {mesh, draw, view} = fixture(t);
  enableTransparentTriangleSorting(mesh); draw();
  [mesh.indices[3], mesh.indices[4]] = [mesh.indices[4], mesh.indices[3]];
  draw(); assert.deepEqual(mesh.gpu, [4, 3, 5, 0, 1, 2]);
  view.m[10] = -1; draw(); assert.deepEqual(mesh.gpu, mesh.indices);
  for (let v = 0; v < 3; v += 1) mesh.positions[v * 3 + 2] = 8;
  draw(); assert.deepEqual(mesh.gpu, [4, 3, 5, 0, 1, 2]);
});

test("new topology, geometry and vertex counts rebuild state", t => {
  const {mesh, draw} = fixture(t);
  enableTransparentTriangleSorting(mesh); draw();
  mesh.indices = [3, 4, 5, 0, 1, 2]; draw();
  assert.equal(mesh.sets, 2); assert.deepEqual(mesh.gpu, mesh.indices);
  mesh.geometry = {_indexBufferIsUpdatable: true}; draw();
  assert.equal(mesh.sets, 3);
  mesh.positions = Float32Array.from([...mesh.positions, 0, 0, 2]); draw();
  assert.equal(mesh.sets, 4);
});

test("unrenderable/opaque/multi-submesh cases do no pose work", t => {
  const {mesh, draw, scene} = fixture(t);
  enableTransparentTriangleSorting(mesh);
  const camera = scene.activeCamera;
  scene.activeCamera = null; draw();
  scene.activeCamera = camera; mesh.material.alpha = 1; draw();
  mesh.material.alpha = 0.7; mesh.subMeshes.push({}); draw();
  assert.equal(mesh.reads, 0);
});

test("diagnostics can be disabled and invalid modes are rejected", t => {
  const {mesh, draw} = fixture(t);
  enableTransparentTriangleSorting(mesh);
  setTransparentTriangleSortDiagnostics(false); draw(); draw();
  assert.equal(getTransparentTriangleSortStatistics().passes, 0);
  assert.equal(mesh.uploads.length, 1);
  assert.throws(() => setTransparentTriangleSortMode("typo"), TypeError);
});
