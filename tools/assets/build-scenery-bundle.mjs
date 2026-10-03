#!/usr/bin/env node
// Offline geometry compilation: NullEngine constructs buffers without rendering.
// The local asset server supplies the same original files as the game loader.
import {mkdir, readFile, writeFile, rename} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {cpus} from "node:os";
import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import {createSceneLoaders, freezeSceneRoots} from "../../src/rendering/SceneResources.js";
import {loadMt5Scene, loadMt7Scene} from "../../src/rendering/SceneAssets.js";
import {compileSceneryBundle} from "../../src/rendering/PreparedSceneryBundle.js";
import {WORLDS} from "../../play/config/worlds.js";
import {PREPARED_SCENERY_WORLDS, preparedSceneryKey, preparedScenerySpec} from "../../play/world/PreparedSceneryPlan.js";
import {fetchAsset, fetchShenmue2Catalog} from "../../src/assetLoader.js";
import {fetchAssetBuffer} from "../../src/AssetCache.js";
import {runtimeAssetGroup} from "../../src/RuntimeAssets.js";
import {PlacementRuntime, applyPlacementTransform} from "../../play/world/PlacementRuntime.js";
import {ScheduledSceneObjectCatalog} from "../../play/world/ScheduledSceneObjectCatalog.js";
import {configureMt5TexturePack} from "../../play/assets/configureMt5TexturePack.js";
import {Mt5Loader} from "../../src/Mt5Loader.js";
import {suppressDobuitaCinemaFacadeFaces} from "../../play/world/DobuitaCinemaPoster.js";
import {prepareWorldCollision} from "../../play/world/WorldCollision.js";
import {loadNativeCollisionDefinitionForWorld} from "../../play/world/NativeWorldCollision.js";
import {auditFixedSceneryPlacements, sceneryPlacementId} from "./scenery-placement-policy.js";

const project = new URL("../../", import.meta.url);
const args = process.argv.slice(2);
if (["--all", "--shenmue1", "--shenmue2"].includes(args[0])) {
  if (args.length !== 1) throw new Error("Use build:scenery -- --all, --shenmue1, --shenmue2 or <world>");
  const sample = () => cpus().reduce((sum, cpu) => ({idle: sum.idle + cpu.times.idle,
    total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0)}), {idle: 0, total: 0});
  const before = sample();
  await new Promise(resolve => setTimeout(resolve, 500));
  const after = sample();
  const used = 1 - (after.idle - before.idle) / Math.max(1, after.total - before.total);
  const workers = used > 0.5 ? 2 : used > 0.03 ? 4 : 6;
  const queue = [...new Set(PREPARED_SCENERY_WORLDS.filter(id => args[0] === "--all"
    || (WORLDS[id].assetFormat === "MT7") === (args[0] === "--shenmue2")).map(id => preparedSceneryKey(WORLDS[id])))];
  console.info(`[Scenery] ${queue.length} bundles, ${workers} workers (CPU ${(used * 100).toFixed(1)}%)`);
  const failures = [];
  await Promise.all(Array.from({length: workers}, async () => {
    while (queue.length) {
      const key = queue.shift();
      await new Promise(resolve => {
        const child = spawn(process.execPath, ["--max-old-space-size=1024", import.meta.filename, key], {stdio: "inherit"});
        child.on("error", error => { failures.push(`${key}: ${error.message}`); resolve(); });
        child.on("exit", code => { if (code !== 0) failures.push(key); resolve(); });
      });
    }
  }));
  if (failures.length) throw new Error(`Failed scenery builds: ${failures.join(", ")}`);
  process.exit(0);
}
const world = WORLDS[args[0] || "dobuita"];
const key = preparedSceneryKey(world);
if (args.length > 1 || !key) throw new Error(`Choose a prepared world: ${PREPARED_SCENERY_WORLDS.join(", ")}`);
const origin = new URL(process.env.SCENERY_ASSET_ORIGIN || "http://127.0.0.1:5173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") {
  throw new Error("SCENERY_ASSET_ORIGIN must name the local HTTP asset server");
}
const output = new URL(`.disc-work/scenery-bundle/${key}/`, project);
const sources = new Map();
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input, origin);
  const response = await nativeFetch(url, options);
  if (response.ok && !response.headers.get("content-type")?.includes("text/html")) {
    const bytes = Buffer.from(await response.clone().arrayBuffer());
    // Keep the original input identity; never put a developer's origin in output.
    sources.set(String(input), sha(bytes));
  }
  return response;
};
const engine = new B.NullEngine();
engine.doNotHandleContextLost = false; // Compiler consumes the retained RGBA upload bytes.
const scene = new B.Scene(engine);
// The texture resolver consults this shared catalog when a prop references a
// texture supplied by another area's pack. A private copy silently loses it.
Object.assign(state, {scene, currentMeshes: [], currentLoadId: 0, currentTimeOfDay: 0, currentSeason: 0,
  ...createSceneLoaders(scene)});
