import assert from "node:assert/strict";
import test from "node:test";

import { PlayWorldLifecycle } from "../play/world/PlayWorldLifecycle.js";

test("failed avatar restoration cannot enter the world as cinematic Ryo", async () => {
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    accountSession: { character: { avatarId: "shenhua" } },
    worlds: {}, persistentPlayerWorld: () => false,
    characterById: new Map([["shenhua", { id: "shenhua" }]]),
    getController: () => ({}),
    playerRuntime: { activeCharacterId: "ryo", switchCharacter: async () => {} },
    loadingScreen: { begin: async () => {} },
  });
  await assert.rejects(lifecycle.initialize(), /Could not restore selected character shenhua/);
});

for (const { alreadyLoaded, arrival } of [false, true].flatMap(alreadyLoaded =>
  ["default", "story", "returning"].map(arrival => ({ alreadyLoaded, arrival }))
)) {
  test(`initialization restores selected avatar with existing controller=${alreadyLoaded}, arrival=${arrival}`, async () => {
    const calls = [];
    const controller = {};
    const avatar = { id: "shenhua" };
    const worlds = { interior: { id: "interior" }, exterior: { id: "exterior" } };
    const initialPlacement = arrival === "story" ? { position: [-17.6, 0, 4.1], yaw: Math.PI } : null;
    const expectedWorld = arrival === "returning" ? worlds.exterior : worlds.interior;
    let loaded = alreadyLoaded;
    const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
      accountSession: { character: { avatarId: avatar.id, worldId: "exterior", x: 1, y: 0, z: 2, yaw: 0.25 } },
      worlds, characterById: new Map([[avatar.id, avatar]]),
      persistentPlayerWorld: world => Boolean(world), vectorFromArray: value => value,
      getController: () => loaded ? controller : null,
      playerRuntime: {
        activeCharacterId: avatar.id,
        setInitialCharacter: id => calls.push(["initial", id]),
        switchCharacter: async (value, options) => calls.push(["switch", value, options]),
      },
      loadingScreen: {
        begin: world => { assert.equal(world, expectedWorld); calls.push(["loading"]); },
      },
      worldRuntime: { initialize: async (world, options) => {
        assert.equal(world, expectedWorld);
        assert.deepEqual(options.savedPosition, initialPlacement?.position || (arrival === "returning" ? [1, 0, 2] : null));
        assert.equal(options.savedYaw, initialPlacement?.yaw ?? 0.25);
        assert.equal(options.persistLocation, false);
        loaded = true;
        calls.push(["world"]);
        return true;
      } },
      multiplayerRuntime: {}, readSavedRunToggle: () => false,
      persistRunToggle() {}, persistPlayerLocation() { calls.push(["persist"]); },
      selectionMenus: { setCharacterDisabled: disabled => assert.equal(disabled, false) },
    });
    await lifecycle.initialize({ initialWorldOverride: arrival === "returning" ? null : worlds.interior, initialPlacement });
    assert.deepEqual(calls, [["loading"], alreadyLoaded ? ["switch", avatar, { persist: false }] : ["initial", avatar.id], ["world"], ["persist"]]);
  });
}

test("world geometry and player downloads overlap, but player readiness gates completion", async () => {
  let releasePlayer;
  let prefetchSignal;
  const calls = [];
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    playerRuntime: {prefetch(_world, signal) {
      prefetchSignal = signal; calls.push("player-read");
      return new Promise(resolve => { releasePlayer = resolve; });
    }},
    setWorldEnvironmentState: () => ({environment: {}}),
    characterAssembly: {definitionsForWorld: async () => []},
    worldRuntime: {ensureLoadActive: signal => signal?.throwIfAborted()},
    worldLoader: {load: async () => { calls.push("geometry"); return {}; }},
  });
  let complete = false;
  const loading = lifecycle.loadAssets({id: "dobuita"}).then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["player-read", "geometry"]);
  assert.equal(complete, false);
  releasePlayer(); await loading;
  assert.equal(complete, true);
  assert.equal(prefetchSignal.aborted, true);
});

