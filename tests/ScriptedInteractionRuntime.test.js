import assert from "node:assert/strict";
import test from "node:test";
import { ScriptedInteractionRuntime } from "../play/interactions/ScriptedInteractionRuntime.js";

function createHarness({ result, error, presentationOwned = false } = {}) {
  const notices = [];
  let fallbackCount = 0;
  const runtime = new ScriptedInteractionRuntime({
    accountSession: {},
    getActorRoot: () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } }),
    getCurrentGameDate: () => ({}),
    getMultiplayerClient: () => null,
    getPresentationOwned: () => presentationOwned,
    getWorld: () => ({ nativeArea: "D000", cutsceneOnly: false }),
    nativeDialogueOverlay: {},
    nativeDialoguePersistence: { gameplayState: () => null },
    nativeRoomScriptRuntime: { eventContext: () => ({}) },
    nativeScriptedEventRuntime: {},
    readNativeDialogueActorRuntimeValue() {},
    scheduledActorNetworkState: {},
    scriptEventController: {
      status: "idle",
      async start() {
        if (error) throw error;
        return result;
      },
    },
    transientNotice: { show: message => notices.push(message) },
  });
  return {
    notices,
    runtime,
    fallback: () => { fallbackCount += 1; },
    fallbackCount: () => fallbackCount,
  };
}

test("database-declined object scripts fall back to native interaction", async () => {
  const harness = createHarness({ result: { outcome: "declined" } });
  await harness.runtime.startObject({
    objectSelector: "DOOR",
    objectTag: "DOOR",
    root: {},
    fallback: harness.fallback,
  });
  assert.equal(harness.fallbackCount(), 1);
});

test("an unavailable connection falls back without showing an error", async () => {
  const error = Object.assign(new Error("offline"), {
    code: "connection_unavailable",
  });
  const harness = createHarness({ error });
  await harness.runtime.startObject({
    objectSelector: "DOOR",
    objectTag: "DOOR",
    root: {},
    fallback: harness.fallback,
  });
  assert.equal(harness.fallbackCount(), 1);
  assert.deepEqual(harness.notices, []);
});

test("owned presentation blocks ordinary world interactions", async () => {
  const harness = createHarness({
    presentationOwned: true,
    result: { outcome: "declined" },
  });
  await harness.runtime.startObject({
    objectSelector: "DOOR",
    objectTag: "DOOR",
    root: {},
    fallback: harness.fallback,
  });
  assert.equal(harness.fallbackCount(), 0);
});
