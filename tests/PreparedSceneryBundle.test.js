import test from "node:test";
import assert from "node:assert/strict";
import * as B from "@babylonjs/core";
import {compileSceneryBundle, loadSceneryBundle} from "../src/rendering/PreparedSceneryBundle.js";
import {freezeSceneRoots} from "../src/rendering/SceneResources.js";
import {createWorldSpatialIndex} from "../src/rendering/SceneSpatialIndex.js";
import {staticBatchSourceForFace} from "../src/rendering/StaticWorldBatching.js";
import {Mt5Loader} from "../src/Mt5Loader.js";

function fixture(t) {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  t.after(() => { scene.dispose(); engine.dispose(); });
  const root = new B.TransformNode("map", scene);
  root._filename = "S1_D000_MAP.MT5";
  const make = (name, x, pixels = [100, 120, 160, 255]) => {
    const mesh = B.MeshBuilder.CreateGround(name, {width: 2, height: 2}, scene);
    const texture = new B.RawTexture(new Uint8Array(pixels), 1, 1, B.Constants.TEXTUREFORMAT_RGBA, scene, false, false);
    // NullEngine does not retain GPU upload bytes; the compiler's real browser
    // input is the retained RawTexture buffer, not a synthetic pixel readback.
    Object.assign(texture.getInternalTexture(), {_bufferView: new Uint8Array(pixels), format: 5, type: 0});
    const material = new B.StandardMaterial(name, scene);
    material.diffuseTexture = texture;
    material._mt5AlphaMode = "opaque";
    mesh.material = material;
    mesh.parent = root;
    mesh.position.x = x;
    mesh.metadata = {terrain: true, sourceModel: root._filename};
    mesh._mt5NodeAddress = x;
    return mesh;
  };
  return {scene, root, make};
}

test("prepared scenery deduplicates resources and round-trips geometry, layers and original picks", async t => {
  const {scene, root, make} = fixture(t);
  make("floor-a", 0); make("floor-b", 3);
  root.position.y = 2;
  freezeSceneRoots([root]);
  const original = createWorldSpatialIndex(scene, [root]);
  const ray = new B.Ray(new B.Vector3(3, 10, 0), B.Vector3.Down(), 20);
  const before = original.pickWithRay(ray);
  original.dispose();
  root.setEnabled(false);
  const bundle = await compileSceneryBundle([root], {textureArrays: false, yieldWork: async () => {}});
  assert.equal(bundle.manifest.textures.length, 1);
  assert.equal(bundle.manifest.materials.length, 1);
  assert.equal(bundle.manifest.statistics.outputMeshes, 1);
  root.dispose(false, true);
  const loaded = await loadSceneryBundle(scene, bundle.manifest, bundle.binary);
  t.after(() => loaded.dispose());
  assert.equal(loaded.roots[0].isEnabled(), false);
  loaded.roots[0].setEnabled(true);
  const index = createWorldSpatialIndex(scene, loaded.roots);
  t.after(() => index.dispose());
  const after = index.pickWithRay(ray);
  assert.equal(after.hit, true, "children of an inactive layer must reappear with it");
  assert.ok(B.Vector3.Distance(before.pickedPoint, after.pickedPoint) < 1e-6);
  assert.equal(staticBatchSourceForFace(after.pickedMesh, after.faceId).meshName, "floor-b");
});

test("opaque textures share batches without collapsing independent roots", async t => {
  const {scene, root, make} = fixture(t);
  make("red", 0, [255, 0, 0, 255]); make("blue", 3, [0, 0, 255, 255]);
  const night = new B.TransformNode("night", scene);
  night._filename = "S1_D000_MAP01.MT5";
  make("night-red", 5, [255, 0, 0, 255]).parent = night;
  make("night-blue", 8, [0, 0, 255, 255]).parent = night;
  night.setEnabled(false);
  freezeSceneRoots([root, night]);
  const bundle = await compileSceneryBundle([root, night], {yieldWork: async () => {}});
  assert.equal(bundle.manifest.arrays.length, 1);
  assert.deepEqual(bundle.manifest.roots.map(r => [r.meshes.length, r.enabled]), [[1, true], [1, false]]);
  assert.equal(bundle.manifest.statistics.arraySourceMeshes, 4);
  const span = bundle.manifest.roots[0].meshes[0].vertices.uv2;
  assert.deepEqual([...new Set(new Float32Array(bundle.binary.buffer, span.offset, span.length))], [0, 1]);
});

test("bundle compilation is reproducible despite different live Babylon IDs", async t => {
  const outputs = [];
  for (let iteration = 0; iteration < 2; iteration++) {
    const {root, make} = fixture(t);
    root.name = `random-live-name-${iteration}`;
    make("red", 0, [255, 0, 0, 255]); make("blue", 3, [0, 0, 255, 255]);
    freezeSceneRoots([root]);
    outputs.push(await compileSceneryBundle([root], {yieldWork: async () => {}}));
  }
  assert.deepEqual(outputs[0].manifest, outputs[1].manifest);
  assert.deepEqual(outputs[0].binary, outputs[1].binary);
});

test("transparent scenery keeps ordinary materials and separate mesh ordering", async t => {
  const {root, make} = fixture(t);
  for (const [name, x] of [["glass-a", 0], ["glass-b", 3]]) {
    const mesh = make(name, x);
    mesh.material._mt5AlphaMode = "blend";
    mesh.material.alpha = 0.5;
    mesh.material.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    mesh.material.separateCullingPass = true;
  }
  freezeSceneRoots([root]);
  const {manifest} = await compileSceneryBundle([root], {yieldWork: async () => {}});
  assert.equal(manifest.arrays.length, 0);
  assert.equal(manifest.roots[0].meshes.length, 2);
  assert.equal(manifest.materials[0].separateCullingPass, true);
});

test("bundle reader rejects corruption and cancellation without leaving partial scene objects", async t => {
  const {scene, root, make} = fixture(t);
  make("floor", 0); freezeSceneRoots([root]);
  const bundle = await compileSceneryBundle([root], {textureArrays: false, yieldWork: async () => {}});
  const meshes = scene.meshes.length, materials = scene.materials.length, textures = scene.textures.length;
  const corrupt = bundle.binary.slice(); corrupt[0] ^= 1;
  await assert.rejects(loadSceneryBundle(scene, bundle.manifest, corrupt), /corrupt/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadSceneryBundle(scene, bundle.manifest, bundle.binary, {signal: controller.signal}), /abort/i);
  const malformed = structuredClone(bundle.manifest);
  malformed.roots[0].meshes[0].vertices.position.offset = bundle.binary.length + 4;
  await assert.rejects(loadSceneryBundle(scene, malformed, bundle.binary), /span/);
  const duringLoad = new AbortController();
  const observer = scene.onNewMeshAddedObservable.add(() => duringLoad.abort());
  await assert.rejects(loadSceneryBundle(scene, bundle.manifest, bundle.binary, {signal: duringLoad.signal}), /abort/i);
  scene.onNewMeshAddedObservable.remove(observer);
  assert.deepEqual([scene.meshes.length, scene.materials.length, scene.textures.length], [meshes, materials, textures]);
});

test("empty MT5 resources do not leave unowned hierarchy nodes in the scene", async t => {
  const {scene} = fixture(t);
  const bytes = new ArrayBuffer(80);
  new Uint8Array(bytes).set(new TextEncoder().encode("HRCM"));
  new DataView(bytes).setUint32(8, 16, true);
  const counts = [scene.meshes.length, scene.transformNodes.length];
  assert.deepEqual(await new Mt5Loader(scene).load(bytes), []);
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length], counts);
});
