import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import { batchStaticWorldRoots, staticBatchSourceForFace } from "../src/rendering/StaticWorldBatching.js";
import { freezeSceneRoots, clearWorldSceneAssets } from "../src/rendering/SceneResources.js";
import { createWorldSpatialIndex } from "../src/rendering/SceneSpatialIndex.js";
import { prepareWorldCollision } from "../play/world/WorldCollision.js";
import { WorldMapLayerState } from "../src/rendering/WorldMapLayerState.js";
import { TrianglePicker } from "../play/debug/TrianglePicker.js";

function fixture(t, filename = "S1_D000_MAP.MT5") {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const root = new B.TransformNode("map", scene);
  root._filename = filename;
  const material = new B.StandardMaterial("ground", scene);
  material.backFaceCulling = false;
  t.after(() => { scene.dispose(); engine.dispose(); });
  const part = (name, x, parent = root) => {
    const mesh = B.MeshBuilder.CreateGround(name, {width: 2, height: 2}, scene);
    mesh.parent = parent;
    mesh.position.x = x;
    mesh.material = material;
    mesh.metadata = {mt5TextureId: "authored-floor"};
    return mesh;
  };
  const prepare = (roots = [root]) => {
    freezeSceneRoots(roots);
    prepareWorldCollision(roots, {nativeHorizontalCollision: true});
  };
  return {engine, scene, root, material, part, prepare};
}

test("MT5 batching preserves transformed terrain, surface state and source-face picks", async t => {
  const {scene, root, part, prepare} = fixture(t);
  root.position.set(4, 2, 3);
  root.rotation.y = 0.25;
  root.scaling.x = -1;
  const node = new B.TransformNode("authored-node", scene);
  node.parent = root;
  node.position.y = 1;
  const first = part("floor-a", 1, node);
  const second = part("floor-b", 4, node);
  first._mt5NodeAddress = 0x1234;
  first._mt5OriginalFaceIds = [40, 41];
  for (const mesh of [first, second]) {
    mesh.useVertexColors = true;
    mesh.setVerticesData("color", new Float32Array(16).fill(0.7), false, 4);
    mesh.receiveShadows = true;
    mesh.renderingGroupId = 2;
  }
  prepare();
  const center = first.getBoundingInfo().boundingBox.centerWorld;
  const ray = new B.Ray(center.add(new B.Vector3(0, 5, 0)), B.Vector3.Down(), 10);
  const before = scene.pickWithRay(ray);
  const expectedUvs = Array.from(first.getVerticesData("uv"));
  const expectedColors = Array.from(first.getVerticesData("color"));

  const [result] = await batchStaticWorldRoots([root]);
  assert.deepEqual(result, {
    filename: root._filename, inputMeshCount: 2, outputMeshCount: 1, mergedSourceMeshCount: 2,
  });
  assert.equal(first.isDisposed(), true);
  assert.equal(second.isDisposed(), true);
  assert.equal(node.isDisposed(), false, "retain authored nodes for hierarchy ownership");
  const index = createWorldSpatialIndex(scene, [root]);
  t.after(() => index.dispose());
  const after = index.pickWithRay(ray);
  assert.ok(B.Vector3.Distance(before.pickedPoint, after.pickedPoint) < 0.00001);
  assert.equal(after.pickedMesh.parent, root);
  assert.equal(after.pickedMesh.receiveShadows, true);
  assert.equal(after.pickedMesh.renderingGroupId, 2);
  assert.equal(after.pickedMesh.metadata.terrain, true);
  assert.equal(after.pickedMesh.checkCollisions, false);
  assert.equal(after.pickedMesh.metadata.sourceModel, root._filename);
  assert.deepEqual(Array.from(after.pickedMesh.getVerticesData("uv")).slice(0, 8), expectedUvs);
  assert.deepEqual(Array.from(after.pickedMesh.getVerticesData("color")).slice(0, 16), expectedColors);
  const source = staticBatchSourceForFace(after.pickedMesh, after.faceId);
  assert.equal(source.meshName, "floor-a");
  assert.equal(source.nodeAddress, 0x1234);
  assert.equal(source.faceId, first._mt5OriginalFaceIds[before.faceId]);
  const picker = Object.create(TrianglePicker.prototype);
  picker.sources = [];
  assert.deepEqual(picker.faceData(after.pickedMesh, after.faceId).batchSource, source);
  assert.equal(staticBatchSourceForFace(after.pickedMesh, -1), null);
  assert.equal(staticBatchSourceForFace(after.pickedMesh, 100), null);
  const secondCenter = second.getBoundingInfo().boundingBox.centerWorld;
  const secondHit = index.pickWithRay(new B.Ray(
    secondCenter.add(new B.Vector3(0, 5, 0)), B.Vector3.Down(), 10,
  ));
  assert.equal(staticBatchSourceForFace(secondHit.pickedMesh, secondHit.faceId).meshName,
    "floor-b");
});

