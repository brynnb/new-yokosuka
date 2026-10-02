import test from "node:test";
import assert from "node:assert/strict";
import * as B from "@babylonjs/core";
import {compileSceneryBundle, loadSceneryBundle} from "../src/rendering/PreparedSceneryBundle.js";
import {freezeSceneRoots} from "../src/rendering/SceneResources.js";
import {createWorldSpatialIndex} from "../src/rendering/SceneSpatialIndex.js";
import {staticBatchSourceForFace, batchStaticWorldRoots} from "../src/rendering/StaticWorldBatching.js";
import {NativeAseqMapLayerRuntime} from "../play/events/NativeAseqMapLayerRuntime.js";
import {updateModelVisibility} from "../src/variants.js";
import {Mt5Loader, Mt5AlphaToCoverageMaterial} from "../src/Mt5Loader.js";
import {buildAlphaAwareMipChain} from "../src/PvrDecoder.js";
import {applyPlacementTransform} from "../play/world/PlacementRuntime.js";
import {DoorInteractions} from "../play/interactions/DoorInteractions.js";
import {clearWorldSceneAssets} from "../src/rendering/SceneResources.js";

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

test("flattened unbatched scenery retains stretched normal transforms", async t => {
  const {scene, root, make} = fixture(t);
  const mesh = make("stretched-alpha", 0);
  mesh.scaling.set(2, 1, 3);
  mesh.rotation.x = 0.4;
  mesh.material._mt5AlphaMode = "blend";
  mesh.material.alpha = 0.5; // remains separate, unlike merged opaque parts
  mesh.setVerticesData("normal", new Float32Array(Array.from({length: mesh.getTotalVertices()}, () => [1, 1, 1]).flat()));
  freezeSceneRoots([root]);
  const ray = new B.Ray(new B.Vector3(0, 5, 0), B.Vector3.Down(), 10);
  const expected = scene.pickWithRay(ray).getNormal(true);
  const packed = await compileSceneryBundle([root], {textureArrays: false});
  root.dispose(false, true);
  const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary);
  assert.equal(bundle.roots[0].getChildMeshes()[0].nonUniformScaling, true);
  assert.ok(B.Vector3.Distance(scene.pickWithRay(ray).getNormal(true), expected) < 1e-6);
  bundle.dispose();
});

test("active seasonal surfaces stay independently switchable after preparation", async t => {
  const {scene, root, make} = fixture(t);
  root._filename = "S1_OP00_JIMENHAL.MT5";
  const snow = make("snow", 0);
  snow.metadata.mt5TextureId = "snow";
  make("base-a", 0); make("base-b", 3);
  const state = {scene, currentMeshes: [root], currentSeason: 1, currentVariantProfile: {
    groups: [], surfaceGroups: [{assets: ["JIMENHAL"], type: "season", variants: [null, ["snow"]]}],
  }};
  updateModelVisibility(state);
  freezeSceneRoots([root]);
  const packed = await compileSceneryBundle([root], {sceneryFilenames: [root._filename], textureArrays: false});
  assert.equal(packed.manifest.statistics.outputMeshes, 2, "base batches; enabled snow remains separate");
  root.dispose(false, true);
  const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary);
  state.currentMeshes = bundle.roots;
  const preparedSnow = bundle.roots[0].getChildMeshes().find(mesh => mesh.metadata.mt5TextureId === "snow");
  for (const season of [0, 1, 0]) {
    state.currentSeason = season;
    updateModelVisibility(state);
    assert.equal(preparedSnow.isEnabled(), season === 1);
    assert.equal(bundle.roots[0].getChildMeshes().find(mesh => mesh !== preparedSnow).isEnabled(), true);
  }
  bundle.dispose();
});

