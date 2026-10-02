#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import {loadSceneryBundle} from "../../src/rendering/PreparedSceneryBundle.js";
import {clearWorldSceneAssets} from "../../src/rendering/SceneResources.js";
import {WORLDS} from "../../play/config/worlds.js";
import {Mt5Loader} from "../../src/Mt5Loader.js";
import {configureMt5TexturePack} from "../../play/assets/configureMt5TexturePack.js";
import {PlacementRuntime, applyPlacementTransform} from "../../play/world/PlacementRuntime.js";
import {DoorInteractions} from "../../play/interactions/DoorInteractions.js";
import {VendingInteractions} from "../../play/interactions/VendingInteractions.js";
import {runtimeAssetGroup} from "../../src/RuntimeAssets.js";
import {fetchAssetBuffer} from "../../src/AssetCache.js";
import {fetchAsset} from "../../src/assetLoader.js";

const origin = new URL(process.env.SCENERY_ASSET_ORIGIN || "http://127.0.0.1:5173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") throw new Error("Use the local asset server");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => nativeFetch(new URL(input, origin), options);
const engine = new B.NullEngine();
engine.doNotHandleContextLost = false;
const scene = new B.Scene(engine);
void scene.defaultMaterial;
const counts = () => [scene.meshes.length, scene.transformNodes.length, scene.geometries.length, scene.materials.length, scene.textures.length];
const baseline = counts();
const setMetadata = (root, key, value) => {
  for (const node of [root, ...root.getDescendants(false)]) node.metadata = {...node.metadata, [key]: value};
};
const doors = new DoorInteractions({signedRenderKey: node => node.flag << 16 >> 16,
  getActorPosition: () => B.Vector3.Zero(), setMetadata});
// Exercise the actual registration/bin methods without constructing the DOM panel.
const vending = Object.assign(Object.create(VendingInteractions.prototype), {entries: [], setMetadata});
const worldState = {currentMeshes: []};
const runtime = new PlacementRuntime({scene, state: worldState, setMetadata,
  bundledModels: runtimeAssetGroup("play/assets/dobuita/*.CHRM"),
  bundledTextures: runtimeAssetGroup("play/assets/dobuita/*_textures.bin"), fetchArrayBuffer: fetchAssetBuffer,
  doorInteractions: doors, vendingInteractions: vending,
  inspectableInteractions: {registerAmbient() {}}, authMovementRuntime: {async register() {}},
  drawerInteractions: {attachContainedObjects() {}}, preparePlacedRoots: roots => vending.bindBins(roots)});