test("batches retain independent time layers and disabled authored subtrees", async t => {
  const {scene, root, part, prepare} = fixture(t, "S1_JU00_MAP02.MT5");
  const night = new B.TransformNode("night", scene);
  night._filename = "S1_JU00_MAP03.MT5";
  for (const layer of [root, night]) { part("one", 1, layer); part("two", 4, layer); }
  const masked = new B.TransformNode("AUTH mask", scene);
  masked.parent = root;
  const hidden = part("masked", 8, masked);
  masked.setEnabled(false);
  prepare([root, night]);
  const layers = new WorldMapLayerState();
  layers.load({nativeArea: "JU00", timedMapLayers: {modelPrefix: "S1_JU00", dayEveningPairs: [[2, 3]]}},
    [root, night], new Date("1986-06-09T12:00:00Z"));
  assert.equal(night.isEnabled(), false);
  await batchStaticWorldRoots([root, night]);
  assert.equal(night.metadata.staticBatchMergedSourceMeshCount, 2, "inactive whole layers are safe to batch");
  assert.equal(hidden.isDisposed(), false, "a disabled node keeps independent geometry");
  masked.setEnabled(true);
  assert.equal(hidden.isEnabled(), true);
  layers.update(new Date("1986-06-09T22:00:00Z"));
  assert.equal(root.getChildMeshes().some(mesh => mesh.isEnabled()), false);
  assert.equal(night.getChildMeshes().every(mesh => mesh.isEnabled()), true);
});

test("transparent, dynamic, interactive and callback-owned geometry stays separate", async t => {
  const {scene, root, part, prepare} = fixture(t);
  part("static-a", 1); part("static-b", 2);
  const blend = part("glass", 3);
  blend.material = blend.material.clone("transparent");
  blend.material.alpha = 0.5;
  const callback = part("coverage-or-custom-effect", 4);
  callback.onBeforeBindObservable.add(() => {});
  const dynamic = part("animated-vertices", 5);
  dynamic.markVerticesDataAsUpdatable("position", true);
  const owner = part("runtime-owner", 6);
  owner.metadata.interactiveMapTransition = {id: "door"};
  const effect = part("local-effect", 7);
  effect.metadata.localEffect = true;
  const movingNode = new B.TransformNode("moving-node", scene);
  movingNode.parent = root;
  const moving = part("moving", 8, movingNode);
  const stretched = part("non-uniform transform", 9);
  stretched.scaling.y = 2;
  const prop = new B.TransformNode("prop", scene);
  prop._filename = "S1_D000_DOOR.MT5";
  const door = part("door", 9, prop);
  prepare([root, prop]);
  movingNode.unfreezeWorldMatrix();
  await batchStaticWorldRoots([root, prop]);
  for (const mesh of [blend, callback, dynamic, owner, effect, moving, stretched, door]) {
    assert.equal(mesh.isDisposed(), false, mesh.name);
  }
  assert.equal(root.metadata.staticBatchMergedSourceMeshCount, 2);
  assert.equal(prop.metadata?.staticBatchInputMeshCount, undefined);
  assert.equal(callback.onBeforeBindObservable.observers.length, 1);
  const count = scene.meshes.length;
  assert.deepEqual(await batchStaticWorldRoots([root, prop]), []);
  assert.equal(scene.meshes.length, count, "finalization is idempotent");
});