test("controlled resident geometry preserves native selectors and survives later world batching", async t => {
  const {scene, root, make} = fixture(t);
  root._filename = "S1_OP02_MAP03.MT5";
  root.metadata = {nativeOwner: "test"};
  const masked = make("masked", 0);
  make("retained", 3);
  root._mt5Nodes = [{addr: 3344, mesh: masked, parentAddr: 0, flag: 8}];
  freezeSceneRoots([root]);
  const packed = await compileSceneryBundle([root], {hierarchyFilenames: [root._filename]});
  assert.equal(packed.manifest.roots.length, 0);
  assert.equal(packed.manifest.hierarchies.length, 1);
  root.dispose(false, true);
  const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary);
  const loaded = bundle.roots[0];
  assert.deepEqual(loaded.metadata, {nativeOwner: "test"});
  assert.deepEqual(await batchStaticWorldRoots(bundle.roots), []);
  const masks = new NativeAseqMapLayerRuntime({geometryMasks: [{browserFilename: loaded._filename, nodeAddress: 3344}]});
  masks.load(bundle.roots);
  assert.equal(loaded._mt5NodesByAddress.get(3344).mesh.isEnabled(), false);
  assert.equal(loaded.getChildMeshes().find(mesh => mesh.name === "retained").isEnabled(), true);
  masks.clear();
  assert.equal(loaded._mt5NodesByAddress.get(3344).mesh.isEnabled(), true);
  bundle.dispose();
  // Cancellation after the last controlled root must clean it up too.
  const counts = [scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.textures.length];
  const controller = new AbortController();
  const observer = scene.onNewMeshAddedObservable.add(() => controller.abort());
  await assert.rejects(loadSceneryBundle(scene, packed.manifest, packed.binary, {signal: controller.signal}), /abort/i);
  scene.onNewMeshAddedObservable.remove(observer);
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.textures.length], counts);
});

test("prepared doors share geometry but retain independent native pivots, picks and lifetime", async t => {
  const {scene, root, make} = fixture(t);
  // Babylon creates this scene-owned material lazily during picking.
  void scene.defaultMaterial;
  const counts = [scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.textures.length];
  const panel = new B.TransformNode("door-pivot", scene);
  panel.parent = root;
  panel.position.x = 0.8;
  const leaf = make("door-leaf", 0);
  leaf.parent = panel;
  root._mt5Nodes = [{addr: 64, flag: 8, parentAddr: 0, rot: {x: 0, y: 0, z: 0}, mesh: panel}];
  panel._mt5Node = root._mt5Nodes[0];
  const originalIndices = [...leaf.getIndices()];
  const packed = await compileSceneryBundle([], {modelTemplates: [{model: "door.MT5", roots: [root]}], yieldWork: async () => {}});
  root.dispose(false, true);
  const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary);
  const [first] = bundle.instantiate("door.MT5");
  const [second] = bundle.instantiate("door.MT5");
  second.position.x = 3;
  const a = first.getChildMeshes()[0], b = second.getChildMeshes()[0];
  assert.equal(a.geometry, b.geometry);
  assert.equal(a.material, b.material);
  assert.notEqual(first._mt5Nodes[0], second._mt5Nodes[0]);
  assert.equal(first._mt5Nodes[0].mesh.position.x, 0.8);
  const doors = new DoorInteractions({signedRenderKey: node => node.flag, getActorPosition: () => B.Vector3.Zero(),
    setMetadata(node, key, value) { node.metadata = {...node.metadata, [key]: value}; }});
  const door = doors.registerHinged(first, {});
  const other = doors.registerHinged(second, {});
  first.computeWorldMatrix(true); second.computeWorldMatrix(true);
  const ray = new B.Ray(new B.Vector3(3.8, 10, 0), B.Vector3.Down(), 20);
  assert.equal(scene.pickWithRay(ray, mesh => mesh === b).hit, true);
  doors.toggle(door); doors.update(1);
  assert.equal(door.state, "open");
  assert.equal(other.state, "closed");
  assert.equal(second._mt5Nodes[0].mesh.rotationQuaternion, null);
  assert.notEqual(first._mt5Nodes[0].mesh.rotationQuaternion, null);
  assert.deepEqual([...b.getIndices()], originalIndices);
  first.dispose(false, false);
  assert.equal(b.geometry.isDisposed(), false);
  assert.equal(scene.pickWithRay(ray, mesh => mesh === b).hit, true);
  const state = {currentMeshes: [second], preparedSceneryResources: bundle};
  clearWorldSceneAssets(state);
  bundle.dispose();
  assert.equal(state.preparedSceneryResources, null);
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length + 1, scene.materials.length, scene.textures.length], counts,
    scene.materials.map(material => material.name).join(","));
  assert.throws(() => bundle.instantiate("door.MT5"), /disposed/);
});

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

