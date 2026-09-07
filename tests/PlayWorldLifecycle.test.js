import assert from "node:assert/strict";
import test from "node:test";

import { PlayWorldLifecycle } from "../play/world/PlayWorldLifecycle.js";

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
