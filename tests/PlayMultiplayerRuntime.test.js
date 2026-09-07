import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayMultiplayerRuntime,
} from "../play/multiplayer/PlayMultiplayerRuntime.js";

function createRuntime() {
  const calls = [];
  let sessionOptions = null;
  const session = {
    client: {
      setLocalPresence: (snapshot, options) => {
        calls.push(["presence", snapshot, options]);
        return true;
      },
      connect: () => calls.push("client-connect"),
      close: () => calls.push("close"),
    },
    remotePlayers: { dispose: () => calls.push("dispose-remotes") },
    chat: { dispose: () => calls.push("dispose-chat") },
    connect: () => calls.push("connect"),
  };
  const runtime = new PlayMultiplayerRuntime({
    getSessionOptions: () => ({ scene: "scene" }),
    getCallbacks: () => ({ onReset: () => calls.push("reset") }),
    canPublishPresence: () => true,
    getPlayerPresence: () => ({
      worldId: "dobuita",
      avatarId: "ryo",
      position: { x: 1, y: 2, z: 3 },
      yaw: 4,
      movement: "walk",
      animationId: null,
      animationRevision: 5,
    }),
    getVehiclePresence: () => ({
      id: "forklift-1",
      position: { x: 6, y: 7, z: 8 },
      lift: 0.4,
      steering: 0.2,
      wheelRoll: 9,
      orientation: { x: 0, y: 0.5, z: 0, w: 0.5 },
    }),
    onSessionReplaced: message => calls.push(["replaced", message]),
    createSession: options => {
      sessionOptions = options;
      return session;
    },
  });
  return { calls, runtime, session, getOptions: () => sessionOptions };
}

test("multiplayer presence merges explicit player and vehicle snapshots", () => {
  const { calls, runtime } = createRuntime();
  runtime.initialize();
  calls.length = 0;
  runtime.markPresenceDirty();

  assert.equal(runtime.publishPresence(), true);
  assert.deepEqual(calls, [[
    "presence",
    {
      worldId: "dobuita",
      avatarId: "ryo",
      x: 6,
      y: 7,
      z: 8,
      yaw: 4,
      movement: "walk",
      animationId: null,
      animationRevision: 5,
      vehicleId: "forklift-1",
      vehicleLift: 0.4,
      vehicleSteering: 0.2,
      vehicleWheelRoll: 9,
      vehicleQx: 0,
      vehicleQy: 0.5,
      vehicleQz: 0,
      vehicleQw: 0.5,
    },
    { force: true },
  ]]);
});

test("session replacement is handled once by the application boundary", () => {
  const { calls, getOptions, runtime } = createRuntime();
  runtime.initialize();
  calls.length = 0;

  getOptions().callbacks.onSessionReplaced("first");
  getOptions().callbacks.onSessionReplaced("second");
  assert.deepEqual(calls, [["replaced", "first"]]);
});

test("multiplayer disposal owns connection, chat, then remote teardown", () => {
  const { calls, runtime } = createRuntime();
  runtime.initialize();
  calls.length = 0;
  runtime.dispose();
  assert.deepEqual(calls, ["close", "dispose-chat", "dispose-remotes"]);
});
