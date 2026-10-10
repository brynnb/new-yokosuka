import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";
import {
  WorldRaycastIndex,
  collectStaticWorldMeshes,
  createWorldSpatialIndex,
  markWorldMeshDynamic,
  pickMeshesWithRay,
} from "../src/rendering/SceneSpatialIndex.js";
import { spatiallyBatchMt7MapRoot } from "../src/rendering/StaticWorldBatching.js";
import { ThirdPersonController, nativeCollisionDisplacementAllowed } from "../src/ThirdPersonController.js";

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

test("collision broad phase preserves swept wall/corner contacts and ignores distant scenery", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  scene.collisionsEnabled = true;
  try {
    const wall = BABYLON.MeshBuilder.CreateBox("wall", {width: 0.1, height: 8, depth: 10}, scene);
    wall.position.x = 2;
    wall.checkCollisions = true;
    wall.freezeWorldMatrix();
    const corner = BABYLON.MeshBuilder.CreateBox("corner", {width: 10, height: 8, depth: 0.1}, scene);
    corner.position.z = 2;
    corner.checkCollisions = true;
    corner.freezeWorldMatrix();
    const far = ground("far", scene, null, 100, 0);
    far.checkCollisions = true;
    far.freezeWorldMatrix();
    const index = new WorldRaycastIndex(scene, [wall, corner, far]);
    const collider = BABYLON.MeshBuilder.CreateBox("player", {size: 0.1}, scene);
    collider.ellipsoid.set(0.24, 0.85, 0.24);
    collider.ellipsoidOffset.set(0, 0.85, 0);
    const controller = Object.assign(Object.create(ThirdPersonController.prototype), {
      scene, collider, raycastIndex: index, options: {playerRadius: 0.24},
    });
    const coordinator = scene.collisionCoordinator;
    const original = coordinator.getNewPosition;
    let indexedCandidates;
    coordinator.getNewPosition = function(...args) {
      indexedCandidates = collider.surroundingMeshes;
      return original.apply(this, args);
    };
    for (const start of [[0, 0, 0], [1.7, 0, 1.7], [16.1, 0, 0]]) {
      for (const move of [[3, 0, 0], [3, 0, 3], [-18, 0, 2], [0.03, 0, 0.1]]) {
        collider.position.copyFromFloats(...start);
        collider.computeWorldMatrix(true);
        collider.moveWithCollisions(BABYLON.Vector3.FromArray(move));
        const expected = collider.position.clone();
        collider.position.copyFromFloats(...start);
        collider.computeWorldMatrix(true);
        controller.moveColliderWithCollisions(BABYLON.Vector3.FromArray(move));
        assert.ok(BABYLON.Vector3.Distance(expected, collider.position) < 1e-6, `${start} -> ${move}`);
        assert.ok(!indexedCandidates.includes(far));
        assert.equal(collider.surroundingMeshes, null);
      }
    }
    index.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test("collision queries observe same-frame door movement, toggles, promotion and disposal", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const parked = ground("parked", scene, null, 100, 0);
    parked.checkCollisions = true;
    parked.freezeWorldMatrix();
    const index = new WorldRaycastIndex(scene, [parked]);
    const start = new BABYLON.Vector3(-0.4, 0, 0);
    const end = new BABYLON.Vector3(0.4, 0, 0);
    assert.deepEqual(index.collisionCandidates(start, end, 0.24), []);
    const door = BABYLON.MeshBuilder.CreateBox("door", {width: 0.1, height: 3, depth: 4}, scene);
    door.checkCollisions = true;
    door.metadata = {nativeCollision: true, nativeCollisionSegments: [[[0, -2], [0, 2]]]};
    await new Promise(resolve => setImmediate(resolve));
    const blocked = () => nativeCollisionDisplacementAllowed(
      index.collisionCandidates(start, end, 0.24), start, end.subtract(start), 0.24,
    );
    assert.equal(blocked(), false);
    door.checkCollisions = false;
    assert.equal(blocked(), true);
    door.checkCollisions = true;
    door.position.x = 30;
    assert.equal(blocked(), true);
    door.position.x = 0;
    assert.equal(blocked(), false);
    markWorldMeshDynamic(parked);
    parked.position.x = 0;
    assert.ok(index.collisionCandidates(start, end, 0.24).includes(parked));
    door.dispose();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(blocked(), true);
    index.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test("render candidates follow hidden actor parents without losing query proxies or reactivation", async () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const map = ground("map", scene, null, 0, 0);
    map.freezeWorldMatrix();
    const actor = new BABYLON.TransformNode("actor", scene);
    const body = new BABYLON.TransformNode("body", scene);
    body.parent = actor;
    const part = ground("body-part", scene, null, 0, 0);
    part.parent = body;
    const proxy = ground("query-proxy", scene, null, 0, 0);
    proxy.parent = actor;
    const index = new WorldRaycastIndex(scene, [map], {accelerateRendering: true});
    const select = () => {
      scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
      return index.selectionOctree.dynamicContent.slice();
    };
    body.setEnabled(false);
    assert.deepEqual(select(), [proxy]);
    body.setEnabled(true);
    assert.deepEqual(select(), [part, proxy]);
    actor.setEnabled(false);
    assert.deepEqual(select(), []);
    part.parent = null;
    assert.deepEqual(select(), [part]);
    actor.setEnabled(true);
    part.dispose();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(select(), [proxy]);
    const observerCount = scene.onBeforeActiveMeshesEvaluationObservable.observers.length;
    index.dispose();
    assert.equal(scene.onBeforeActiveMeshesEvaluationObservable.observers.filter(o => !o._willBeUnregistered).length, observerCount - 1);
  } finally { scene.dispose(); engine.dispose(); }
});

test("resident props promoted after indexing render and pick at their new position", () => {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const parked = ground("parked", scene, null, 100, 2);
    parked.freezeWorldMatrix();
    const index = createWorldSpatialIndex(scene, [parked]);
    const ray = new BABYLON.Ray(new BABYLON.Vector3(0, 10, 0), BABYLON.Vector3.Down(), 20);
    assert.ok(!index.candidatesForRay(ray).includes(parked));
    markWorldMeshDynamic(parked);
    parked.position.x = 0;
    markWorldMeshDynamic(parked);
    assert.equal(index.pickWithRay(ray).pickedMesh, parked);
    assert.equal(index.staticMeshes.has(parked), false);
    assert.deepEqual(index.selectionOctree.dynamicContent, [parked]);
    assert.ok([...index.cells.values()].every(meshes => !meshes.includes(parked)));
    index.dispose();
    // A later index must not freeze the same actor back into static selection.
    parked.freezeWorldMatrix();
    assert.deepEqual(collectStaticWorldMeshes([parked]), []);
  } finally { scene.dispose(); engine.dispose(); }
});

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
