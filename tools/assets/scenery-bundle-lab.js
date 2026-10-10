import * as B from "@babylonjs/core";
import state from "../../src/state.js";
import { PlaySceneRuntime } from "../../play/PlaySceneRuntime.js";
import { GraphicsPreferences } from "../../src/rendering/GraphicsPreferences.js";
import { loadMt5Scene } from "../../src/rendering/SceneAssets.js";
import { clearWorldSceneAssets, freezeSceneRoots } from "../../src/rendering/SceneResources.js";
import { fetchAsset } from "../../src/assetLoader.js";
import { resolveSceneComposition } from "../../src/SceneCompositions.js";
import { isWorldMapFile } from "../../src/WorldMapFiles.js";
import { batchStaticWorldRoots, staticBatchSourceForFace } from "../../src/rendering/StaticWorldBatching.js";
import { createWorldSpatialIndex } from "../../src/rendering/SceneSpatialIndex.js";
import { prepareWorldCollision } from "../../play/world/WorldCollision.js";
import { compileSceneryBundle, loadSceneryBundle } from "../../src/rendering/PreparedSceneryBundle.js";
import { updateModelVisibility } from "../../src/variants.js";
import { applyTimeOfDay } from "../../src/lighting.js";
import { suppressDobuitaCinemaFacadeFaces } from "../../play/world/DobuitaCinemaPoster.js";
import { NativeSceneLighting } from "../../src/rendering/NativeSceneLighting.js";
import { nativeLightingArea } from "../../src/rendering/SceneEnvironmentProfiles.js";
import { PlacementRuntime, applyPlacementTransform } from "../../play/world/PlacementRuntime.js";
import { configureMt5TexturePack } from "../../play/assets/configureMt5TexturePack.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { runtimeAssetGroup } from "../../src/RuntimeAssets.js";
import { fetchAssetBuffer } from "../../src/AssetCache.js";
import { auditFixedSceneryPlacements, sceneryPlacementId, preparedPlacementModels } from "./scenery-placement-policy.js";
import { ScheduledSceneObjectCatalog } from "../../play/world/ScheduledSceneObjectCatalog.js";
import {WORLDS} from "../../play/config/worlds.js";
import {preparedScenerySpec} from "../../play/world/PreparedSceneryPlan.js";

const status = document.querySelector("#status");
const graphicsPreferences = new GraphicsPreferences({storage: null});
graphicsPreferences.setDynamicResolution(false);
graphicsPreferences.setRenderResolution("standard");
const runtime = new PlaySceneRuntime({dom: {canvas: document.querySelector("canvas")}, graphicsPreferences});
runtime.disposeMenuBackground();
const {scene, engine} = runtime;
const camera = runtime.camera;
scene.activeCamera = camera;
camera.minZ = 0.05;
camera.maxZ = 1000;
camera.fov = 0.8;
camera.speed = 0.5;
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.attachControl(state.canvas, true);
const lighting = new NativeSceneLighting({scene, getActorPosition: () => camera.position});
const views = [
  [[-16, 1.7, 27], [5, 1.7, 27]],
  [[-4, 1.7, 27], [-30, 1.7, 27]],
  [[-10, 14, 25], [10, 0, 30]],
  [[12, 1.7, 35], [16, 1.7, 38]],
];
let index, loaded, controller;
let sourceFilenames = [];
let sourceTextures = [];
let placementAudit, fixedRoots = [], templateRoots = [], placementInputs = new Map();
const placementAssets = new PlacementRuntime({scene,
  bundledModels: runtimeAssetGroup("play/assets/dobuita/*.CHRM"),
  bundledTextures: runtimeAssetGroup("play/assets/dobuita/*_textures.bin"),
  fetchArrayBuffer: fetchAssetBuffer});
const placementFiles = ["play/data/d000-runtime-placements.json",
  "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"];

async function placementPlan(signal) {
  const inputs = new Map();
  const documents = [];
  for (const file of placementFiles) {
    const response = await fetch(`/${file}`, {signal});
    if (!response.ok) throw new Error(`Missing placement evidence: ${file}`);
    const bytes = await response.arrayBuffer();
    inputs.set(file, bytes);
    documents.push(JSON.parse(new TextDecoder().decode(bytes)));
  }
  const [manifest, scheduled, fixtures] = documents;
  const audit = auditFixedSceneryPlacements(manifest.placements,
    new ScheduledSceneObjectCatalog(scheduled).definitions("dobuita"), fixtures);
  return {audit, inputs, placements: manifest.placements.filter((_, i) => audit.rows[i].included), allPlacements: manifest.placements};
}

