#!/usr/bin/env node
// Real source assets and real raycast/variant code, without a browser or GPU.
import assert from "node:assert/strict";
import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import {WORLDS} from "../../play/config/worlds.js";
import {PREPARED_SCENERY_WORLDS, preparedSceneryKey} from "../../play/world/PreparedSceneryPlan.js";
import {PreparedSceneryRuntime} from "../../play/world/PreparedSceneryRuntime.js";
import {loadSceneryBundle} from "../../src/rendering/PreparedSceneryBundle.js";
import {loadMt5Scene, loadMt7Scene} from "../../src/rendering/SceneAssets.js";
import {createSceneLoaders, clearWorldSceneAssets} from "../../src/rendering/SceneResources.js";
import {createWorldSpatialIndex} from "../../src/rendering/SceneSpatialIndex.js";
import {updateModelVisibility} from "../../src/variants.js";
import {WorldMapLayerState} from "../../src/rendering/WorldMapLayerState.js";
import {installWorldMt7MapEffect} from "../../src/rendering/MapEffects.js";
import {bindShenmue2NativeDoors} from "../../play/world/Shenmue2NativeDoors.js";
import {DoorInteractions} from "../../play/interactions/DoorInteractions.js";
import shenmue2Transitions from "../../play/data/shenmue2-boundary-transitions.json" with {type: "json"};
import {NativeAseqMapLayerRuntime} from "../../play/events/NativeAseqMapLayerRuntime.js";
import {NativeAseqSceneObjectRuntime} from "../../play/events/NativeAseqSceneObjectRuntime.js";
import {NativeAseqAttachedObjectRuntime} from "../../play/events/NativeAseqAttachedObjectRuntime.js";
import {prepareWorldCollision} from "../../play/world/WorldCollision.js";
import {loadNativeCollisionDefinitionForWorld, createNativeWorldCollision} from "../../play/world/NativeWorldCollision.js";
import {suppressDobuitaCinemaFacadeFaces} from "../../play/world/DobuitaCinemaPoster.js";
import {keepOnlyYouArcadeMap01Jukebox, hideYouArcadeScreenFaces} from "../../play/arcade/ArcadeFixtures.js";
import {ThirdPersonController, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS,
  defaultTerrainPredicate, defaultStepSurfacePredicate, nativeCollisionPositionClear} from "../../src/ThirdPersonController.js";

const origin = new URL(process.env.SCENERY_ASSET_ORIGIN || "http://127.0.0.1:5173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") throw new Error("Use the local asset server");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => nativeFetch(new URL(input, origin), options);
const selection = process.argv[2];
const keys = ["--all", "--shenmue1", "--shenmue2"].includes(selection)
  ? [...new Set(PREPARED_SCENERY_WORLDS.filter(id => selection === "--all"
    || (WORLDS[id].assetFormat === "MT7") === (selection === "--shenmue2")).map(id => preparedSceneryKey(WORLDS[id])))]
  : [selection || "dobuita"];
const cases = [0, 2, 3].flatMap(time => [0, 1].map(season => ({time, season, weather: season ? 3 : 0})));
const counts = scene => [scene.meshes.length, scene.transformNodes.length, scene.geometries.length, scene.materials.length, scene.textures.length];
// Baking a hierarchy into float32 world-space vertices introduces a few ULPs
// of rounding. S2 coordinates commonly sit hundreds of units from the origin;
// use a scale-aware bound (eight float32 steps), not an origin-sized epsilon.
const positionTolerance = point => Math.max(0.0001, 8 * 2 ** -23 * Math.max(...point.map(Math.abs)));
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
    if (world.assetFormat === "MT7") {
      new WorldMapLayerState().load(world, state.currentMeshes, new Date(Date.UTC(1986, 10, 29, [10, 16, 19, 23][time])));
    } else updateModelVisibility(state);
    return {
      layers: state.currentMeshes.filter(root => root.isEnabled()).map(root => root._filename).sort(),
      hits: rays.map(ray => {
        const hit = index.pickWithRay(ray, mesh => mesh.isEnabled() && mesh.isVisible && mesh.isPickable
          && (world.cutsceneOnly || mesh.metadata?.terrain));
        return hit.hit ? hit.pickedPoint.asArray() : null;
      }),
      support: rays.map(ray => {
        const hit = controller.sampleTerrain(ray.origin.x, ray.origin.z, world.spawn.y);
        return hit ? {height: hit.height, normal: hit.normal.asArray()} : null;
      }),
      spawnHits: index.multiPickWithRay(new B.Ray(world.spawn.add(new B.Vector3(0, 4, 0)), B.Vector3.Down(), 16), defaultTerrainPredicate)
        .map(hit => ({point: hit.pickedPoint.asArray(), normal: hit.getNormal(true, false)?.asArray(),
          mesh: hit.pickedMesh.name, source: hit.pickedMesh.metadata?.sourceModel, face: hit.faceId})),
      surfaces: state.currentMeshes.flatMap(root => root.getChildMeshes()
        .filter(mesh => mesh.metadata?.environmentSurfaceVariant)
        .map(mesh => [root._filename, mesh.metadata.mt5TextureId, mesh.isEnabled(false)])).sort(),
    };
  });
}