test("prepared model failures and cancellation clean partial instances without damaging existing copies", async t => {
  const {scene, root, make} = fixture(t);
  make("first", 0); make("last", 3);
  const packed = await compileSceneryBundle([], {modelTemplates: [{model: "door.MT5", roots: [root]}]});
  root.dispose(false, true);
  const baseline = [scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.textures.length];
  const controller = new AbortController();
  const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary, {signal: controller.signal});
  const [existing] = bundle.instantiate("door.MT5");
  const nodeCounts = [scene.meshes.length, scene.transformNodes.length];
  const records = packed.manifest.templates[0].roots[0].nodes;
  const lastParent = records.at(-1).parent;
  records.at(-1).parent = records.length;
  assert.throws(() => bundle.instantiate("door.MT5"), /hierarchy/);
  records.at(-1).parent = lastParent;
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length], nodeCounts);
  let created = 0;
  // Babylon defers its mesh-added observable; interrupt actual construction to
  // exercise cancellation after the final node, before an instance is returned.
  const addMesh = scene.addMesh.bind(scene);
  t.mock.method(scene, "addMesh", (...args) => {
    addMesh(...args);
    if (++created === 2) controller.abort();
  });
  assert.throws(() => bundle.instantiate("door.MT5"), /abort/i);
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length], nodeCounts);
  assert.ok(existing.getChildMeshes().every(mesh => !mesh.geometry.isDisposed()));
  assert.throws(() => bundle.instantiate("door.MT5"), /abort/i);
  bundle.dispose();
  assert.deepEqual([scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.textures.length], baseline);
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