async function loadModelTemplates(signal) {
  const {allPlacements} = await placementPlan(signal);
  const templates = [];
  for (const model of preparedPlacementModels(allPlacements)) {
    signal?.throwIfAborted();
    const placements = allPlacements.filter(row => row.model === model);
    const {modelBuffer, texturePack} = await placementAssets.readModelAssets(model, placements, signal);
    placementInputs.set(model, modelBuffer);
    const packs = texturePack instanceof ArrayBuffer ? {base: texturePack} : texturePack;
    for (const [key, bytes] of Object.entries(packs || {})) {
      if (bytes instanceof ArrayBuffer) placementInputs.set(`${model}/texture-pack/${key}`, bytes);
    }
    const loader = new Mt5Loader(scene);
    configureMt5TexturePack(loader, texturePack);
    const roots = await loader.load(modelBuffer, texturePack);
    templateRoots.push(...roots);
    if (!roots.length) throw new Error(`Prepared model has no geometry: ${model}`);
    templates.push({model, roots});
  }
  return templates;
}

async function loadFixedPlacements(signal) {
  const plan = await placementPlan(signal);
  placementAudit = plan.audit; placementInputs = plan.inputs;
  const groups = new Map();
  for (const placement of plan.placements) {
    if (!groups.has(placement.model)) groups.set(placement.model, []);
    groups.get(placement.model).push(placement);
  }
  for (const [model, placements] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    signal?.throwIfAborted();
    const {modelBuffer, texturePack} = await placementAssets.readModelAssets(model, placements, signal);
    placementInputs.set(model, modelBuffer);
    const packs = texturePack instanceof ArrayBuffer ? {base: texturePack} : texturePack;
    for (const [key, bytes] of Object.entries(packs || {})) {
      if (bytes instanceof ArrayBuffer) placementInputs.set(`${model}/texture-pack/${key}`, bytes);
    }
    const loader = new Mt5Loader(scene);
    configureMt5TexturePack(loader, texturePack);
    for (const placement of placements) {
      signal?.throwIfAborted();
      const roots = await loader.load(modelBuffer, texturePack);
      if (signal?.aborted) {
        roots.forEach(root => root.dispose(false, true));
        signal.throwIfAborted();
      }
      fixedRoots.push(...roots); state.currentMeshes.push(...roots);
      if (!roots.length) throw new Error(`Fixed placement has no geometry: ${placement.id || placement.runtime.objectTag}`);
      const identity = {id: sceneryPlacementId(placement), model,
        objectTag: placement.runtime.objectTag || null};
      roots.forEach((root, i) => {
        applyPlacementTransform(root, placement);
        root.name = `${identity.id}:${i}`;
        for (const node of [root, ...root.getDescendants(false)]) {
          node.metadata = {...node.metadata, sceneryPlacement: identity};
        }
      });
      freezeSceneRoots(roots);
    }
  }
}

