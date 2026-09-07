import assert from "node:assert/strict";
import test from "node:test";
import {
  NullEngine,
  Scene,
  TransformNode,
} from "@babylonjs/core";
import {
  RemotePlayerManager,
} from "../src/multiplayer/RemotePlayerManager.js";

function state(overrides = {}) {
  return {
    id: "player-1",
    name: "Guest1001",
    worldId: "dobuita",
    characterId: "ryo",
    x: 1,
    y: 2,
    z: 3,
    yaw: 0.5,
    movement: "walk",
    animationId: null,
    animationRevision: 0,
    animationElapsedMs: 0,
    sequence: 1,
    ...overrides,
  };
}

function tickAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("remote manager loads, updates, swaps, and disposes avatars", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const avatars = [];
  const tags = [];
  const manager = new RemotePlayerManager(scene, {
    async createAvatar(characterId, position) {
      const root = new TransformNode(`avatar-${characterId}`, scene);
      root.position.copyFrom(position);
      const avatar = {
        characterId,
        root,
        states: [],
        updates: 0,
        disposed: false,
        syncState(next) { this.states.push(next); },
        update() { this.updates += 1; },
        dispose() {
          this.disposed = true;
          root.dispose();
        },
      };
      avatars.push(avatar);
      return avatar;
    },
    createTag(_scene, name) {
      const tag = {
        name,
        positions: [],
        disposed: false,
        setPosition(position, height) {
          this.positions.push({ ...position, height });
        },
        dispose() { this.disposed = true; },
      };
      tags.push(tag);
      return tag;
    },
    getTagHeight: () => 2,
  });

  manager.upsert(state());
  await tickAsync();
  assert.equal(avatars.length, 1);
  assert.equal(avatars[0].states.at(-1).movement, "walk");
  assert.equal(tags[0].name, "Guest1001");

  manager.upsert(state({ sequence: 1, x: 99 }));
  assert.equal(manager.players.get("player-1").targetPosition.x, 1);
  manager.upsert(state({
    sequence: 2,
    x: 2,
    characterId: "ine",
    animationId: "bow",
    animationRevision: 1,
  }));
  await tickAsync();
  assert.equal(avatars.length, 2);
  assert.equal(avatars[0].disposed, true);
  assert.equal(avatars[1].characterId, "ine");
  assert.equal(avatars[1].states.at(-1).animationId, "bow");

  manager.update(0.1);
  assert.ok(avatars[1].updates > 0);
  assert.ok(tags[0].positions.length > 0);

  manager.remove("player-1");
  assert.equal(avatars[1].disposed, true);
  assert.equal(tags[0].disposed, true);
  assert.equal(manager.players.size, 0);
  scene.dispose();
  engine.dispose();
});

test("snapshot replacement removes players absent from the room", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new RemotePlayerManager(scene, {
    async createAvatar(characterId, position) {
      const root = new TransformNode(characterId, scene);
      root.position.copyFrom(position);
      return {
        root,
        syncState() {},
        update() {},
        dispose() { root.dispose(); },
      };
    },
    createTag() {
      return { setPosition() {}, dispose() {} };
    },
    getTagHeight: () => 2,
  });
  manager.replaceSnapshot([
    state({ id: "a" }),
    state({ id: "b" }),
  ]);
  await tickAsync();
  assert.equal(manager.players.size, 2);
  manager.replaceSnapshot([state({ id: "b", sequence: 2 })]);
  assert.deepEqual([...manager.players.keys()], ["b"]);
  manager.dispose();
  scene.dispose();
  engine.dispose();
});