test("prepared alpha edges follow destination MSAA instead of compiler settings", async t => {
  for (const sourceSamples of [1, 4]) for (const targetSamples of [1, 4]) {
    const {scene, root, make} = fixture(t);
    const engine = scene.getEngine();
    Object.defineProperty(engine, "currentSampleCount", {get: () => targetSamples});
    const coverageChanges = [];
    t.mock.method(engine, "setAlphaToCoverage", value => coverageChanges.push(value));
    const leaf = make("leaf", 0);
    leaf.material.dispose(false, true);
    const pixels = new Uint8Array([220, 180, 70, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const texture = new B.RawTexture(pixels, 2, 2, 5, scene, true, false);
    texture.hasAlpha = true;
    Object.assign(texture.getInternalTexture(), {_bufferView: pixels, format: 5, type: 0,
      _pvrUploadPolicy: {alphaAware: true, gradientAlpha: false, preserveCoverage: sourceSamples === 1}});
    leaf.material = sourceSamples === 4 ? new Mt5AlphaToCoverageMaterial("leaf", scene) : new B.StandardMaterial("leaf", scene);
    Object.assign(leaf.material, {diffuseTexture: texture, _mt5AlphaMode: "alphatest", useAlphaFromDiffuseTexture: true,
      transparencyMode: sourceSamples === 4 ? B.Material.MATERIAL_ALPHABLEND : B.Material.MATERIAL_ALPHATEST});
    leaf._mt5AlphaToCoverage = sourceSamples === 4;
    freezeSceneRoots([root]);
    const packed = await compileSceneryBundle([root], {textureArrays: false, yieldWork: async () => {}});
    root.dispose(false, true);
    const mips = [];
    t.mock.method(engine, "_uploadArrayBufferViewToTexture", (_texture, data) => mips.push([...data]));
    const bundle = await loadSceneryBundle(scene, packed.manifest, packed.binary);
    const mesh = bundle.roots[0].getChildMeshes()[0];
    assert.equal(mesh.material instanceof Mt5AlphaToCoverageMaterial, targetSamples === 4);
    assert.equal(mesh.material.needAlphaBlendingForMesh(mesh), false);
    assert.equal(mesh.material.transparencyMode,
      targetSamples === 4 ? B.Material.MATERIAL_ALPHABLEND : B.Material.MATERIAL_ALPHATEST);
    assert.equal(mesh._mt5AlphaToCoverage === true, targetSamples === 4);
    mesh.onBeforeBindObservable.notifyObservers(mesh);
    mesh.onAfterRenderObservable.notifyObservers(mesh);
    assert.deepEqual(coverageChanges, targetSamples === 4 ? [true, false] : []);
    assert.deepEqual(mips, buildAlphaAwareMipChain(pixels, 2, 2, {preserveCoverage: targetSamples === 1})
      .slice(1).map(level => [...level.pixels]));
    bundle.dispose();
  }
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

test("MT5 parsing releases unused pack textures but retains textures on hidden surfaces", async t => {
  const {scene} = fixture(t);
  const loader = new Mt5Loader(scene);
  const baseline = scene.textures.length;
  const bytes = new ArrayBuffer(80);
  new Uint8Array(bytes).set(new TextEncoder().encode("HRCM"));
  new DataView(bytes).setUint32(4, 12, true);
  new DataView(bytes).setUint32(8, 16, true);
  let used, unused;
  t.mock.method(loader, "readTextures", () => {
    used = new B.RawTexture(new Uint8Array([1, 2, 3, 255]), 1, 1, 5, scene);
    unused = new B.RawTexture(new Uint8Array([4, 5, 6, 255]), 1, 1, 5, scene);
    loader.textureCache.set(0, used); loader.textureCache.set(1, unused);
    const orphan = new B.StandardMaterial("discarded surface", scene);
    orphan.diffuseTexture = unused.clone();
    loader.materialCache.set("discarded surface", orphan);
  });
  t.mock.method(loader, "applyNodeHierarchyTransforms", root => {
    const mesh = B.MeshBuilder.CreateGround("hidden surface", {}, scene);
    mesh.parent = root;
    mesh.setEnabled(false);
    mesh.material = new B.StandardMaterial("used", scene);
    mesh.material.diffuseTexture = used;
    loader.materialCache.set("used", mesh.material);
  });
  const roots = await loader.load(bytes);
  assert.equal(scene.textures.includes(unused), false);
  assert.equal(scene.textures.includes(used), true);
  assert.equal(scene.materials.some(material => material.name === "discarded surface"), false);
  assert.deepEqual([...loader.textureCache.values()], [used]);
  clearWorldSceneAssets({currentMeshes: roots, loader});
  assert.equal(scene.textures.length, baseline);
});

test("fixed placements batch across roots while retaining transforms, source identity and collision roles", async t => {
  const {scene, root, make} = fixture(t);
  const layer = new B.TransformNode("fixed-props", scene);
  for (let i = 0; i < 2; i++) {
    const prop = new B.TransformNode(`prop-${i}`, scene);
    prop.parent = layer;
    const placement = {id: `prop-${i}`, model: "PROP.MT5", position: [4 * i, 2, 0],
      rotationDegrees: [0, 90, 0], scale: [2, 1, 0.5]};
    applyPlacementTransform(prop, placement);
    const identity = {id: placement.id, model: placement.model, objectTag: null};
    prop.metadata = {sceneryPlacement: identity};
    const mesh = make(`surface-${i}`, 0);
    mesh.parent = prop;
    mesh.metadata = {terrain: false, cameraBlocker: true, sourceModel: placement.model, sceneryPlacement: identity};
  }
  freezeSceneRoots([root, layer]);
  const original = layer.getChildMeshes()[0];
  const points = original.getVerticesData("position");
  const expected = B.Vector3.TransformCoordinates(B.Vector3.FromArray(points), original.getWorldMatrix());
  const bundle = await compileSceneryBundle([layer], {fixedPlacementLayer: layer, textureArrays: false, yieldWork: async () => {}});
  assert.equal(bundle.manifest.statistics.outputMeshes, 1);
  layer.dispose(false, true);
  const loaded = await loadSceneryBundle(scene, bundle.manifest, bundle.binary);
  t.after(() => loaded.dispose());
  const mesh = loaded.roots[0].getChildMeshes()[0];
  assert.equal(mesh.metadata.terrain, false);
  assert.equal(mesh.metadata.cameraBlocker, true);
  assert.equal(mesh.metadata.sceneryPlacement, undefined, "identity belongs to a face range, not the entire batch");
  assert.equal(staticBatchSourceForFace(mesh, 0).sceneryPlacement.id, "prop-0");
  assert.equal(staticBatchSourceForFace(mesh, mesh.metadata.staticBatchSources[1].firstFace).sceneryPlacement.id, "prop-1");
  const actual = B.Vector3.TransformCoordinates(B.Vector3.FromArray(mesh.getVerticesData("position")), mesh.getWorldMatrix());
  assert.ok(B.Vector3.Distance(expected, actual) < 1e-6);
});

test("compiler never accepts live placement ownership just because its matrices are frozen", async t => {
  const {scene, root, make} = fixture(t);
  const mesh = make("owned", 0);
  const layer = new B.TransformNode("fixed-props", scene);
  root.parent = layer;
  root._runtimePlacement = true;
  root.metadata = {sceneryPlacement: {id: "owned"}, runtimeObject: {objectTag: "door"}};
  freezeSceneRoots([layer]);
  await assert.rejects(compileSceneryBundle([root]), /Unapproved/);
  await assert.rejects(compileSceneryBundle([layer], {fixedPlacementLayer: layer}), /Runtime-owned/);
  delete root.metadata.runtimeObject;
  mesh.metadata.interactiveDoor = {};
  await assert.rejects(compileSceneryBundle([layer], {fixedPlacementLayer: layer}), /Runtime-owned/);
  delete mesh.metadata.interactiveDoor;
  root.setEnabled(false);
  await assert.rejects(compileSceneryBundle([layer], {fixedPlacementLayer: layer}), /Invalid fixed-placement/);
});