function groupFixedPlacements() {
  const layer = new B.TransformNode("dobuita-fixed-placements", scene);
  layer.metadata = {fixedSceneryLayer: true, placementIds: fixedRoots.map(root => root.metadata.sceneryPlacement.id)};
  // Identity parent: preserve each source transform and its non-terrain/camera
  // collision flags. Never masquerade as MAP geometry to enable batching.
  for (const root of fixedRoots) root.parent = layer;
  state.currentMeshes = state.currentMeshes.filter(root => !fixedRoots.includes(root));
  state.currentMeshes.push(layer);
  freezeSceneRoots([layer]);
  return layer;
}
let mode = "none";
const timings = [];
const draws = [];
let measureUntil = 0;
const render = () => {
  engine._drawCalls.fetchNewFrame();
  const start = performance.now();
  scene.render();
  if (start < measureUntil) {
    timings.push(performance.now() - start);
    draws.push(engine._drawCalls.current);
  }
};
function view(number = 0) {
  document.querySelector("#view").value = number;
  camera.position.copyFromFloats(...views[number][0]);
  camera.setTarget(B.Vector3.FromArray(views[number][1]));
}
function environment() {
  state.currentTimeOfDay = Number(document.querySelector("#time").value);
  state.currentSeason = Number(document.querySelector("#season").value);
  updateModelVisibility(state);
  applyTimeOfDay(state.currentTimeOfDay);
}
function clear() {
  engine.stopRenderLoop(render);
  index?.dispose(); index = null;
  if (loaded) { loaded.dispose(); loaded = null; state.currentMeshes = []; }
  else {
    state.currentMeshes.push(...templateRoots);
    clearWorldSceneAssets(state);
  }
  // This isolated tool owns the entire source load, including unreferenced
  // decoded texture wrappers that do not appear in any mesh material.
  for (const texture of sourceTextures) if (scene.textures.includes(texture)) texture.dispose();
  sourceTextures = [];
  for (const root of templateRoots) root.dispose(false, false);
  templateRoots = [];
  fixedRoots = []; placementInputs.clear();
  lighting.clear();
}
async function source({batch = true, signal} = {}) {
  clear();
  // The compiler's initial layer state must not depend on the last UI preview.
  // finish() reapplies the selected preview after the canonical source load.
  state.currentSeason = 0;
  const composition = resolveSceneComposition("D000", {timeOfDayIndex: 0, seasonIndex: 0}, {includeInactiveVariants: true});
  if (composition.variantProfile.surfaceGroups?.length) throw new Error("This prototype only supports whole-root variants");
  sourceFilenames = [...composition.filenames].filter(isWorldMapFile).sort();
  state.allFiles = await (await fetchAsset("models.json")).json();
  const existingTextures = new Set(scene.textures);
  let loaded;
  try {
    loaded = await loadMt5Scene(state, composition.prefix, {
      signal, filenames: new Set(sourceFilenames),
      includeHiddenVariants: true, timeOfDayIndex: 0, variantProfile: composition.variantProfile,
      variantZone: composition.source, onStatus: text => { status.textContent = text; },
    });
    if (loaded) await loadFixedPlacements(signal);
  } finally {
    sourceTextures = scene.textures.filter(texture => !existingTextures.has(texture));
  }
  if (!loaded) throw new Error("Source load cancelled");
  suppressDobuitaCinemaFacadeFaces(state.currentMeshes);
  prepareWorldCollision(state.currentMeshes, {nativeHorizontalCollision: true});
  if (batch) await batchStaticWorldRoots(state.currentMeshes, {signal});
  mode = "original";
}
async function finish() {
  environment();
  await lighting.create({nativePointLightingArea: nativeLightingArea("D000")});
  index = createWorldSpatialIndex(scene, state.currentMeshes);
  await scene.whenReadyAsync();
  engine.runRenderLoop(render);
}
async function run(action) {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  document.querySelectorAll("button,select").forEach(control => { control.disabled = true; });
  try { return await action(signal); }
  catch (error) { clear(); status.textContent = error.stack; throw error; }
  finally { document.querySelectorAll("button,select").forEach(control => { control.disabled = false; }); }
}
async function loadOriginal(signal) {
  const start = performance.now();
  await source({signal}); await finish();
  const result = {mode, loadMs: performance.now() - start, meshes: scene.meshes.length, placements: placementAudit.summary};
  status.textContent = JSON.stringify(result); return result;
}
async function compile(signal) {
  await source({batch: false, signal});
  const texturesBeforeTemplates = new Set(scene.textures);
  let modelTemplates;
  try {
    modelTemplates = await loadModelTemplates(signal);
  } finally {
    sourceTextures.push(...scene.textures.filter(texture => !texturesBeforeTemplates.has(texture)));
  }
  status.textContent = "Compiling and deduplicating static scenery…";
  const sourceHashes = [];
  const inputs = new Map([...state.texturePacks, ...placementInputs].filter(([,buffer]) => buffer instanceof ArrayBuffer));
  for (const filename of sourceFilenames) inputs.set(filename, await (await fetchAsset(filename)).arrayBuffer());
  for (const [file, buffer] of [...inputs].sort(([a], [b]) => a.localeCompare(b))) {
    signal.throwIfAborted();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(n => n.toString(16).padStart(2, "0")).join("");
    sourceHashes.push({file, hash});
  }
  const fixedPlacementLayer = groupFixedPlacements();
  const bundle = await compileSceneryBundle(state.currentMeshes, {signal, fixedPlacementLayer, modelTemplates,
    provenance: {key: "dobuita", contract: preparedScenerySpec(WORLDS.dobuita, state.allFiles).contract,
      area: "D000", sources: sourceHashes, placements: placementAudit}});
  const binaryResponse = await fetch("/scenery-output/dobuita/world.bin", {method: "PUT", body: bundle.binary, signal});
  if (!binaryResponse.ok) throw new Error("Could not save scenery binary");
  const manifestResponse = await fetch("/scenery-output/dobuita/world.json", {method: "PUT", body: JSON.stringify(bundle.manifest), signal});
  if (!manifestResponse.ok) throw new Error("Could not save scenery manifest");
  clear();
  status.textContent = JSON.stringify(bundle.manifest.statistics);
  return bundle.manifest.statistics;
}
async function loadPrepared(signal) {
  clear();
  const start = performance.now();
  const manifest = await (await fetch("/scenery-output/dobuita/world.json", {signal})).json();
  const plan = await placementPlan(signal);
  if (JSON.stringify(manifest.provenance.placements) !== JSON.stringify(plan.audit)) {
    throw new Error("Placement ownership changed; rebuild the scenery bundle");
  }
  for (const [file, bytes] of plan.inputs) {
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (manifest.provenance.sources.find(source => source.file === file)?.hash !== hash) {
      throw new Error(`Stale placement input; rebuild the scenery bundle: ${file}`);
    }
  }
  const binary = new Uint8Array(await (await fetch("/scenery-output/dobuita/world.bin", {signal})).arrayBuffer());
  loaded = await loadSceneryBundle(scene, manifest, binary, {signal});
  state.currentMeshes = loaded.roots;
  // Visibility ownership is the same data-driven system as the original path.
  const composition = resolveSceneComposition("D000", {}, {includeInactiveVariants: true});
  state.currentZone = composition.source; state.currentVariantProfile = composition.variantProfile;
  state.singleModelMode = false;
  mode = "prepared";
  await finish();
  const result = {mode, loadMs: performance.now() - start, meshes: scene.meshes.length, ...manifest.statistics};
  status.textContent = JSON.stringify(result); return result;
}
async function measure(seconds = 5) {
  timings.length = draws.length = 0;
  measureUntil = performance.now() + seconds * 1000;
  await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 50));
  const sorted = [...timings].sort((a,b) => a-b);
  const result = {mode, frames: timings.length, cpuMs: timings.reduce((a,b) => a+b, 0) / timings.length,
    p95CpuMs: sorted[Math.floor(sorted.length * .95)], draws: draws.reduce((a,b) => a+b, 0) / draws.length};
  status.textContent = JSON.stringify(result); return result;
}

