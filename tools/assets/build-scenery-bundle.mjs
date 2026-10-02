#!/usr/bin/env node
// Offline geometry compilation: NullEngine constructs buffers without rendering.
// The local asset server supplies the same original files as the game loader.
import {mkdir, readFile, writeFile, rename} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import {createSceneLoaders, freezeSceneRoots} from "../../src/rendering/SceneResources.js";
import {loadMt5Scene} from "../../src/rendering/SceneAssets.js";
import {compileSceneryBundle} from "../../src/rendering/PreparedSceneryBundle.js";
import {resolveSceneComposition} from "../../src/SceneCompositions.js";
import {isWorldMapFile} from "../../src/WorldMapFiles.js";
import {fetchAsset} from "../../src/assetLoader.js";
import {fetchAssetBuffer} from "../../src/AssetCache.js";
import {runtimeAssetGroup} from "../../src/RuntimeAssets.js";
import {PlacementRuntime, applyPlacementTransform} from "../../play/world/PlacementRuntime.js";
import {ScheduledSceneObjectCatalog} from "../../play/world/ScheduledSceneObjectCatalog.js";
import {configureMt5TexturePack} from "../../play/assets/configureMt5TexturePack.js";
import {Mt5Loader} from "../../src/Mt5Loader.js";
import {suppressDobuitaCinemaFacadeFaces} from "../../play/world/DobuitaCinemaPoster.js";
import {prepareWorldCollision} from "../../play/world/WorldCollision.js";
import {auditFixedSceneryPlacements, sceneryPlacementId, preparedPlacementModels} from "./scenery-placement-policy.js";

const project = new URL("../../", import.meta.url);
const origin = new URL(process.env.SCENERY_ASSET_ORIGIN || "http://127.0.0.1:5173");
if (!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.protocol !== "http:") {
  throw new Error("SCENERY_ASSET_ORIGIN must name the local HTTP asset server");
}
const output = new URL(".disc-work/scenery-bundle/", project);
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
  const policyFiles = ["play/data/d000-runtime-placements.json",
    "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"];
  const documents = [];
  for (const file of policyFiles) {
    const bytes = await readFile(new URL(file, project));
    sources.set(file, sha(bytes));
    documents.push(JSON.parse(bytes));
  }
  const [manifest, scheduled, fixtures] = documents;
  const audit = auditFixedSceneryPlacements(manifest.placements,
    new ScheduledSceneObjectCatalog(scheduled).definitions("dobuita"), fixtures);
  const composition = resolveSceneComposition("D000", {timeOfDayIndex: 0, seasonIndex: 0}, {includeInactiveVariants: true});
  state.allFiles = await (await fetchAsset("models.json")).json();
  console.info("[Scenery] Loading Dobuita map source");
  await loadMt5Scene(state, composition.prefix, {filenames: new Set([...composition.filenames].filter(isWorldMapFile)),
    includeHiddenVariants: true, timeOfDayIndex: 0, variantProfile: composition.variantProfile, variantZone: composition.source});
  const reader = new PlacementRuntime({scene, bundledModels: runtimeAssetGroup("play/assets/dobuita/*.CHRM"),
    bundledTextures: runtimeAssetGroup("play/assets/dobuita/*_textures.bin"), fetchArrayBuffer: fetchAssetBuffer});
  const fixedIds = new Set(audit.rows.filter(row => row.included).map(row => row.id));
  const templateModels = new Set(preparedPlacementModels(manifest.placements));
  const fixedLayer = new B.TransformNode("dobuita-fixed-placements", scene);
  fixedLayer.metadata = {fixedSceneryLayer: true, placementIds: [...fixedIds]};
  const templates = [];
  const groups = Map.groupBy(manifest.placements, row => row.model);
  console.info(`[Scenery] Preparing fixed objects and ${templateModels.size} reusable models`);
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
  state.currentMeshes.push(fixedLayer);
  freezeSceneRoots(state.currentMeshes);
  suppressDobuitaCinemaFacadeFaces(state.currentMeshes);
  prepareWorldCollision(state.currentMeshes, {nativeHorizontalCollision: true});
  console.info("[Scenery] Compiling geometry and shared textures");
  const bundle = await compileSceneryBundle(state.currentMeshes, {fixedPlacementLayer: fixedLayer, modelTemplates: templates,
    provenance: {area: "D000", sources: [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({file, hash})), placements: audit}});
  await mkdir(output, {recursive: true});
  for (const [name, data] of [["world.bin", bundle.binary], ["world.json", JSON.stringify(bundle.manifest)]]) {
    const pending = new URL(`${name}.pending`, output);
    await writeFile(pending, data);
    await rename(pending, new URL(name, output));
  }
  console.info(JSON.stringify({output: fileURLToPath(output), bytes: bundle.binary.byteLength, ...bundle.manifest.statistics}));
} finally {
  globalThis.fetch = nativeFetch;
  scene.dispose(); engine.dispose();
}