function snapshot(root) {
  root.computeWorldMatrix(true);
  return root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0).map(mesh => ({
    name: mesh.name, node: mesh._mt5NodeAddress,
    world: Array.from(mesh.computeWorldMatrix(true).asArray()),
    // Native decoding retains some JS number arrays; both upload Float32 data.
    vertices: Object.fromEntries(mesh.getVerticesDataKinds().map(kind => [kind, Array.from(new Float32Array(mesh.getVerticesData(kind)))])),
    indices: Array.from(mesh.getIndices()),
  }));
}
function compareSurfaces(instance, source) {
  const meshes = root => root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
  const originals = meshes(source);
  for (const [index, mesh] of meshes(instance).entries()) {
    const a = mesh.material, b = originals[index].material;
    for (const key of ["alpha", "backFaceCulling", "twoSidedLighting", "transparencyMode", "alphaCutOff",
      "useAlphaFromDiffuseTexture", "separateCullingPass", "disableDepthWrite", "_mt5AlphaMode"]) {
      assert.equal(a[key], b[key], `${mesh.name}:${key}`);
    }
    for (const key of ["diffuseColor", "ambientColor", "emissiveColor", "specularColor"]) {
      assert.deepEqual(a[key].asArray(), b[key].asArray(), `${mesh.name}:${key}`);
    }
    const ta = a.diffuseTexture, tb = b.diffuseTexture;
    assert.equal(Boolean(ta), Boolean(tb));
    if (!ta) continue;
    assert.deepEqual(ta.getSize(), tb.getSize());
    for (const key of ["wrapU", "wrapV", "uScale", "vScale", "uOffset", "vOffset", "hasAlpha", "samplingMode"]) {
      assert.equal(ta[key], tb[key], `${mesh.name}:texture:${key}`);
    }
    const pa = ta.getInternalTexture()._bufferView, pb = tb.getInternalTexture()._bufferView;
    assert.ok(pa instanceof Uint8Array && pb instanceof Uint8Array, `${mesh.name}: retained pixels`);
    assert.deepEqual(pa, pb, `${mesh.name}: texture pixels`);
  }
}
try {
  state.allFiles = await (await fetchAsset("models.json")).json();
  const manifest = JSON.parse(await readFile(new URL("../../.disc-work/scenery-bundle/world.json", import.meta.url)));
  const binary = new Uint8Array(await readFile(new URL("../../.disc-work/scenery-bundle/world.bin", import.meta.url)));
  // Templates use ordinary materials; omit static texture arrays, which need
  // an actual WebGL context. This verifies geometry/behavior, not appearance.
  const templateManifest = {...manifest, roots: [], arrays: []};
  const bundle = await loadSceneryBundle(scene, templateManifest, binary);
  worldState.preparedSceneryResources = bundle;
  const placements = WORLDS.dobuita.placements.filter(row => bundle.hasModel(row.model));
  await runtime.load(placements, null, "dobuita", {preparedModels: bundle});
  assert.equal(worldState.currentMeshes.length, 70);
  assert.equal(doors.entries.length, 65);
  assert.equal(vending.entries.length, 5);
  let sourceMeshCount = 0;
  for (const model of manifest.templates.map(row => row.model)) {
    const rows = placements.filter(row => row.model === model);
    const {modelBuffer, texturePack} = await runtime.readModelAssets(model, rows);
    const loader = new Mt5Loader(scene);
    configureMt5TexturePack(loader, texturePack);
    const sourceTextures = new Set(scene.textures), sourceMaterials = new Set(scene.materials);
    const [source] = await loader.load(modelBuffer, texturePack);
    for (const row of rows) {
      const instance = worldState.currentMeshes.find(root => root._runtimePlacementRecord === row);
      applyPlacementTransform(source, row);
      assert.deepEqual(snapshot(instance), snapshot(source), `${model} at ${row.position}`);
      compareSurfaces(instance, source);
      assert.deepEqual(instance._mt5Nodes.map(n => n.flag), source._mt5Nodes.map(n => n.flag));
      sourceMeshCount += source.getChildMeshes().filter(m => m.getTotalVertices() > 0).length;
    }
    source.dispose(false, false);
    for (const material of scene.materials.slice()) if (!sourceMaterials.has(material)) material.dispose(false, false);
    for (const texture of scene.textures.slice()) if (!sourceTextures.has(texture)) texture.dispose();
  }
  const meshes = worldState.currentMeshes.flatMap(root => root.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0));
  const uniqueGeometryCount = new Set(meshes.map(mesh => mesh.geometry)).size;
  assert.ok(uniqueGeometryCount < sourceMeshCount);
  for (const door of doors.entries) {
    const before = snapshot(door.root);
    const others = doors.entries.filter(other => other !== door && other.root._filename === door.root._filename);
    const unchanged = others.map(other => snapshot(other.root));
    doors.setPose(door, {progress: 1});
    assert.notDeepEqual(snapshot(door.root), before);
    assert.deepEqual(others.map(other => snapshot(other.root)), unchanged);
    doors.setPose(door, {progress: 0});
  }
  clearWorldSceneAssets(worldState);
  assert.deepEqual(counts(), baseline);
  console.info(JSON.stringify({models: manifest.templates.length, placements: placements.length,
    doors: doors.entries.length, vendingMachines: vending.entries.length, originalGeometryCopies: sourceMeshCount,
    sharedGeometries: uniqueGeometryCount, transformsAndVertices: "identical", texturesAndSurfaceSettings: "identical",
    independentDoors: "passed", cleanup: "passed",
    validation: "headless; no GPU rendering or FPS measurement"}));
} finally {
  scene.dispose(); engine.dispose(); globalThis.fetch = nativeFetch;
}
