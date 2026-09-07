import assert from "node:assert/strict";
import test from "node:test";

import { PlayMultiplayerAdapter } from "../play/multiplayer/PlayMultiplayerAdapter.js";

function createAdapter(overrides = {}) {
  const calls = [];
  const adapter = new PlayMultiplayerAdapter({
    multiplayerRuntime: {
      markPresenceDirty: () => calls.push("dirty"),
      publishPresence: force => calls.push(["publish", force]),
    },
    worldRuntime: {
      ready: true,
      switching: false,
      spawn: { x: 0, y: 0, z: 0 },
      activeWorld: { id: "dobuita" },
    },
    worldLifecycle: {
      resetPlayer: (...args) => calls.push(["reset", ...args]),
    },
    playerRuntime: {
      activeCharacterId: "ryo",
      animation: { activeEmote: { emote: { id: "wave" } } },
      controller: {},
    },
    actorRoot: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { y: 1.25 },
    },
    simulationRuntime: { movementState: "walk" },
    networkEmoteIds: new Set(["wave"]),
    forkliftAssembly: {
      mode: { driving: false },
      cargo: {},
      network: {},
    },
    forkliftChassisPose: {},
    accountSession: {},
    nativeStoryRuntime: {},
    scheduledActorNetworkState: {},
    remoteForkliftSounds: {},
    arcadeCoordinator: {},
    scriptEventController: {},
    applyWorldState() {},
    synchronizeWorldTime() {},
    refreshLoadingDateTime() {},
    vectorFromArray: values => ({ values }),
    arcadeWorldId: "arcade",
    ...overrides,
  });
  return { adapter, calls };
}

test("multiplayer adapter owns presence animation revision", () => {
  const { adapter, calls } = createAdapter();

  assert.deepEqual(adapter.playerPresence(), {
    worldId: "dobuita",
    avatarId: "ryo",
    position: { x: 1, y: 2, z: 3 },
    yaw: 1.25,
    movement: "walk",
    animationId: "wave",
    animationRevision: 0,
  });

  adapter.markAnimationChanged();

  assert.equal(adapter.playerPresence().animationRevision, 1);
  assert.deepEqual(calls, ["dirty"]);
});

test("multiplayer warp delegates validated coordinates to world lifecycle", () => {
  const { adapter, calls } = createAdapter();

  assert.deepEqual(adapter.warp([10, 20, 30]), {
    warped: true,
    message: "Warped to 10, 20, 30.",
  });
  assert.deepEqual(calls, [[
    "reset",
    { values: [10, 20, 30] },
    1.25,
    { snapToTerrain: false },
  ]]);
});

test("multiplayer warp refuses unavailable and mounted player states", () => {
  const loading = createAdapter({
    worldRuntime: { ready: false, switching: false },
  }).adapter;
  assert.equal(loading.warp([1, 2, 3]).warped, false);

  const mounted = createAdapter({
    forkliftAssembly: {
      mode: { driving: true },
      cargo: {},
      network: {},
    },
  }).adapter;
  assert.equal(mounted.warp([1, 2, 3]).warped, false);
});