function shenmue2OwnershipSnapshot(world) {
  if (world.assetFormat !== "MT7") return null;
  const roots = state.currentMeshes;
  const props = roots.filter(root => root.metadata?.shenmue2SceneAssetKind === "PROP").map(root => ({filename: root._filename,
    nodes: root._mt7Nodes.map(({sourceNode, transform}) => ({offset: sourceNode.offset, id: sourceNode.id,
      position: sourceNode.position, matrix: Array.from(transform.computeWorldMatrix(true).asArray())})),
  })).sort((a, b) => a.filename.localeCompare(b.filename));
  const setMetadata = (root, key, value) => {
    for (const node of [root, ...root.getDescendants(false)]) {
      node.metadata = {...node.metadata, [key]: value};
      node.unfreezeWorldMatrix();
    }
  };
  const runtime = new DoorInteractions({setMetadata});
  const doors = bindShenmue2NativeDoors({currentMeshes: roots, worldId: world.id,
    transitions: shenmue2Transitions.transitions, doorInteractions: runtime, setMetadata});
  assert.equal(doors.length, shenmue2Transitions.transitions.filter(row => row.source.worldId === world.id && row.source.nativeDoor).length,
    `${world.id}: every native door must bind`);
  const matrices = door => door.nodes.flatMap(node => [node, ...node.getDescendants(false)])
    .map(node => Array.from(node.computeWorldMatrix(true).asArray()));
  const doorStates = doors.map(door => {
    const closed = matrices(door);
    runtime.toggle(door); runtime.update(2);
    const open = matrices(door);
    assert.notDeepEqual(open, closed, `${world.id}: door ${door.transition.id} must actually move`);
    runtime.toggle(door); runtime.update(2);
    assert.deepEqual(matrices(door), closed, `${world.id}: door closes to its bind pose`);
    return {id: door.transition.id, closed, open};
  });
  const effects = roots.filter(root => root._mt7MapEffectDefinition).map(root => {
    const runtime = root._worldMt7MapEffectRuntime || installWorldMt7MapEffect(root);
    assert.ok(runtime, `${world.id}: native map effect binds`);
    runtime.update(2);
    const offsets = [...new Set(runtime.bindings.map(({texture}) => JSON.stringify([texture.uOffset, texture.vOffset])))].sort();
    runtime.update(0);
    return {filename: root._filename, effect: runtime.effect, offsets};
  }).sort((a, b) => a.filename.localeCompare(b.filename));
  return {props, doors: doorStates, effects};
}

// Exercise the real owners on both decoded and prepared resident resources.
// Package-created actors/effects are unchanged and are not fabricated here.
async function introOwnershipSnapshots(spec) {
  if (!spec.ownership?.environments) return null;
  const roots = state.currentMeshes;
  const initial = roots.map(root => [root, root.isEnabled(false)]);
  const matrices = root => [root, ...root.getDescendants(false)].map(node => ({name: node === root ? root._filename : node.name,
    matrix: node.computeWorldMatrix(true).asArray(), enabled: node.isEnabled(false)}));
  const results = {};
  for (const [id, environment] of Object.entries(spec.ownership.environments)) {
    const layers = new NativeAseqMapLayerRuntime({definitions: environment.mapLayers,
      geometryMasks: environment.mapGeometryMasks});
    const row = results[id] = {};
    layers.load(roots);
    row.masks = layers.maskedGeometry.map(({mesh}) => [mesh._mt5Node?.addr, mesh.isEnabled()]);
    row.layers = [false, true].map(visible => {
      layers.applyActivity({activityId: "bundle-validation", browserMapVisibility: (environment.mapLayers || [])
        .map(definition => ({nativeName: definition.nativeName, visible}))});
      return [...layers.roots].map(([name, root]) => [name, root.isEnabled(false)]);
    });
    layers.clear();
    const resident = values => Object.fromEntries(Object.entries(values || {}).filter(([, value]) =>
      roots.some(root => root._filename === value.browserFilename)));
    const definitions = resident(environment.sceneObjects);
    if (Object.keys(definitions).length) {
      const objects = new NativeAseqSceneObjectRuntime({definitions});
      await objects.load(roots);
      objects.prepareActivity({activityId: "bundle-validation", nativeSceneObjectStates:
        [...objects.persistentActorTags].map(actorTag => ({actorTag, presented: true}))});
      const before = [...objects.objects.values()].map(record => matrices(record.root));
      const records = objects.begin("probe", [...objects.objects.keys()]);
      for (const record of records) {
        objects.activate("probe", record.actorCode);
        record.root.position.x += 3;
      }
      row.moved = records.map(record => matrices(record.root));
      objects.end("probe", "cancelled");
      assert.deepEqual([...objects.objects.values()].map(record => matrices(record.root)), before, `${id}: cancelled object poses`);
      objects.clear();
    }
    const attachments = resident(environment.attachedObjects);
    if (Object.keys(attachments).length) {
      const attached = new NativeAseqAttachedObjectRuntime({definitions: attachments, resolveActor: () => null});
      await attached.load(roots);
      row.attached = [...attached.objects].map(([tag, {root}]) => [tag, matrices(root),
        root._mt5Nodes.map(node => [node.addr, node.flag, node.parentAddr])]);
      attached.clear();
    }
    for (const [root, enabled] of initial) root.setEnabled(enabled);
  }
  return results;
}

