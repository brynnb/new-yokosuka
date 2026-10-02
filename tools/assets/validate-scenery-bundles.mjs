#!/usr/bin/env node
// Real source assets and real raycast/variant code, without a browser or GPU.
import assert from "node:assert/strict";
import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import {WORLDS} from "../../play/config/worlds.js";
import {PREPARED_SCENERY_WORLDS, preparedSceneryKey, preparedScenerySpec} from "../../play/world/PreparedSceneryPlan.js";
import {PreparedSceneryRuntime} from "../../play/world/PreparedSceneryRuntime.js";
import {loadSceneryBundle} from "../../src/rendering/PreparedSceneryBundle.js";
import {loadMt5Scene} from "../../src/rendering/SceneAssets.js";
import {createSceneLoaders, clearWorldSceneAssets} from "../../src/rendering/SceneResources.js";
import {createWorldSpatialIndex} from "../../src/rendering/SceneSpatialIndex.js";
import {updateModelVisibility} from "../../src/variants.js";
import {isWorldMapFile} from "../../src/WorldMapFiles.js";
import {prepareWorldCollision} from "../../play/world/WorldCollision.js";
import {loadNativeCollisionDefinitionForWorld} from "../../play/world/NativeWorldCollision.js";
import {suppressDobuitaCinemaFacadeFaces} from "../../play/world/DobuitaCinemaPoster.js";

const origin = new URL(process.env.SCENERY_ASSET_ORIGIN || "http://127.0.0.1:5173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") throw new Error("Use the local asset server");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => nativeFetch(new URL(input, origin), options);
const keys = process.argv[2] === "--all"
  ? [...new Set(PREPARED_SCENERY_WORLDS.map(id => preparedSceneryKey(WORLDS[id])))] : [process.argv[2] || "dobuita"];
const cases = [0, 2, 3].flatMap(time => [0, 1].map(season => ({time, season, weather: season ? 3 : 0})));
const counts = scene => [scene.meshes.length, scene.transformNodes.length, scene.geometries.length, scene.materials.length, scene.textures.length];
function rootGeometry() {
  return state.currentMeshes.map(root => ({filename: root._filename,
    triangles: root.getChildMeshes().reduce((n, mesh) => n + mesh.getTotalIndices() / 3, 0),
  })).sort((a, b) => a.filename.localeCompare(b.filename));
}
function snapshots(index, rays) {
  return cases.map(({time, season, weather}) => {
    Object.assign(state, {currentTimeOfDay: time, currentSeason: season, currentWeatherIndex: weather});
    updateModelVisibility(state);
    return {
      layers: state.currentMeshes.filter(root => root.isEnabled()).map(root => root._filename).sort(),
      hits: rays.map(ray => {
        const hit = index.pickWithRay(ray, mesh => mesh.isEnabled() && mesh.isVisible && mesh.isPickable && mesh.metadata?.terrain);
        return hit.hit ? hit.pickedPoint.asArray() : null;
      }),
    };
  });
}

try {
  for (const key of keys) {
    const world = WORLDS[key];
    if (!preparedSceneryKey(world)) throw new Error(`Unsupported scenery validation: ${key}`);
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    void scene.defaultMaterial;
    Object.assign(state, {scene, engine, currentMeshes: [], currentLoadId: 0,
      currentTimeOfDay: 0, currentSeason: 0, currentWeatherIndex: 0, ...createSceneLoaders(scene)});
    const baseline = counts(scene);
    let index;
    try {
      const runtime = new PreparedSceneryRuntime(state);
      const {manifest} = await runtime.plan(world);
      const spec = preparedScenerySpec(world, state.allFiles);
      const binary = new Uint8Array(await runtime.read(`/scenery-output/${spec.key}/world.bin`));
      const collision = await loadNativeCollisionDefinitionForWorld(world);
      await loadMt5Scene(state, world.prefix, {filenames: new Set(spec.filenames),
        includeHiddenVariants: true, timeOfDayIndex: 0, variantProfile: spec.variantProfile, variantZone: spec.zone});
      if (key === "dobuita") suppressDobuitaCinemaFacadeFaces(state.currentMeshes);
      prepareWorldCollision(state.currentMeshes, {nativeHorizontalCollision: Boolean(collision)});
      const geometry = rootGeometry();
      const rays = [];
      for (const x of [-30, -15, -7, -2, 0, 2, 7, 15, 30]) {
        for (const z of [-30, -15, -7, -2, 0, 2, 7, 15, 30]) {
          rays.push(new B.Ray(new B.Vector3(world.spawn.x + x, world.spawn.y + 40, world.spawn.z + z), B.Vector3.Down(), 200));
        }
      }
      index = createWorldSpatialIndex(scene, state.currentMeshes);
      const original = snapshots(index, rays);
      index.dispose(); index = null;
      clearWorldSceneAssets(state);
      // NullEngine has no texture-array GPU API. Use ordinary materials for
      // the geometry/visibility/picking check only. This does NOT validate the
      // array shader, appearance, lighting or FPS; those require rendered QA.
      const geometryManifest = {...manifest, arrays: [], templates: [],
        roots: manifest.roots.filter(root => isWorldMapFile(root.filename)),
        materials: manifest.materials.map(({array, ...material}) => array === undefined ? material
          : {...material, texture: manifest.arrays[array].textures[0]}),
      };
      const bundle = await loadSceneryBundle(scene, geometryManifest, binary);
      state.preparedSceneryResources = bundle;
      state.currentMeshes = [...bundle.roots];
      assert.deepEqual(rootGeometry(), geometry, `${key}: original map roots and triangle counts`);
      index = createWorldSpatialIndex(scene, state.currentMeshes);
      const prepared = snapshots(index, rays);
      for (const [i, result] of prepared.entries()) {
        assert.deepEqual(result.layers, original[i].layers, `${key}: variant ${JSON.stringify(cases[i])}`);
        for (const [j, point] of result.hits.entries()) {
          const expected = original[i].hits[j];
          assert.equal(Boolean(point), Boolean(expected), `${key}: case ${i}, ray ${j} hit/miss`);
          if (point) assert.ok(B.Vector3.Distance(B.Vector3.FromArray(point), B.Vector3.FromArray(expected)) < 0.0001,
            `${key}: case ${i}, ray ${j}: ${point} vs ${expected}`);
        }
      }
      index.dispose(); index = null;
      clearWorldSceneAssets(state);
      assert.deepEqual(counts(scene), baseline, `${key}: resource cleanup`);
      console.info(JSON.stringify({world: key, variants: cases.length, groundRays: cases.length * rays.length,
        groundHits: original.reduce((n, row) => n + row.hits.filter(Boolean).length, 0),
        triangles: geometry.reduce((n, row) => n + row.triangles, 0),
        result: "matching source geometry counts, layer visibility, ground samples and cleanup",
        validation: "headless; not a rendered or FPS check"}));
    } finally {
      index?.dispose(); scene.dispose(); engine.dispose();
    }
  }
} finally { globalThis.fetch = nativeFetch; }
