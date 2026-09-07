import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  WorldRaycastIndex,
  collectStaticWorldMeshes,
  createWorldSpatialIndex,
  pickMeshesWithRay,
  spatiallyBatchMt7MapRoot,
} from "../src/rendering/SceneSpatialIndex.js";

function ground(name, scene, material, x, y, metadata = {}) {
  const mesh = BABYLON.MeshBuilder.CreateGround(name, {
    width: 4,
    height: 4,
  }, scene);
  mesh.position.set(x, y, 0);
  mesh.material = material;
  mesh.metadata = metadata;
  mesh.isPickable = true;
  mesh.computeWorldMatrix(true);
  return mesh;
}

test("spatially batches compatible static MT7 meshes without changing picks", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("mt7_map", scene);
  const material = new BABYLON.StandardMaterial("map", scene);
  const first = ground("first", scene, material, 0, 2, {
    sourceTextureId: "floor",
  });
  const second = ground("second", scene, material, 5, 3, {
    sourceTextureId: "floor",
  });
  const distant = ground("distant", scene, material, 80, 4, {
    sourceTextureId: "floor",
  });
  first.parent = root;
  second.parent = root;
  distant.parent = root;
  const ray = new BABYLON.Ray(
    new BABYLON.Vector3(0, 10, 0),
    BABYLON.Vector3.Down(),
    20,
  );
  const before = scene.pickWithRay(ray, (mesh) => mesh.parent === root);

  const result = spatiallyBatchMt7MapRoot(root, { cellSize: 32 });
  const after = scene.pickWithRay(
    ray,
    (mesh) => mesh.metadata?.staticWorldGeometry === true,
  );

  assert.deepEqual(result, {
    inputMeshCount: 3,
    outputMeshCount: 2,
    mergedSourceMeshCount: 2,
  });
  assert.equal(root.getChildMeshes().length, 2);
  assert.equal(after.pickedPoint.y, before.pickedPoint.y);
  assert.equal(
    root.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0),
    18,
  );
  assert.ok(root.getChildMeshes().every(
    (mesh) => mesh.metadata.staticWorldGeometry === true,
  ));
  assert.equal(
    root.getChildMeshes().find(
      (mesh) => mesh.metadata.staticBatchSourceMeshCount === 2,
    ).metadata.sourceTextureId,
    "floor",
  );
  scene.dispose();
  engine.dispose();
});

test("static batching never combines authored water with ordinary terrain", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.Mesh("mt7_map", scene);
  const material = new BABYLON.StandardMaterial("shared", scene);
  const land = ground("land", scene, material, 0, 0);
  const water = ground("water", scene, material, 1, -1, {
    authoredWater: true,
    surfaceKind: "water",
  });
  land.parent = root;
  water.parent = root;

  const result = spatiallyBatchMt7MapRoot(root);

  assert.equal(result.outputMeshCount, 2);
  assert.equal(root.getChildMeshes().filter(
    (mesh) => mesh.metadata.authoredWater === true,
  ).length, 1);
  scene.dispose();
  engine.dispose();
});

test("indexed picking returns the same nearest and multiple hits as scene picking", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const material = new BABYLON.StandardMaterial("ground", scene);
  const lower = ground("lower", scene, material, 0, 1, {
    staticWorldGeometry: true,
    terrain: true,
  });
  const upper = ground("upper", scene, material, 0, 3, {
    staticWorldGeometry: true,
    terrain: true,
  });
  const irrelevant = ground("irrelevant", scene, material, 100, 7, {
    staticWorldGeometry: true,
    terrain: true,
  });
  const dynamic = ground("dynamic", scene, material, 0, 2, {
    terrain: true,
  });
  const ray = new BABYLON.Ray(
    new BABYLON.Vector3(0, 10, 0),
    BABYLON.Vector3.Down(),
    20,
  );
  const predicate = (mesh) => (
    mesh.isPickable && mesh.isEnabled() && mesh.metadata?.terrain === true
  );
  const index = new WorldRaycastIndex(scene, [lower, upper, irrelevant]);

  const expected = scene.pickWithRay(ray, predicate);
  const actual = index.pickWithRay(ray, predicate);
  const hits = index.multiPickWithRay(ray, predicate);

  assert.equal(actual.pickedMesh, expected.pickedMesh);
  assert.equal(actual.pickedMesh, upper);
  assert.deepEqual(
    hits.map((hit) => hit.pickedMesh.name).sort(),
    ["dynamic", "lower", "upper"],
  );
  assert.ok(!index.candidatesForRay(ray).includes(irrelevant));
  scene.dispose();
  engine.dispose();
});

