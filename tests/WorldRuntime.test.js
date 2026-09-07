import assert from "node:assert/strict";
import test from "node:test";

import { WorldRuntime } from "../play/world/WorldRuntime.js";

function world(id) {
  return {
    id,
    yaw: id === "next" ? 2 : 1,
    spawn: {
      id: `${id}-spawn`,
      clone() { return { ...this }; },
    },
  };
}

function createRuntime(overrides = {}) {
  const log = [];
  const controller = {
    captureTravelState: () => (log.push("capture"), { run: true }),
    restoreTravelState: state => log.push(["restore", state]),
  };
  const runtime = new WorldRuntime({
    initialWorld: world("initial"),
    initialSpawn: { id: "initial-spawn" },
    invalidatePendingLoads: () => log.push("invalidate"),
    isCancellation: (_error, signal) => signal.aborted,
    createCancellationError: () => new Error("cancelled"),
    vectorFromArray: values => ({ values }),
    leaveRaceWorld: value => log.push(["leave-race", value.id]),
    hasPendingTransition: () => false,
    collapseSidebar: () => log.push("collapse"),
    beginLoading: value => log.push(["begin", value.id]),
    waitUntilLoadingPainted: () => log.push("painted"),
    clearWorld: snapshot => log.push(["clear", snapshot.world.id]),
    loadWorldAssets: async value => {
      log.push(["assets", value.id]);
      return {
        environment: { weather: "clear" },
        loaded: { raycastIndex: "raycast", water: "water" },
      };
    },
    initializeWorld: ({ world: value }) => {
      log.push(["initialize", value.id, runtime.activeWorld.id]);
    },
    ensurePlayerLoaded: () => log.push("player"),
    getController: () => controller,
    resetPlayer: (position, yaw) => log.push(["reset", position.id, yaw]),
    leaveServerWorld: () => log.push("leave-server"),
    clearRemotePlayers: () => log.push("clear-remotes"),
    clearCollisionDebug: () => log.push("clear-debug"),
    syncAnimationMenu: () => log.push("sync-menu"),
    syncCombat: () => log.push("sync-combat"),
    advanceLoading: () => log.push("advance"),
    finishLoading: () => log.push("finish"),
    showLoadingError: message => log.push(["error", message]),
    persistLocation: () => log.push("persist"),
    markPresenceDirty: () => log.push("dirty"),
    exitCinemaSeat: () => log.push("exit-seat"),
    ...overrides,
  });
  return { controller, log, runtime };
}

test("world selection owns clear-load-initialize-reveal ordering and state", async () => {
  const { log, runtime } = createRuntime();
  const next = world("next");

  assert.equal(await runtime.select(next), true);
  assert.equal(runtime.activeWorld, next);
  assert.deepEqual(runtime.spawn, next.spawn);
  assert.equal(runtime.spawnYaw, 2);
  assert.equal(runtime.raycastIndex, "raycast");
  assert.equal(runtime.water, "water");
  assert.equal(runtime.ready, true);
  assert.deepEqual(log, [
    ["leave-race", "next"],
    "capture",
    "collapse",
    "leave-server",
    "clear-remotes",
    "clear-debug",
    ["begin", "next"],
    "painted",
    ["clear", "initial"],
    ["assets", "next"],
    ["initialize", "next", "next"],
    "player",
    ["reset", "next-spawn", 2],
    "sync-menu",
    "dirty",
    "advance",
    "finish",
    "sync-combat",
    ["restore", { run: true }],
    "persist",
  ]);
});

test("selecting the active world resets without rebuilding its scene", async () => {
  const { log, runtime } = createRuntime();
  runtime.ready = true;

  assert.equal(await runtime.select(runtime.activeWorld), true);
  assert.deepEqual(log, [
    ["leave-race", "initial"],
    "capture",
    "exit-seat",
    ["reset", "initial-spawn", 0],
    ["restore", { run: true }],
    "sync-combat",
    "persist",
    "dirty",
  ]);
});