test("failed geometry cancels speculative player work without an unhandled rejection", async () => {
  let cancelled = false;
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    playerRuntime: {prefetch(_world, signal) {
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
        cancelled = true; reject(signal.reason);
      }, {once: true}));
    }},
    setWorldEnvironmentState: () => ({environment: {}}),
    characterAssembly: {definitionsForWorld: async () => []},
    worldRuntime: {ensureLoadActive() {}},
    worldLoader: {load: async () => { throw new Error("bad geometry"); }},
  });
  await assert.rejects(lifecycle.loadAssets({id: "dobuita"}), /bad geometry/);
  assert.equal(cancelled, true);
});

test("world initialization waits for lighting and checks cancellation before activating gameplay", async () => {
  const controller = new AbortController();
  let completeLighting;
  let footwearUpdates = 0;
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    getController: () => null,
    sceneState: { currentMeshes: [] },
    worldEnvironment: { setWeatherOccluders() {}, applyWeather() {} },
    worldRuntime: { ensureLoadActive: signal => signal.throwIfAborted() },
    nativeStoryRuntime: {
      activateWorld(_world, _meshes, signal) {
        assert.equal(signal, controller.signal);
        return new Promise(resolve => { completeLighting = resolve; });
      },
    },
    playerRuntime: { syncFootwear: () => { footwearUpdates++; } },
  });
  const loading = lifecycle.initializeLoadedWorld({
    world: {id: "dobuita"}, environment: {}, loaded: {}, signal: controller.signal,
  });
  assert.equal(footwearUpdates, 0);
  controller.abort();
  completeLighting();
  await assert.rejects(loading, {name: "AbortError"});
  assert.equal(footwearUpdates, 0);
});

test("world lifecycle publishes only persistent player worlds", () => {
  const calls = [];
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    worldRuntime: { activeWorld: { id: "dobuita" } },
    persistentPlayerWorld: world => world?.id === "dobuita",
    multiplayerRuntime: {
      markPresenceDirty: () => calls.push("dirty"),
      publishPresence: force => {
        calls.push(["publish", force]);
        return true;
      },
    },
  });

  assert.equal(lifecycle.persistPlayerLocation(), true);
  assert.deepEqual(calls, ["dirty", ["publish", true]]);

  calls.length = 0;
  lifecycle.worldRuntime.activeWorld = { id: "op00" };
  assert.equal(lifecycle.persistPlayerLocation(), false);
  assert.deepEqual(calls, []);
});

test("void recovery restores world spawn and every dependent owner", () => {
  const calls = [];
  const position = {
    y: -200,
    copyFrom(value) {
      calls.push(["actor-position", value]);
    },
  };
  const controller = {
    collider: { position },
    captureTravelState: () => ({ run: true }),
    reset: (...args) => calls.push(["reset", ...args]),
    restoreTravelState: state => calls.push(["restore", state]),
  };
  const lifecycle = Object.assign(Object.create(PlayWorldLifecycle.prototype), {
    worldRuntime: {
      spawn: { x: 1, y: 2, z: 3 },
      spawnYaw: 1.5,
    },
    getController: () => controller,
    actorRoot: { position, rotation: { y: 0 } },
    forkliftAssembly: {
      mode: { resetMountedAt: (...args) => calls.push(["forklift", ...args]) },
    },
    clearActiveEmote: () => calls.push(["emote"]),
    multiplayerRuntime: {
      markPresenceDirty: () => calls.push(["dirty"]),
    },
    persistPlayerLocation: () => calls.push(["persist"]),
  });

  assert.equal(lifecycle.recoverPlayerFromVoid(), true);
  assert.deepEqual(calls.map(([name]) => name), [
    "reset",
    "restore",
    "actor-position",
    "forklift",
    "emote",
    "dirty",
    "persist",
  ]);
  assert.equal(lifecycle.actorRoot.rotation.y, 1.5);
});
