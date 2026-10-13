import assert from "node:assert/strict";
import test from "node:test";
import { ScriptedInteractionRuntime } from "../play/interactions/ScriptedInteractionRuntime.js";

function createHarness({ result, error, presentationOwned = false, playMode = "free_roam" } = {}) {
  const notices = [];
  let fallbackCount = 0;
  const runtime = new ScriptedInteractionRuntime({
    accountSession: { character: { playMode } },
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

for (const response of [
  { result: { outcome: "declined" } },
  { result: { outcome: "rejected", error: { code: "no_script" } } },
  { error: Object.assign(new Error("offline"), { code: "connection_unavailable" }) },
]) test(`translated Story talk stays server-owned on ${response.error ? "disconnect" : response.result.outcome}`, async () => {
  const h = createHarness({ ...response, playMode: "story" });
  h.runtime.startNativeNpc = h.fallback;
  await h.runtime.startNpc({ actorCode: "HRSK", id: "nozomi" });
  assert.equal(h.fallbackCount(), 0);
  assert.equal(h.notices.length, 1);
});

for (const [playMode, actorCode] of [["free_roam", "HRSK"], ["story", "HATO"]]) test(`native talk remains available for ${playMode} ${actorCode}`, async () => {
  const h = createHarness({ result: { outcome: "declined" }, playMode });
  h.runtime.startNativeNpc = h.fallback;
  await h.runtime.startNpc({ actorCode, id: "actor" });
  assert.equal(h.fallbackCount(), 1);
});