test("filtered mesh picking respects transformed parents", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const parent = new BABYLON.TransformNode("parent", scene);
  parent.position.y = 4;
  const mesh = BABYLON.MeshBuilder.CreateGround("raised", {
    width: 2,
    height: 2,
  }, scene);
  mesh.parent = parent;
  mesh.computeWorldMatrix(true);
  const ray = new BABYLON.Ray(
    new BABYLON.Vector3(0, 10, 0),
    BABYLON.Vector3.Down(),
    20,
  );

  const hit = pickMeshesWithRay([mesh], ray, () => true);

  assert.equal(hit.pickedMesh, mesh);
  assert.equal(hit.pickedPoint.y, 4);
  scene.dispose();
  engine.dispose();
});

test("world spatial index accelerates frozen MT5 geometry and tracks runtime meshes", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const root = new BABYLON.TransformNode("mt5_world", scene);
  const material = new BABYLON.StandardMaterial("ground", scene);
  const nearby = ground("nearby", scene, material, 0, 1, { terrain: true });
  const distant = ground("distant", scene, material, 100, 2, { terrain: true });
  nearby.parent = root;
  distant.parent = root;
  nearby.freezeWorldMatrix();
  distant.freezeWorldMatrix();

  assert.deepEqual(
    collectStaticWorldMeshes([root]),
    [nearby, distant],
  );
  const index = createWorldSpatialIndex(scene, [root]);
  const runtime = ground("runtime", scene, material, 0, 3, { terrain: true });
  await new Promise((resolve) => setImmediate(resolve));
  const ray = new BABYLON.Ray(
    new BABYLON.Vector3(0, 10, 0),
    BABYLON.Vector3.Down(),
    20,
  );

  assert.equal(index.pickWithRay(ray, (mesh) => mesh.isPickable).pickedMesh, runtime);
  assert.ok(index.selectionOctree.dynamicContent.includes(runtime));
  assert.ok(!index.candidatesForRay(ray).includes(distant));

  runtime.dispose();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!index.dynamicMeshes.has(runtime));
  assert.ok(!index.selectionOctree.dynamicContent.includes(runtime));
  index.dispose();
  assert.equal(scene.selectionOctree, null);
  scene.dispose();
  engine.dispose();
});

test("world spatial index ignores meshes removed before their deferred add event", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  const material = new BABYLON.StandardMaterial("ground", scene);
  const terrain = ground("terrain", scene, material, 0, 0, { terrain: true });
  terrain.freezeWorldMatrix();
  const index = new WorldRaycastIndex(scene, [terrain], {
    accelerateRendering: true,
  });

  const renderTargetHelper = BABYLON.MeshBuilder.CreatePlane(
    "render-target-helper",
    { size: 2 },
    scene,
  );
  scene.removeMesh(renderTargetHelper);
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(!scene.meshes.includes(renderTargetHelper));
  assert.ok(!index.dynamicMeshes.has(renderTargetHelper));
  assert.ok(!index.selectionOctree.dynamicContent.includes(renderTargetHelper));

  renderTargetHelper.dispose();
  index.dispose();
  scene.dispose();
  engine.dispose();
});