test("remote players reach their exact endpoint during the stop blend", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new RemotePlayerManager(scene, {
    stopBlendSeconds: 0.2,
    async createAvatar(characterId, position) {
      const root = new TransformNode(characterId, scene);
      root.position.copyFrom(position);
      return {
        root,
        syncState() {},
        update() {},
        dispose() { root.dispose(); },
      };
    },
    createTag() {
      return { setPosition() {}, dispose() {} };
    },
    getTagHeight: () => 2,
  });

  manager.upsert(state({ x: 0, y: 0, z: 0, movement: "run" }));
  await tickAsync();
  manager.upsert(state({
    sequence: 2,
    x: 1,
    y: 0,
    z: 0,
    movement: "run",
  }));
  manager.update(0.1);
  const stopStart = manager.players.get("player-1").avatar.root.position.x;
  manager.upsert(state({
    sequence: 3,
    x: 2,
    y: 0,
    z: 0,
    movement: "idle",
  }));

  manager.update(0.1);
  assert.ok(Math.abs(
    manager.players.get("player-1").avatar.root.position.x
      - (stopStart + 2) / 2,
  ) < 1e-9);
  manager.update(0.1);
  assert.equal(
    manager.players.get("player-1").avatar.root.position.x,
    2,
  );
  manager.update(0.1);
  assert.equal(
    manager.players.get("player-1").avatar.root.position.x,
    2,
  );

  manager.dispose();
  scene.dispose();
  engine.dispose();
});

test("entering a forklift snaps ownership to its authoritative pose", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new RemotePlayerManager(scene, {
    async createAvatar(characterId, position) {
      const root = new TransformNode(characterId, scene);
      root.position.copyFrom(position);
      return {
        root,
        syncState() {},
        update() {},
        dispose() { root.dispose(); },
      };
    },
    createTag() {
      return { setPosition() {}, dispose() {} };
    },
    getTagHeight: () => 2,
  });
  manager.upsert(state({
    x: 0,
    y: 0,
    z: 0,
    movement: "idle",
    vehicleId: null,
  }));
  await tickAsync();
  manager.upsert(state({
    sequence: 2,
    x: 3,
    y: 0,
    z: 2,
    yaw: 1.25,
    movement: "run",
    vehicleId: "forklift-1",
  }));
  const player = manager.players.get("player-1");
  assert.deepEqual(
    [...player.avatar.root.position.asArray()],
    [3, 0, 2],
  );
  assert.equal(player.avatar.root.rotation.y, 1.25);
  assert.deepEqual(
    manager.occupiedVehiclePoses().map((pose) => ({
      playerId: pose.playerId,
      vehicleId: pose.vehicleId,
      position: pose.position.asArray(),
      yaw: pose.yaw,
    })),
    [{
      playerId: "player-1",
      vehicleId: "forklift-1",
      position: [3, 0, 2],
      yaw: 1.25,
    }],
  );
  player.avatar.root.position.x = 99;
  assert.equal(
    manager.occupiedVehiclePoses()[0].position.x,
    99,
    "vehicle poses should reflect the interpolated avatar position",
  );
  const clonedPosition = manager.occupiedVehiclePoses()[0].position;
  clonedPosition.x = -10;
  assert.equal(
    manager.players.get("player-1").avatar.root.position.x,
    99,
    "callers must not be able to mutate an avatar through a pose snapshot",
  );
  manager.dispose();
  scene.dispose();
  engine.dispose();
});

test("moving players keep advancing smoothly between network samples", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const manager = new RemotePlayerManager(scene, {
    async createAvatar(characterId, position) {
      const root = new TransformNode(characterId, scene);
      root.position.copyFrom(position);
      return {
        root,
        syncState() {},
        update() {},
        dispose() { root.dispose(); },
      };
    },
    createTag() {
      return { setPosition() {}, dispose() {} };
    },
    getTagHeight: () => 2,
  });
  manager.upsert(state({
    x: 0,
    y: 0,
    z: 0,
    movement: "run",
    updatedAt: 1000,
  }));
  await tickAsync();
  manager.upsert(state({
    sequence: 2,
    x: 1,
    y: 0,
    z: 0,
    movement: "run",
    updatedAt: 1100,
  }));
  assert.equal(
    manager.players.get("player-1").motionVelocity.x,
    10,
  );
  manager.update(0.05);
  manager.update(0.05);
  assert.ok(
    manager.players.get("player-1").avatar.root.position.x > 1,
    "the remote avatar should not stop at the last received sample",
  );
  manager.dispose();
  scene.dispose();
  engine.dispose();
});
