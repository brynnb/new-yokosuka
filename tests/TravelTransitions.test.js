import assert from "node:assert/strict";
import test from "node:test";
import { TravelTransitions } from "../play/world/TravelTransitions.js";

test("door travel preserves controller state and waits for the open pose", async () => {
  const locks = [];
  const selections = [];
  const controllerState = { noClip: true, cameraDistance: 4 };
  const controller = {
    captureTravelState: () => controllerState,
    setMovementLocked: (locked) => locks.push(locked),
  };
  const doorInteractions = {
    setPose(door, pose) {
      door.lastPose = pose;
    },
    toggle(door) {
      door.state = "opening";
      door.elapsed = 0;
    },
  };
  let persistCount = 0;
  const runtime = new TravelTransitions({
    worlds: { exterior: { id: "exterior" } },
    doorInteractions,
    getController: () => controller,
    isSwitchingWorld: () => false,
    selectWorld: async (...args) => selections.push(args),
    persistPlayerLocation: () => {
      persistCount += 1;
    },
  });
  const transition = { destination: { worldId: "exterior" } };
  const door = { state: "open", elapsed: 4, openedByPlayer: true };

  assert.equal(runtime.beginDoor(door, transition), true);
  assert.deepEqual(door.lastPose, { progress: 0 });
  assert.equal(runtime.finishDoor(), false);
  door.state = "open";
  assert.equal(runtime.finishDoor(), true);
  await Promise.resolve();

  assert.equal(runtime.pending, null);
  assert.deepEqual(selections, [[
    { id: "exterior" },
    { transition, controllerState },
  ]]);
  assert.deepEqual(locks, [true, false]);
  assert.equal(persistCount, 1);
});

test("boundary travel switches worlds after validation", async () => {
  const controller = {
    captureTravelState: () => ({}),
    setMovementLocked() {},
  };
  const runtime = new TravelTransitions({
    worlds: { exterior: { id: "exterior" } },
    doorInteractions: {},
    getController: () => controller,
    isSwitchingWorld: () => false,
    selectWorld: async () => {},
    persistPlayerLocation() {},
  });
  assert.equal(runtime.beginBoundary({
    destination: { worldId: "missing" },
  }), false);
  assert.equal(runtime.beginBoundary({
    destination: { worldId: "exterior" },
  }), true);
  await Promise.resolve();
});

async function settlePromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function timedTransition() {
  return {
    id: "d000-door-30-to-dcha-entry-0",
    source: { worldId: "dobuita", doorSelector: 30 },
    destination: { worldId: "dcha" },
    authorization: { kind: "server-timed-transition" },
  };
}

test("a timed entrance denial unlocks movement without starting the door", async () => {
  const locks = [];
  const denials = [];
  const selections = [];
  const door = { state: "closed", elapsed: 0, openedByPlayer: false };
  const runtime = new TravelTransitions({
    worlds: { dcha: { id: "dcha" } },
    doorInteractions: {
      setPose() {},
      toggle() {
        throw new Error("a denied door must not animate");
      },
    },
    getController: () => ({
      captureTravelState: () => ({}),
      setMovementLocked: (locked) => locks.push(locked),
    }),
    isSwitchingWorld: () => false,
    selectWorld: async (...args) => selections.push(args),
    persistPlayerLocation() {},
    authorizeTransition: async () => ({
      authorized: false,
      reason: "closed",
      message: "This shop is closed.",
    }),
    onTransitionDenied: (denial) => denials.push(denial),
  });

  assert.equal(runtime.beginDoor(door, timedTransition()), true);
  assert.deepEqual(locks, [true]);
  await settlePromises();
  assert.equal(runtime.pending, null);
  assert.equal(door.state, "closed");
  assert.deepEqual(locks, [true, false]);
  assert.equal(denials[0].reason, "closed");
  assert.equal(denials[0].message, "This shop is closed.");
  assert.deepEqual(selections, []);
});

