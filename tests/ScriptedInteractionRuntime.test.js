import assert from "node:assert/strict";
import test from "node:test";
import { ScriptedInteractionRuntime } from "../play/interactions/ScriptedInteractionRuntime.js";

function createHarness({ result, error, presentationOwned = false, playMode = "free_roam",area="D000" } = {}) {
  const notices = [];
  let fallbackCount = 0;
  const runtime = new ScriptedInteractionRuntime({
    accountSession: { character: { playMode } },
    getActorRoot: () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } }),
    getCurrentGameDate: () => ({}),
    getMultiplayerClient: () => null,
    getPresentationOwned: () => presentationOwned,
    getWorld: () => ({ nativeArea: area, cutsceneOnly: false }),
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

test("contained objects require their drawer to be open before any script or fallback",async()=>{
  const h=createHarness({result:{outcome:"declined"}});
  const drawer={state:"closed"},root={parent:{metadata:{interactiveDrawer:drawer}}};
  await h.runtime.startObject({objectSelector:"ihko",root,fallback:h.fallback});
  assert.equal(h.fallbackCount(),0);assert.deepEqual(h.notices,["Open the drawer first."]);
  drawer.state="opening";await h.runtime.startObject({objectSelector:"ihko",root,fallback:h.fallback});
  assert.equal(h.fallbackCount(),0);
  drawer.state="open";await h.runtime.startObject({objectSelector:"ihko",root,fallback:h.fallback});
  assert.equal(h.fallbackCount(),1);
});

test("translated Story bus clicks are claimed; Free roam retains ordinary travel",async()=>{
  const target={root:{},transition:{source:{objectTag:'BUS_'}}};
  const story=createHarness({playMode:'story',result:{outcome:'declined'}});
  assert.equal(story.runtime.startMapTransition(target),true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(story.notices.length,1);
  const free=createHarness({playMode:'free_roam'});
  assert.equal(free.runtime.startMapTransition(target),false);
});

test("translated Story objects never fall back on declined, missing or offline authority", async()=>{
  for(const setup of [{result:{outcome:"declined"}},
    {result:{outcome:"rejected",error:{code:"no_script"}}},
    {error:Object.assign(Error("offline"),{code:"connection_unavailable"})}]){
    for(const [area,objectSelector] of [["D000","TEL0"],["JOMO","TEL_"]]){
      const h=createHarness({...setup,area,playMode:"story"});
      await h.runtime.startObject({objectSelector,objectTag:objectSelector,root:{},fallback:h.fallback});
      assert.equal(h.fallbackCount(),0);assert.equal(h.notices.length,1);
    }
  }
  const h=createHarness({result:{outcome:"declined"},playMode:"free_roam"});
  await h.runtime.startObject({objectSelector:"TEL0",objectTag:"TEL0",root:{},fallback:h.fallback});
  assert.equal(h.fallbackCount(),1);
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

test("an authored room-entry conversation cannot fall back to native talk afterward",async()=>{
  const h=createHarness({result:{outcome:"rejected",error:{code:"no_script"}},playMode:"story",area:"TATQ"});
  h.runtime.startNativeNpc=h.fallback;
  await h.runtime.startNpc({actorCode:"HORS",id:"tattoo-artist"});
  assert.equal(h.fallbackCount(),0);assert.equal(h.notices.length,1);
});

for (const [playMode, actorCode] of [["free_roam", "HRSK"], ["story", "HATO"]]) test(`native talk remains available for ${playMode} ${actorCode}`, async () => {
  const h = createHarness({ result: { outcome: "declined" }, playMode });
  h.runtime.startNativeNpc = h.fallback;
  await h.runtime.startNpc({ actorCode, id: "actor" });
  assert.equal(h.fallbackCount(), 1);
});
