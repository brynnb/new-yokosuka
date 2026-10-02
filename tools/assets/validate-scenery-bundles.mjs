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
import {loadNativeCollisionDefinitionForWorld, createNativeWorldCollision} from "../../play/world/NativeWorldCollision.js";
import {suppressDobuitaCinemaFacadeFaces} from "../../play/world/DobuitaCinemaPoster.js";
import {ThirdPersonController, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
  defaultTerrainPredicate, defaultStepSurfacePredicate, nativeCollisionPositionClear} from "../../src/ThirdPersonController.js";

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
function snapshots(index, rays, world) {
  const controller = Object.assign(Object.create(ThirdPersonController.prototype), {
    scene: state.scene, raycastIndex: index, collider: {position: world.spawn.clone()},
    terrainPredicate: defaultTerrainPredicate, stepSurfacePredicate: defaultStepSurfacePredicate,
    options: {...DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS},
  });
  return cases.map(({time, season, weather}) => {
    Object.assign(state, {currentTimeOfDay: time, currentSeason: season, currentWeatherIndex: weather});
    updateModelVisibility(state);
    return {
      layers: state.currentMeshes.filter(root => root.isEnabled()).map(root => root._filename).sort(),
      hits: rays.map(ray => {
        const hit = index.pickWithRay(ray, mesh => mesh.isEnabled() && mesh.isVisible && mesh.isPickable && mesh.metadata?.terrain);
        return hit.hit ? hit.pickedPoint.asArray() : null;
      }),
      support: rays.map(ray => {
        const hit = controller.sampleTerrain(ray.origin.x, ray.origin.z, world.spawn.y);
        return hit ? {height: hit.height, normal: hit.normal.asArray()} : null;
      }),
      spawnHits: index.multiPickWithRay(new B.Ray(world.spawn.add(new B.Vector3(0, 4, 0)), B.Vector3.Down(), 16), defaultTerrainPredicate)
        .map(hit => ({point: hit.pickedPoint.asArray(), normal: hit.getNormal(true, false)?.asArray(),
          mesh: hit.pickedMesh.name, source: hit.pickedMesh.metadata?.sourceModel, face: hit.faceId})),
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
      const original = snapshots(index, rays, world);
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
      const prepared = snapshots(index, rays, world);
      for (const [i, result] of prepared.entries()) {
        assert.deepEqual(result.layers, original[i].layers, `${key}: variant ${JSON.stringify(cases[i])}`);
        assert.ok(original[i].support[40], `${key}: source map must support travel spawn ${world.spawn.asArray()}`);
        assert.ok(result.support[40], `${key}: variant ${i} must support the player at the travel spawn\n${JSON.stringify({original: original[i].spawnHits, prepared: result.spawnHits})}`);
        for (const [j, support] of result.support.entries()) {
          const expected = original[i].support[j];
          assert.equal(Boolean(support), Boolean(expected), `${key}: controller support case ${i}, ray ${j}`);
          if (support) {
            assert.ok(Math.abs(support.height - expected.height) < 0.0001, `${key}: support height case ${i}, ray ${j}`);
            assert.ok(B.Vector3.Distance(B.Vector3.FromArray(support.normal), B.Vector3.FromArray(expected.normal)) < 0.0001,
              `${key}: support normal case ${i}, ray ${j}`);
          }
        }
        for (const [j, point] of result.hits.entries()) {
          const expected = original[i].hits[j];
          assert.equal(Boolean(point), Boolean(expected), `${key}: case ${i}, ray ${j} hit/miss`);
          if (point) assert.ok(B.Vector3.Distance(B.Vector3.FromArray(point), B.Vector3.FromArray(expected)) < 0.0001,
            `${key}: case ${i}, ray ${j}: ${point} vs ${expected}`);
        }
      }
      createNativeWorldCollision({scene, currentMeshes: state.currentMeshes, definition: collision});
      assert.ok(nativeCollisionPositionClear(scene.meshes, world.spawn, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.playerRadius),
        `${key}: travel spawn must clear native wall boundaries`);
      index.dispose(); index = null;
      clearWorldSceneAssets(state);
      assert.deepEqual(counts(scene), baseline, `${key}: resource cleanup`);
      console.info(JSON.stringify({world: key, variants: cases.length, groundRays: cases.length * rays.length,
        groundHits: original.reduce((n, row) => n + row.hits.filter(Boolean).length, 0),
        triangles: geometry.reduce((n, row) => n + row.triangles, 0),
        controllerSamples: cases.length * rays.length, spawnSupportAndWallClearance: "passed",
        result: "matching source geometry counts, layer visibility, player support and cleanup",
        validation: "headless; not a rendered or FPS check"}));
    } finally {
      index?.dispose(); scene.dispose(); engine.dispose();
    }
  }
} finally { globalThis.fetch = nativeFetch; }
