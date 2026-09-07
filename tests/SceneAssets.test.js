import assert from "node:assert/strict";
import test from "node:test";
import * as B from "@babylonjs/core";
import { runSceneLoad, readSceneResource, loadMt5Scene, loadMt7Scene } from "../src/rendering/SceneAssets.js";
import { clearWorldSceneAssets, createSceneLoaders, freezeSceneRoots } from "../src/rendering/SceneResources.js";
import { WORKERS_PIER_FOUNTAIN_EFFECT } from "../src/Mt7MapEffects.js";
import { AssetViewerEnvironment } from "../src/AssetViewerEnvironment.js";
import { variantProfileForZone } from "../src/SceneCompositions.js";
import { updateModelVisibility } from "../src/variants.js";

test("shared MT5 loading filters resident variants before the first frame, even without a clock change", async t => {
  t.mock.method(globalThis, "fetch", async url => String(url).endsWith(".json")
    ? Response.json({texturePacks: []})
    : new Response(new Uint8Array(32), {headers: {"Content-Type": "application/octet-stream"}}));
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const state = {
    scene, currentMeshes: [], currentLoadId: 0,
    currentSeason: 0, currentTimeOfDay: 0, currentWeatherIndex: 0,
    allFiles: ["MAP", "MAP02", "MAP03", "MAP08", "MAP09", "MAP10", "MAP11"].map(s => `S1_JU00_${s}.MT5`),
    loader: {
      setTexturePackIndex() {},
      load() { return [new B.Mesh("map-root", scene)]; },
    },
  };
  const layers = () => Object.fromEntries(state.currentMeshes.map(root => [
    root._filename.replace("S1_JU00_", "").replace(".MT5", ""), root.isEnabled(),
  ]));
  try {
    for (const season of [0, 1]) {
      state.currentSeason = season;
      assert.equal(await loadMt5Scene(state, "S1_JU00", {
        includeHiddenVariants: true, variantProfile: variantProfileForZone("JU00"),
      }), true);
      assert.deepEqual(layers(), {
        MAP: true, MAP02: true, MAP03: false,
        MAP08: season === 0, MAP09: season === 1,
        MAP10: season === 0, MAP11: season === 1,
      });
    }
    // The same routine handles later weather/season changes without revealing
    // unrelated geometry hidden by another presentation owner.
    state.currentMeshes.find(root => root._filename === "S1_JU00_MAP.MT5").setEnabled(false);
    state.currentSeason = 0;
    updateModelVisibility(state);
    assert.equal(layers().MAP, false);
    assert.equal(layers().MAP08, true);
    assert.equal(layers().MAP09, false);
    assert.equal(await loadMt5Scene(state, "S1_JU00", {
      singleModel: true, filenames: new Set(["S1_JU00_MAP09.MT5"]),
      includeHiddenVariants: true,
    }), true);
    assert.equal(layers().MAP09, true, "individual-model inspection remains unfiltered");
  } finally {
    clearWorldSceneAssets(state);
    scene.dispose(); engine.dispose();
  }
});

test("viewer environment waits for shared lighting and propagates cancelled preparation", async t => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const environment = new AssetViewerEnvironment({
    scene, currentMeshes: [], currentTimeOfDay: 0, currentGame: "shenmue",
    currentZone: "D000", currentScenePrefix: "S1_D000",
  });
  try {
    let release;
    let fail;
    t.mock.method(environment.lighting, "create", () => new Promise((resolve, reject) => {
      release = resolve;
      fail = reject;
    }));
    let finished = false;
    const loading = environment.load().then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false);
    release();
    await loading;
    assert.equal(finished, true);

    const cancelled = environment.load();
    environment.clear();
    fail(new DOMException("Scene replaced", "AbortError"));
    await assert.rejects(cancelled, {name: "AbortError"});
    assert.equal(environment.world, null);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("static scene transforms freeze without disabling shared material binding", () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const material = new B.StandardMaterial("shared", scene);
  const meshes = [B.MeshBuilder.CreateBox("one", {}, scene), B.MeshBuilder.CreateBox("two", {}, scene)];
  for (const mesh of meshes) mesh.material = material;
  freezeSceneRoots(meshes);
  assert.ok(meshes.every(mesh => mesh.isWorldMatrixFrozen));
  assert.equal(material.isFrozen, false);
  scene.dispose(); engine.dispose();
});