test("spatial/material/collision boundaries prevent incompatible merges", async t => {
  const {root, part, prepare} = fixture(t);
  part("same-a", 1); part("same-b", 2);
  const far = part("far", 100);
  const overlay = part("overlay", 3);
  overlay.metadata.mt5DepthOverlay = true;
  const otherMaterial = part("other material", 4);
  otherMaterial.material = otherMaterial.material.clone("other");
  const otherGroup = part("other render group", 5);
  otherGroup.renderingGroupId = 3;
  prepare();
  await batchStaticWorldRoots([root]);
  assert.equal(root.metadata.staticBatchOutputMeshCount, 5);
  for (const mesh of [far, overlay, otherMaterial, otherGroup]) assert.equal(mesh.isDisposed(), false);
  assert.equal(overlay.metadata.terrain, false);
});

test("batched picking retains each source's bounding box at terrain seams", async t => {
  const {scene, root, part, prepare} = fixture(t);
  const upper = part("upper floor", 1);
  upper.position.y = 2;
  part("lower floor", 3);
  prepare();
  const ray = new B.Ray(new B.Vector3(2.0005, 5, 0), B.Vector3.Down(), 10);
  const predicate = mesh => mesh.isPickable && mesh.metadata?.terrain === true;
  const original = createWorldSpatialIndex(scene, [root]);
  const before = original.pickWithRay(ray, predicate);
  assert.equal(before.pickedPoint.y, 0);
  original.dispose();

  await batchStaticWorldRoots([root]);
  const index = createWorldSpatialIndex(scene, [root]);
  t.after(() => index.dispose());
  const after = index.pickWithRay(ray, predicate);
  assert.equal(after.pickedPoint.y, before.pickedPoint.y);
  const inside = index.pickWithRay(new B.Ray(
    new B.Vector3(1, 5, 0), B.Vector3.Down(), 10,
  ), predicate);
  assert.equal(inside.pickedPoint.y, 2);
  assert.equal(root.getChildMeshes()[0].subMeshes.length, 1,
    "picking must restore the single render draw");
});

test("batched multi-picking retains overlapping original surfaces", async t => {
  const {scene, root, part, prepare} = fixture(t);
  const upper = part("upper", 1);
  upper.position.y = 2;
  part("lower", 1);
  prepare();
  const ray = new B.Ray(new B.Vector3(1, 5, 0), B.Vector3.Down(), 10);
  const predicate = mesh => mesh.isPickable && mesh.metadata?.terrain === true;
  const original = createWorldSpatialIndex(scene, [root]);
  const before = original.multiPickWithRay(ray, predicate)
    .map(hit => hit.pickedPoint.y).sort((a, b) => a - b);
  assert.deepEqual(before, [0, 2]);
  original.dispose();
  await batchStaticWorldRoots([root]);
  const index = createWorldSpatialIndex(scene, [root]);
  t.after(() => index.dispose());
  const after = index.multiPickWithRay(ray, predicate)
    .map(hit => hit.pickedPoint.y).sort((a, b) => a - b);
  assert.deepEqual(after, before);
  assert.equal(root.getChildMeshes()[0].subMeshes.length, 1);
});

test("cancelled batching yields without detached resources or stale continued work", async t => {
  const {scene, root, part, prepare} = fixture(t);
  for (let group = 0; group < 3; group++) {
    part("a", 1 + group * 40); part("b", 2 + group * 40);
  }
  prepare();
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(batchStaticWorldRoots([root], {
    signal: controller.signal, workBudgetMs: 0,
    yieldWork: async () => { yields++; controller.abort(); },
  }), {name: "AbortError"});
  assert.equal(yields, 1);
  assert.equal(root.getChildMeshes().length, 5, "only first group merged");
  const state = {currentMeshes: [root]};
  clearWorldSceneAssets(state);
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.materials.filter(m => m.name === "ground").length, 0);
  await assert.rejects(batchStaticWorldRoots([root], {signal: controller.signal}), {name: "AbortError"});
});