// Sequential rendered comparisons, not a headless assertion about visibility.
// Keep only canvas pixels (about 102 MiB at 1440x770), never two live worlds.
async function compare(signal) {
  const cases = [0, 2, 3].flatMap(time => [0, 1].flatMap(season => views.map((_, view) => ({time, season, view}))));
  if (state.canvas.width * state.canvas.height * 4 * cases.length > 128 * 1024 * 1024) {
    throw new Error("Narrow the browser window before comparing (128 MiB snapshot limit)");
  }
  const canvas = document.createElement("canvas");
  const capture = async entry => {
    signal.throwIfAborted();
    document.querySelector("#time").value = entry.time;
    document.querySelector("#season").value = entry.season;
    environment(); view(entry.view);
    await scene.whenReadyAsync();
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    canvas.width = state.canvas.width; canvas.height = state.canvas.height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.drawImage(state.canvas, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const sampleGround = () => {
    const hits = [];
    for (let x = -60; x <= 60; x += 10) for (let z = -20; z <= 80; z += 10) {
      const hit = index.pickWithRay(new B.Ray(new B.Vector3(x, 50, z), B.Vector3.Down(), 100));
      hits.push(hit?.hit ? hit.pickedPoint.y : null);
    }
    return hits;
  };
  const before = [], ground = [], timing = [];
  await loadOriginal(signal);
  // Aim through each approved object's actual bounds from six directions.
  // Unlike ground rays these specifically exercise the combined prop surfaces.
  const propRays = fixedRoots.flatMap(root => {
    const {min, max} = root.getHierarchyBoundingVectors(true);
    const center = min.add(max).scale(0.5);
    const distance = B.Vector3.Distance(min, max) + 2;
    return [B.Vector3.Right(), B.Vector3.Left(), B.Vector3.Up(), B.Vector3.Down(),
      B.Vector3.Forward(), B.Vector3.Backward()].map(direction => (
      new B.Ray(center.subtract(direction.scale(distance)), direction, distance * 2)
    ));
  });
  const sampleProps = () => propRays.map(ray => {
    const hit = index.pickWithRay(ray, mesh => mesh.metadata?.sceneryPlacement
      || mesh.metadata?.staticBatchSources?.some(source => source.sceneryPlacement));
    return hit?.hit ? {distance: hit.distance, id: (hit.pickedMesh.metadata.sceneryPlacement
      || staticBatchSourceForFace(hit.pickedMesh, hit.faceId)?.sceneryPlacement)?.id} : null;
  });
  const originalPropHits = sampleProps();
  for (const entry of cases) {
    before.push(await capture(entry)); ground.push(sampleGround());
    if (entry.time === 0 && entry.season === 0) timing.push({...entry, ...await measure(3)});
  }
  await loadPrepared(signal);
  const preparedPropHits = sampleProps();
  const fixedPlacementPicks = {samples: propRays.length, hits: originalPropHits.filter(Boolean).length,
    mismatches: preparedPropHits.filter((hit, i) => {
      const original = originalPropHits[i];
      return Boolean(hit) !== Boolean(original)
        || (hit && (Math.abs(hit.distance - original.distance) > 0.0001 || hit.id !== original.id));
    }).length};
  const comparisons = [];
  for (let j = 0; j < cases.length; j++) {
    const after = await capture(cases[j]), reference = before[j];
    let total = 0, changed = 0;
    for (let i = 0; i < after.length; i += 4) {
      const differences = [0, 1, 2].map(channel => Math.abs(after[i + channel] - reference[i + channel]));
      total += differences[0] + differences[1] + differences[2];
      if (Math.max(...differences) > 8) changed++;
    }
    const points = sampleGround();
    const groundMismatches = points.filter((y, i) => (y === null) !== (ground[j][i] === null)
      || (y !== null && Math.abs(y - ground[j][i]) > 0.0001)).length;
    comparisons.push({...cases[j], meanChannelDifference: total / (after.length * 0.75), changedPixels: changed,
      totalPixels: after.length / 4, groundSamples: points.length, groundHits: points.filter(y => y !== null).length, groundMismatches});
    before[j] = null;
    if (cases[j].time === 0 && cases[j].season === 0) timing.push({...cases[j], ...await measure(3)});
  }
  const report = {comparisons, timing, fixedPlacementPicks};
  console.info("Scenery comparison", report);
  status.textContent = JSON.stringify(report);
  return report;
}
document.querySelector("#source").onclick = () => run(loadOriginal);
document.querySelector("#compile").onclick = () => run(compile);
document.querySelector("#prepared").onclick = () => run(loadPrepared);
document.querySelector("#measure").onclick = () => run(() => measure());
document.querySelector("#compare").onclick = () => run(compare);
document.querySelector("#view").onchange = event => view(Number(event.target.value));
for (const id of ["time", "season"]) document.querySelector(`#${id}`).onchange = environment;
window.sceneryLab = {runtime, scene, engine, source: () => run(loadOriginal), compile: () => run(compile),
  prepared: () => run(loadPrepared), compare: () => run(compare), measure, view, environment, clear,
  get index() {return index;}, get placements() {return placementAudit;}};
window.addEventListener("pagehide", () => { controller?.abort(); clear(); });
window.addEventListener("resize", () => engine.resize());
view();
status.textContent = "Load original or build a bundle. Scenery only: no accounts, NPCs or gameplay. WASD + mouse to inspect.";