test("a timed entrance denial closes a door that was already open", async () => {
  const locks = [];
  const door = { state: "open", elapsed: 2, openedByPlayer: true };
  const runtime = new TravelTransitions({
    worlds: { dcha: { id: "dcha" } },
    doorInteractions: {
      setPose() {},
      toggle(target) {
        target.state = "closing";
        target.elapsed = 0;
      },
    },
    getController: () => ({
      captureTravelState: () => ({}),
      setMovementLocked: (locked) => locks.push(locked),
    }),
    isSwitchingWorld: () => false,
    selectWorld: async () => {
      throw new Error("denied travel selected a world");
    },
    persistPlayerLocation() {},
    authorizeTransition: async () => ({
      authorized: false,
      reason: "closed",
      message: "This shop is closed.",
    }),
  });

  runtime.beginDoor(door, timedTransition());
  await settlePromises();
  assert.equal(runtime.pending, null);
  assert.equal(door.state, "closing");
  assert.equal(door.elapsed, 0);
  assert.deepEqual(locks, [true, false]);
});

test("a timed entrance commits once after the open animation", async () => {
  const locks = [];
  const selections = [];
  const authorizations = [];
  const commits = [];
  const door = { state: "closed", elapsed: 0, openedByPlayer: false };
  const transition = timedTransition();
  const runtime = new TravelTransitions({
    worlds: { dcha: { id: "dcha" } },
    doorInteractions: {
      setPose() {},
      toggle(target) {
        target.state = target.state === "open" ? "closing" : "opening";
      },
    },
    getController: () => ({
      captureTravelState: () => ({ cameraDistance: 4 }),
      setMovementLocked: (locked) => locks.push(locked),
    }),
    isSwitchingWorld: () => false,
    selectWorld: async (...args) => selections.push(args),
    persistPlayerLocation() {},
    authorizeTransition: async (requested) => {
      authorizations.push(requested);
      return {
        authorized: true,
        requestId: "request-1",
        authorizationId: "authorization-1",
      };
    },
    commitTransition: async (authorization) => {
      commits.push(authorization);
      return { committed: true };
    },
  });

  assert.equal(runtime.beginDoor(door, transition), true);
  assert.equal(door.state, "closed");
  await settlePromises();
  assert.equal(door.state, "opening");
  door.state = "open";
  assert.equal(runtime.finishDoor(), true);
  assert.equal(runtime.finishDoor(), false);
  await settlePromises();
  assert.deepEqual(authorizations, [transition]);
  assert.equal(commits.length, 1);
  assert.equal(runtime.pending, null);
  assert.deepEqual(selections, [[
    { id: "dcha" },
    {
      transition,
      controllerState: { cameraDistance: 4 },
      serverDepartureCommitted: true,
    },
  ]]);
  assert.deepEqual(locks, [true, false]);
});

test("a failed timed commit closes the open door and releases movement", async () => {
  const locks = [];
  const denials = [];
  const door = { state: "closed", elapsed: 0, openedByPlayer: false };
  const runtime = new TravelTransitions({
    worlds: { dcha: { id: "dcha" } },
    doorInteractions: {
      setPose() {},
      toggle(target) {
        target.state = target.state === "open" ? "closing" : "opening";
      },
    },
    getController: () => ({
      captureTravelState: () => ({}),
      setMovementLocked: (locked) => locks.push(locked),
    }),
    isSwitchingWorld: () => false,
    selectWorld: async () => {
      throw new Error("denied travel selected a world");
    },
    persistPlayerLocation() {},
    authorizeTransition: async () => ({
      authorized: true,
      requestId: "request-2",
      authorizationId: "authorization-2",
    }),
    commitTransition: async () => ({
      committed: false,
      reason: "authorization_expired",
      message: "Try the door again.",
    }),
    onTransitionDenied: (denial) => denials.push(denial),
  });

  runtime.beginDoor(door, timedTransition());
  await settlePromises();
  door.state = "open";
  runtime.finishDoor();
  await settlePromises();
  assert.equal(runtime.pending, null);
  assert.equal(door.state, "closing");
  assert.deepEqual(locks, [true, false]);
  assert.equal(denials[0].reason, "authorization_expired");
});