try {
  const catalog = world.assetFormat === "MT7" ? await fetchShenmue2Catalog() : await (await fetchAsset("models.json")).json();
  if (world.assetFormat !== "MT7") state.allFiles = catalog;
  const spec = preparedScenerySpec(world, catalog);
  if (spec.ownership && spec.context) Object.assign(state, {currentSeason: spec.context.seasonIndex,
    currentWeatherIndex: spec.context.weatherIndex, currentTimeOfDay: spec.context.timeOfDayIndex});
  const documents = [];
  for (const file of spec.policyFiles) {
    const bytes = await readFile(new URL(file, project));
    sources.set(file, sha(bytes));
    documents.push(JSON.parse(bytes));
  }
  const [, scheduled, fixtures] = documents;
  const audit = key === "dobuita" ? auditFixedSceneryPlacements(world.placements,
    new ScheduledSceneObjectCatalog(scheduled).definitions(world.id), fixtures) : null;
  console.info(`[Scenery:${key}] Loading ${world.label} map source`);
  if (world.assetFormat === "MT7") await loadMt7Scene(state, spec.records, {batchStatic: false, installEffects: false});
  else await loadMt5Scene(state, world.prefix, {filenames: new Set(spec.filenames),
    includeHiddenVariants: true, timeOfDayIndex: 0, variantProfile: spec.variantProfile, variantZone: spec.zone});
  const reader = new PlacementRuntime({scene, bundledModels: runtimeAssetGroup("play/assets/dobuita/*.CHRM"),
    bundledTextures: runtimeAssetGroup("play/assets/dobuita/*_textures.bin"), fetchArrayBuffer: fetchAssetBuffer});
  const fixedIds = new Set(audit?.rows.filter(row => row.included).map(row => row.id) || []);
  const templateModels = new Set(spec.models);
  const fixedLayer = fixedIds.size ? new B.TransformNode(`${key}-fixed-placements`, scene) : null;
  if (fixedLayer) fixedLayer.metadata = {fixedSceneryLayer: true, placementIds: [...fixedIds]};
  const templates = [];
  const groups = Map.groupBy(world.placements, row => row.model);
  console.info(`[Scenery:${key}] Preparing fixed objects and ${templateModels.size} reusable models`);
  for (const [model, placements] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const fixed = placements.filter(row => fixedIds.has(sceneryPlacementId(row)));
    if (!fixed.length && !templateModels.has(model)) continue;
    const {modelBuffer, texturePack} = await reader.readModelAssets(model, placements);
    const loader = new Mt5Loader(scene);
    configureMt5TexturePack(loader, texturePack);
    if (templateModels.has(model)) templates.push({model, roots: await loader.load(modelBuffer, texturePack)});
    for (const placement of fixed) {
      const roots = await loader.load(modelBuffer, texturePack);
      if (!roots.length) throw new Error(`No fixed geometry: ${model}`);
      const identity = {id: sceneryPlacementId(placement), model, objectTag: placement.runtime.objectTag || null};
      for (const [i, root] of roots.entries()) {
        applyPlacementTransform(root, placement);
        root.name = `${identity.id}:${i}`;
        for (const node of [root, ...root.getDescendants(false)]) node.metadata = {...node.metadata, sceneryPlacement: identity};
        root.parent = fixedLayer;
      }
    }
  }
  if (fixedLayer) state.currentMeshes.push(fixedLayer);
  freezeSceneRoots(state.currentMeshes);
  if (key === "dobuita") suppressDobuitaCinemaFacadeFaces(state.currentMeshes);
  const collision = await loadNativeCollisionDefinitionForWorld(world);
  prepareWorldCollision(state.currentMeshes, {interior: world.interior === true, nativeHorizontalCollision: Boolean(collision)});
  console.info(`[Scenery:${key}] Compiling geometry and shared textures`);
  const bundle = await compileSceneryBundle(state.currentMeshes, {fixedPlacementLayer: fixedLayer, modelTemplates: templates,
    sceneryFilenames: spec.ownership ? spec.filenames : [], hierarchyFilenames: spec.ownership?.hierarchyFilenames || [],
    surfaceSelectors: spec.ownership?.surfaceSelectors || [],
    provenance: {key, contract: spec.contract, area: spec.zone,
      sources: [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({file, hash})), placements: audit}});
  await mkdir(output, {recursive: true});
  for (const [name, data] of [["world.bin", bundle.binary], ["world.json", JSON.stringify(bundle.manifest)]]) {
    const pending = new URL(`${name}.pending`, output);
    await writeFile(pending, data);
    await rename(pending, new URL(name, output));
  }
  const {batches, ...statistics} = bundle.manifest.statistics;
  console.info(JSON.stringify({world: world.id, output: fileURLToPath(output), bytes: bundle.binary.byteLength, ...statistics}));
} finally {
  globalThis.fetch = nativeFetch;
  scene.dispose(); engine.dispose();
}
