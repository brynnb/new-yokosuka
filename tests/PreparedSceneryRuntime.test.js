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

const catalog = [...new Set([...["S1_JOMO_MAP.MT5", "S1_JOMO_MAP02.MT5", "S3_DGCT_MAP.MT5",
  "S3_DGCT_MAP01.MT5", "S3_DGCT_MAP02.MT5", "S3_DGCT_MAP03.MT5"], ...Object.values(SCENE_COMPOSITIONS.sources).flatMap(source => (
  source.residentAssets.map(asset => `${source.prefix}_${asset}.MT5`)
)), ...Object.values(SCENE_COMPOSITIONS.scenes).flatMap(scene => (scene.overlays || [])
  .flatMap(overlay => overlay.assets.map(asset => `${overlay.prefix}_${asset}.MT5`)))])];

test("an unbuilt optional bundle selects original assets without retrying or mutating the scene", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, {status: 404}));
  const info = t.mock.method(console, "info", () => {});
  const state = {currentMeshes: ["existing scene"]};
  const runtime = new PreparedSceneryRuntime(state, {allowMissing: true});
  assert.equal(await runtime.plan(WORLDS.interior), null);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[0], "/scenery-output/interior/world.json");
  assert.deepEqual(state, {currentMeshes: ["existing scene"]});
  assert.match(info.mock.calls[0].arguments[0], /loading original assets/);
});

test("scenery validation stays strict and a missing binary is never an optional bundle", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, {status: 404}));
  await assert.rejects(new PreparedSceneryRuntime({}).plan(WORLDS.interior), /request failed \(404\)/);
  const runtime = new PreparedSceneryRuntime({}, {allowMissing: true});
  await assert.rejects(runtime.read("/scenery-output/interior/world.bin"), /request failed \(404\)/);
});

test("optional scenery retries transient failures but never hides server errors or malformed manifests", async t => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(null, {status: calls === 1 ? 503 : 404});
  });
  t.mock.method(console, "info", () => {});
  const runtime = new PreparedSceneryRuntime({}, {allowMissing: true});
  assert.equal(await runtime.plan(WORLDS.interior), null);
  assert.equal(calls, 2);
  fetch.mock.mockImplementation(async () => new Response(null, {status: 503}));
  await assert.rejects(runtime.plan(WORLDS.interior), /request failed \(503\)/);
  fetch.mock.mockImplementation(async () => new Response("broken JSON"));
  await assert.rejects(runtime.plan(WORLDS.interior), SyntaxError);
  fetch.mock.mockImplementation(async () => new Response(JSON.stringify({schema: "old"})));
  await assert.rejects(runtime.plan(WORLDS.interior), /Rebuild the local interior/);
});

test("cancelled optional bundle lookup cannot fall back or apply a late response", async t => {
  const controller = new AbortController();
  let finish;
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise(resolve => { finish = resolve; }));
  const info = t.mock.method(console, "info", () => {});
  const state = {};
  const runtime = new PreparedSceneryRuntime(state, {allowMissing: true});
  const pending = runtime.plan(WORLDS.interior, controller.signal);
  await Promise.resolve();
  controller.abort(new Error("Travel superseded"));
  await assert.rejects(pending, /Travel superseded/);
  finish(new Response(null, {status: 404}));
  await Promise.resolve();
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(info.mock.callCount(), 0);
  assert.deepEqual(state, {});
});

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
  assert.equal(runtime.supports(WORLDS.interior), true);
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
  for (const world of Object.values(WORLDS).filter(w => w.assetFormat !== "MT7" && !["op00", "op02", "interior", "arcade"].includes(w.id) && (w.assetFormat || w.interior || w.cutsceneOnly))) {
    assert.equal(preparedSceneryKey(world), null, world.id);
  }
});

test("MT7 bundles select the same disc-specific MAPM/PROP records and retain native ownership", async t => {
  const world = WORLDS.s2ar02;
  const make = (suffix, kind, sourceMember) => ({filename: `${world.prefix}_${suffix}.MT7`, kind, sourceMember, texturePack: "textures.bin"});
  const catalog = {models: [make("MAP", "MAPM", "MAP.MAPM"), make("MAP18", "MAPM", "MAP18.MAPM"),
    make("PROP", "PROP", "PROP.PROP"), make("ACTOR", "CHRM", "ACTOR.CHRM"),
    {filename: "S2DC_D2_AR02_MPK00_MAP.MT7", kind: "MAPM", sourceMember: "MAP.MAPM"}]};
  const spec = preparedScenerySpec(world, catalog);
  assert.deepEqual(spec.filenames, catalog.models.slice(0, 3).map(r => r.filename));
  assert.deepEqual(spec.ownership.hierarchyFilenames, [catalog.models[2].filename]);
  assert.equal(spec.contract.effects.length, 1);
  assert.equal(spec.contract.effects[0][1].id, "s2-ar02-map18-native-uv-scroll");
  assert.throws(() => preparedScenerySpec(world, {models: []}), /Missing prepared scene records/);
  for (const world of Object.values(WORLDS).filter(w => w.assetFormat === "MT7")) assert.equal(preparedSceneryKey(world), world.id);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(catalog), {headers: {"Content-Type": "application/json"}}));
  const state = {allFiles: ["existing.MT5"], mt5Files: ["existing.MT5"]};
  const runtime = new PreparedSceneryRuntime(state);
  const manifest = {schema: SCENERY_BUNDLE_SCHEMA, provenance: {key: world.id, contract: spec.contract},
    templates: [], hierarchies: spec.ownership.hierarchyFilenames.map(model => ({model}))};
  runtime.read = async () => new TextEncoder().encode(JSON.stringify(manifest));
  assert.deepEqual((await runtime.plan(world)).spec, spec);
  assert.deepEqual(state.allFiles, ["existing.MT5"], "MT7 catalog never overwrites shared MT5 texture-resolution catalog");
  manifest.hierarchies = [];
  await assert.rejects(runtime.plan(world), /hierarchy coverage changed/);
});

test("interiors keep props independent and arcade fixture surfaces addressable", () => {
  const home = preparedScenerySpec(WORLDS.interior, catalog);
  assert.deepEqual(home.filenames, ["S1_JOMO_MAP.MT5", "S1_JOMO_MAP02.MT5"]);
  assert.deepEqual(home.models, [], "drawers and scripted house objects keep their existing owner");
  assert.equal(home.contract.placements, WORLDS.interior.placements);
  const arcade = preparedScenerySpec(WORLDS.arcade, catalog);
  assert.deepEqual(arcade.ownership.hierarchyFilenames, ["S3_DGCT_MAP01.MT5"]);
  assert.ok(arcade.ownership.surfaceSelectors.some(row => row.sourceFilename === "S3_DGCT_MAP03.MT5" && row.meshName === "mt5_tex_1"));
  assert.ok(arcade.ownership.surfaceSelectors.some(row => row.sourceFilename === "S3_DGCT_MAP.MT5" && row.meshName === "mt5_tex_12"));
  for (const id of ["mfbt", "ma00", "ma00race"]) assert.ok(preparedSceneryKey(WORLDS[id]), id);
  assert.notEqual(preparedSceneryKey(WORLDS.ma00race), preparedSceneryKey(WORLDS.ma00), "race uses its own course, not the practice harbor");
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