function interiorOwnershipSnapshot(world, spec) {
  if (world.id !== "arcade") return null;
  const roots = state.currentMeshes;
  // Real fixture owners address these exact names, face IDs and UVs. Compare
  // before they mutate anything, then run the same map suppression as /play.
  const surfaces = spec.ownership.surfaceSelectors.flatMap(({sourceFilename, meshName}) =>
    roots.filter(root => root._filename === sourceFilename).flatMap(root => root.getChildMeshes())
      .filter(mesh => mesh.name === meshName && mesh.getTotalVertices() > 0)
      .map(mesh => ({sourceFilename, meshName, matrix: mesh.computeWorldMatrix(true).asArray(),
        positions: Array.from(new Float32Array(mesh.getVerticesData("position"))),
        uvs: Array.from(new Float32Array(mesh.getVerticesData("uv"))), indices: Array.from(mesh.getIndices())})));
  assert.ok(surfaces.length >= spec.ownership.surfaceSelectors.length, "all arcade fixture selectors resolve");
  const jukebox = keepOnlyYouArcadeMap01Jukebox(roots);
  assert.equal(jukebox.retainedTriangles, 1250, "native jukebox node remains selectable");
  hideYouArcadeScreenFaces(roots);
  return {surfaces, jukebox};
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
      const {manifest, spec} = await runtime.plan(world);
      const binary = new Uint8Array(await runtime.read(`/scenery-output/${spec.key}/world.bin`));
      const collision = await loadNativeCollisionDefinitionForWorld(world);
      if (world.assetFormat === "MT7") await loadMt7Scene(state, spec.records, {batchStatic: false, installEffects: false});
      else await loadMt5Scene(state, world.prefix, {filenames: new Set(spec.filenames),
        includeHiddenVariants: true, timeOfDayIndex: 0, variantProfile: spec.variantProfile, variantZone: spec.zone});
      if (key === "dobuita") suppressDobuitaCinemaFacadeFaces(state.currentMeshes);
      const originalInterior = interiorOwnershipSnapshot(world, spec);
      prepareWorldCollision(state.currentMeshes, {interior: world.interior === true, nativeHorizontalCollision: Boolean(collision)});
      const geometry = rootGeometry();
      const originalOwnership = await introOwnershipSnapshots(spec);
      const originalMt7 = shenmue2OwnershipSnapshot(world);
      const rays = [];
      for (const x of [-30, -15, -7, -2, 0, 2, 7, 15, 30]) {
        for (const z of [-30, -15, -7, -2, 0, 2, 7, 15, 30]) {
          rays.push(new B.Ray(new B.Vector3(world.spawn.x + x, world.spawn.y + 40, world.spawn.z + z), B.Vector3.Down(), 200));
        }
      }
      index = createWorldSpatialIndex(scene, state.currentMeshes);
      const original = snapshots(index, rays, world);
      const baselineIssues = [];
      if (world.assetFormat === "MT7") for (const [i, row] of original.entries()) {
        if (!row.support[40]) baselineIssues.push(`Original loader has no ground support at configured spawn ${world.spawn.asArray()} (variant ${i})`);
      }
      createNativeWorldCollision({scene, currentMeshes: state.currentMeshes, definition: collision});
      const originalWallClearance = nativeCollisionPositionClear(scene.meshes, world.spawn, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.playerRadius);
      if (!originalWallClearance && world.assetFormat === "MT7") baselineIssues.push(`Original spawn overlaps native walls: ${world.spawn.asArray()}`);
      index.dispose(); index = null;
      clearWorldSceneAssets(state);
      // NullEngine has no texture-array GPU API. Use ordinary materials for
      // the geometry/visibility/picking check only. This does NOT validate the
      // array shader, appearance, lighting or FPS; those require rendered QA.
      const geometryManifest = {...manifest, arrays: [], templates: [],
        roots: manifest.roots.filter(root => spec.filenames.includes(root.filename)),
        materials: manifest.materials.map(({array, ...material}) => array === undefined ? material
          : {...material, texture: manifest.arrays[array].textures[0]}),
      };
      const bundle = await loadSceneryBundle(scene, geometryManifest, binary);
      state.preparedSceneryResources = bundle;
      state.currentMeshes = [...bundle.roots];
      assert.deepEqual(interiorOwnershipSnapshot(world, spec), originalInterior, `${key}: fixture geometry, UVs, faces and native jukebox selection`);
      assert.deepEqual(rootGeometry(), geometry, `${key}: original map roots and triangle counts`);
      assert.deepEqual(await introOwnershipSnapshots(spec), originalOwnership, `${key}: native ownership, masks and moving geometry`);
      assert.deepEqual(shenmue2OwnershipSnapshot(world), originalMt7, `${key}: native prop hierarchies, opening/closing doors and scrolling textures`);
      index = createWorldSpatialIndex(scene, state.currentMeshes);
      const prepared = snapshots(index, rays, world);
      for (const [i, result] of prepared.entries()) {
        assert.deepEqual(result.layers, original[i].layers, `${key}: variant ${JSON.stringify(cases[i])}`);
        assert.deepEqual(result.surfaces, original[i].surfaces, `${key}: seasonal surface ownership`);
        if (!world.cutsceneOnly && (world.assetFormat !== "MT7" || original[i].support[40])) {
          assert.ok(original[i].support[40], `${key}: source map must support travel spawn ${world.spawn.asArray()}`);
          assert.ok(result.support[40], `${key}: variant ${i} must support the player at the travel spawn\n${JSON.stringify({original: original[i].spawnHits, prepared: result.spawnHits})}`);
        }
        for (const [j, support] of result.support.entries()) {
          const expected = original[i].support[j];
          assert.equal(Boolean(support), Boolean(expected), `${key}: controller support case ${i}, ray ${j}`);
          if (support) {
            assert.ok(Math.abs(support.height - expected.height) < positionTolerance([rays[j].origin.x, expected.height, rays[j].origin.z]),
              `${key}: support height case ${i}, ray ${j}: ${JSON.stringify({support, expected, ray: rays[j].origin.asArray()})}`);
            assert.ok(B.Vector3.Distance(B.Vector3.FromArray(support.normal), B.Vector3.FromArray(expected.normal)) < 0.0001,
              `${key}: support normal case ${i}, ray ${j}`);
          }
        }
        for (const [j, point] of result.hits.entries()) {
          const expected = original[i].hits[j];
          assert.equal(Boolean(point), Boolean(expected), `${key}: case ${i}, ray ${j} hit/miss`);
          if (point) assert.ok(B.Vector3.Distance(B.Vector3.FromArray(point), B.Vector3.FromArray(expected)) < positionTolerance(expected),
            `${key}: case ${i}, ray ${j}: ${point} vs ${expected}`);
        }
      }
      createNativeWorldCollision({scene, currentMeshes: state.currentMeshes, definition: collision});
      const preparedWallClearance = nativeCollisionPositionClear(scene.meshes, world.spawn, DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.playerRadius);
      assert.equal(preparedWallClearance, originalWallClearance, `${key}: native wall clearance matches original loader`);
      if (world.assetFormat !== "MT7") assert.ok(world.cutsceneOnly || preparedWallClearance, `${key}: travel spawn must clear native wall boundaries`);
      index.dispose(); index = null;
      clearWorldSceneAssets(state);
      assert.deepEqual(counts(scene), baseline, `${key}: resource cleanup`);
      console.info(JSON.stringify({world: key, variants: cases.length, groundRays: cases.length * rays.length,
        groundHits: original.reduce((n, row) => n + row.hits.filter(Boolean).length, 0),
        triangles: geometry.reduce((n, row) => n + row.triangles, 0),
        controllerSamples: cases.length * rays.length,
        spawnSupportAndWallClearance: world.cutsceneOnly ? "not applicable to authored cinematic spawn"
          : baselineIssues.length ? "pre-existing source issues; no bundle regression" : "passed",
        baselineIssues,
        cinematicOwners: Object.keys(originalOwnership || {}),
        mt7Owners: originalMt7 ? {props: originalMt7.props.length, doors: originalMt7.doors.length, effects: originalMt7.effects.length} : null,
        interiorFixtures: originalInterior ? {surfaces: originalInterior.surfaces.length, jukebox: originalInterior.jukebox} : null,
        result: "matching source geometry counts, layer visibility, player support and cleanup",
        validation: "headless; not a rendered or FPS check"}));
    } finally {
      index?.dispose(); scene.dispose(); engine.dispose();
    }
  }
} finally { globalThis.fetch = nativeFetch; }
