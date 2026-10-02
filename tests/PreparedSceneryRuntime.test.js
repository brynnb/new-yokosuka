import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {PreparedSceneryRuntime} from "../play/world/PreparedSceneryRuntime.js";
import {SCENERY_BUNDLE_SCHEMA} from "../src/rendering/PreparedSceneryBundle.js";
import {WORLDS} from "../play/config/worlds.js";
import {ScheduledSceneObjectCatalog} from "../play/world/ScheduledSceneObjectCatalog.js";
import {auditFixedSceneryPlacements, preparedPlacementModels} from "../tools/assets/scenery-placement-policy.js";
import {preparedSceneryKey, preparedScenerySpec, PREPARED_SCENERY_WORLDS} from "../play/world/PreparedSceneryPlan.js";
import {SCENE_COMPOSITIONS} from "../src/SceneCompositions.js";
import {INTRODUCTION_ENVIRONMENTS} from "../play/cutscenes/IntroductionEnvironments.js";

const catalog = [...new Set([...Object.values(SCENE_COMPOSITIONS.sources).flatMap(source => (
  source.residentAssets.map(asset => `${source.prefix}_${asset}.MT5`)
)), ...Object.values(SCENE_COMPOSITIONS.scenes).flatMap(scene => (scene.overlays || [])
  .flatMap(overlay => overlay.assets.map(asset => `${overlay.prefix}_${asset}.MT5`)))])];

test("prepared gameplay removes only approved fixed placements and rejects stale inputs", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(catalog), {headers: {"Content-Type": "application/json"}}));
  const files = ["play/data/d000-runtime-placements.json",
    "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"];
  const bytes = await Promise.all(files.map(file => readFile(new URL(`../${file}`, import.meta.url))));
  const world = WORLDS.dobuita;
  const audit = auditFixedSceneryPlacements(world.placements,
    new ScheduledSceneObjectCatalog(JSON.parse(bytes[1])).definitions(world.id), JSON.parse(bytes[2]));
  const manifest = {schema: SCENERY_BUNDLE_SCHEMA, hierarchies: [], templates: preparedPlacementModels(world.placements).map(model => ({model})), provenance: {key: "dobuita", contract: preparedScenerySpec(world, catalog).contract, area: "D000", placements: audit,
    sources: files.map((file, i) => ({file, hash: createHash("sha256").update(bytes[i]).digest("hex")}))}};
  const runtime = new PreparedSceneryRuntime({});
  runtime.read = async path => path.endsWith("world.json")
    ? new TextEncoder().encode(JSON.stringify(manifest)) : bytes[files.indexOf(path.slice(1))];
  const plan = await runtime.plan(world);
  assert.equal(plan.placements.length, 98);
  assert.equal(plan.placements.filter(row => plan.models.has(row.model)).length, 70);
  assert.ok(plan.placements.every(row => world.placements.includes(row)));
  assert.equal(runtime.supports(world), true);
  assert.equal(runtime.supports(WORLDS.yamanose), true);
  assert.equal(runtime.supports(WORLDS.interior), false);
  await assert.rejects(runtime.plan({...world, placements: []}), /world definition changed/);
  manifest.provenance.sources[0].hash = "stale";
  await assert.rejects(runtime.plan(world), /input changed/);
});

test("prepared zones use native layer selections and share only identical harbor scenery", () => {
  for (const id of ["exterior", "yamanose", "sakuragaoka", "mfsy", "mksg"]) {
    const world = WORLDS[id], spec = preparedScenerySpec(world, catalog);
    assert.equal(spec.zone, world.sceneComposition);
    assert.deepEqual(spec.filenames, SCENE_COMPOSITIONS.sources[spec.zone].residentAssets
      .filter(asset => !SCENE_COMPOSITIONS.sources[spec.zone].alwaysHide?.includes(asset))
      .map(asset => `${world.prefix}_${asset}.MT5`).sort());
  }
  assert.deepEqual(preparedScenerySpec(WORLDS.ma00, catalog).contract, preparedScenerySpec(WORLDS.mfsy, catalog).contract);
  assert.equal(preparedSceneryKey(WORLDS.ma00), "mfsy");
  for (const id of PREPARED_SCENERY_WORLDS) assert.equal(Boolean(WORLDS[id]), true);
  assert.throws(() => preparedScenerySpec(WORLDS.exterior, []), /Missing prepared source/);
  for (const world of Object.values(WORLDS).filter(w => !["op00", "op02"].includes(w.id) && (w.assetFormat || w.interior || w.cutsceneOnly))) {
    assert.equal(preparedSceneryKey(world), null, world.id);
  }
});

test("all four intros share prepared environments without flattening native owners", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(catalog), {headers: {"Content-Type": "application/json"}}));
  const op00 = preparedScenerySpec(WORLDS.op00, catalog);
  const op02 = preparedScenerySpec(WORLDS.op02, catalog);
  assert.deepEqual({...op00.ownership.environments, ...op02.ownership.environments}, INTRODUCTION_ENVIRONMENTS);
  assert.equal(op00.context.seasonIndex, 1);
  assert.equal(op00.filenames.includes("S1_OP00_NIWAKAL.MT5"), false);
  for (const name of ["DRGS502G", "DDRR1001", "DDRR1002", "BMWS703G"]) {
    assert.ok(op00.ownership.hierarchyFilenames.includes(`S1_OP00_${name}.MT5`), name);
  }
  assert.deepEqual(op02.ownership.hierarchyFilenames, ["S1_OP02_MAP03.MT5"]);
  const manifest = {schema: SCENERY_BUNDLE_SCHEMA, provenance: {key: "op02", contract: op02.contract},
    templates: [], hierarchies: op02.ownership.hierarchyFilenames.map(model => ({model}))};
  const runtime = new PreparedSceneryRuntime({});
  runtime.read = async () => new TextEncoder().encode(JSON.stringify(manifest));
  await runtime.plan(WORLDS.op02);
  manifest.hierarchies = [];
  await assert.rejects(runtime.plan(WORLDS.op02), /hierarchy coverage changed/);
});