test("superseded scene parsing drains before cache disposal and the newest load", async () => {
  const state = {currentMeshes: [], currentLoadId: 0};
  const calls = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const first = runSceneLoad(state, {}, async cancelled => {
    calls.push("first-start");
    await barrier;
    assert.equal(cancelled(), true);
    calls.push("first-end");
    return false;
  });
  await Promise.resolve();
  const stale = runSceneLoad(state, {}, () => { throw Error("stale load ran"); });
  const latest = runSceneLoad(state, {}, async () => { calls.push("latest"); return true; });
  assert.deepEqual(calls, ["first-start"]);
  release();
  assert.deepEqual(await Promise.all([first, stale, latest]), [false, false, true]);
  assert.deepEqual(calls, ["first-start", "first-end", "latest"]);
  assert.equal(state.sceneLoadTask, null);
});

test("resource reads retry transient failure, bound stalls and honor cancellation", async () => {
  let attempts = 0;
  assert.equal(await readSceneResource(() => {
    if (++attempts === 1) throw Error("transient");
    return "ok";
  }), "ok");
  assert.equal(attempts, 2);
  await assert.rejects(readSceneResource(() => new Promise(() => {}), {
    timeoutMs: 5, retries: 0,
  }), /timed out/);
  const controller = new AbortController();
  const pending = readSceneResource(() => new Promise(() => {}), {signal: controller.signal});
  controller.abort(new Error("leave scene"));
  await assert.rejects(pending, /leave scene/);
});

test("failed loads release their queue and an aborted next request never parses", async () => {
  const state = {currentMeshes: [], currentLoadId: 0};
  await assert.rejects(runSceneLoad(state, {}, () => { throw Error("bad asset"); }), /bad asset/);
  const controller = new AbortController();
  controller.abort();
  assert.equal(await runSceneLoad(state, {signal: controller.signal}, () => {
    throw Error("must not parse");
  }), false);
  assert.equal(await runSceneLoad(state, {}, () => true), true);
  assert.equal(await runSceneLoad(state, {}, async () => {
    state.currentLoadId++;
    return true;
  }), false);
});

test("scene disposal releases earlier MT5 materials after their loader cache was reset", () => {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const roots = [0, 1].map(index => {
    const mesh = B.MeshBuilder.CreateBox(String(index), {}, scene);
    const material = new B.StandardMaterial(String(index), scene);
    material.diffuseTexture = new B.RawTexture(new Uint8Array([255,255,255,255]), 1, 1, B.Engine.TEXTUREFORMAT_RGBA, scene);
    mesh.material = material;
    return mesh;
  });
  const state = {currentMeshes: roots, loader: {textureCache: new Map(), materialCache: new Map()}};
  const ownedMaterials = roots.map(root => root.material);
  clearWorldSceneAssets(state);
  assert.equal(scene.meshes.length, 0);
  assert.equal(ownedMaterials.some(material => scene.materials.includes(material)), false);
  assert.equal(scene.textures.length, 0);
  clearWorldSceneAssets(state);
  scene.dispose();
  engine.dispose();
});

test("both scene profiles share materials and map effects while inspection preserves parts", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([1]), {headers: {"Content-Type": "application/octet-stream"}}));
  for (const batchStatic of [false, true]) {
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    const loaders = createSceneLoaders(scene);
    assert.ok(loaders.loader.overlayManifest);
    assert.equal(loaders.loader.textureAddressMode, "repeat");
    const material = new B.StandardMaterial("fountain", scene);
    material.diffuseTexture = new B.RawTexture(new Uint8Array([255,255,255,255]), 1, 1, B.Engine.TEXTUREFORMAT_RGBA, scene);
    const roots = [];
    const state = {currentMeshes: [], currentLoadId: 0, mt7Loader: {
      clearCaches() {},
      load() {
        const root = new B.Mesh("root", scene);
        root._mt7MapEffectDefinition = WORKERS_PIER_FOUNTAIN_EFFECT;
        for (let i = 0; i < 2; i++) {
          const part = B.MeshBuilder.CreatePlane("part" + i, {}, scene);
          part.parent = root;
          part.material = material;
        }
        roots.push(root);
        return [root];
      },
    }};
    assert.equal(await loadMt7Scene(state, [{filename: "fixture.MT7", area: "AR02", kind: "MAPM"}], {batchStatic}), true);
    assert.equal(roots[0].getChildMeshes().length, batchStatic ? 1 : 2);
    roots[0]._worldMt7MapEffectRuntime.update(2);
    assert.ok(Math.abs(material.diffuseTexture.uOffset - 0.62) < 1e-9);
    clearWorldSceneAssets(state);
    scene.dispose();
    engine.dispose();
  }
});
