import assert from "node:assert/strict";
import test from "node:test";

import { PlayMultiplayerAdapter } from "../play/multiplayer/PlayMultiplayerAdapter.js";

function createAdapter(overrides = {}) {
  const calls = [];
  const adapter = new PlayMultiplayerAdapter({
    multiplayerRuntime: {
      client: {setAppliedStoryArrivalRevision: revision=>{calls.push(["arrival-applied",revision]);return true;}},
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

test("Story destination waits for scene cleanup and ignores duplicate/stale receipts", async()=>{
  let release;
  const ended=new Promise(resolve=>{release=resolve;}),loaded=[],character={id:12,modeRevision:7,scriptStateRevision:4};
  const {adapter}=createAdapter({worlds:{mfsy:{id:'mfsy'}},
    accountSession:{character,applyWelcome:value=>Object.assign(character,value)},
    scriptEventController:{waitForRunEnd:()=>ended},
    playerRuntime:{controller:{acquireMovementLock(){return ()=>{};}}},
    worldRuntime:{select:async(world,options)=>{loaded.push([world,options]);return true;}}});
  const message={characterId:12,modeRevision:7,runId:99,state:{revision:4,destination:{id:'s1.harbor.bus-arrival',worldId:'mfsy',position:[130.5,0,140.6],yaw:Math.PI}}};
  const pending=adapter.applyStoryDestination(message);await Promise.resolve();assert.equal(loaded.length,0);
  release();assert.equal(await pending,true);assert.equal(loaded[0][1].serverDepartureCommitted,true);
  assert.deepEqual(loaded[0][1].transition.destination.browserSpawn.position,[130.5,0,140.6]);
  assert.equal(await adapter.applyStoryDestination(message),false);assert.equal(loaded.length,1);
  character.modeRevision=8;
  assert.equal(await adapter.applyStoryDestination({...message,state:{...message.state,revision:5}}),false);
  assert.equal(loaded.length,1);
});

test("failed Story world loading keeps the committed destination for reload",async()=>{
  const character={id:12,modeRevision:7,scriptStateRevision:4},locks=[];
  const {adapter}=createAdapter({worlds:{mfsy:{id:'mfsy'}},
    accountSession:{character,applyWelcome:value=>Object.assign(character,value)},
    scriptEventController:{waitForRunEnd:async()=>{}},
    playerRuntime:{controller:{acquireMovementLock:()=>{locks.push(true);return ()=>locks.push(false);}}},
    worldRuntime:{select:async()=>false}});
  await assert.rejects(adapter.applyStoryDestination({characterId:12,modeRevision:7,runId:9,
    state:{revision:4,destination:{id:'s1.harbor.bus-arrival',worldId:'mfsy',position:[130.5,0,140.6],yaw:Math.PI}}}),/interrupted/);
  assert.equal(character.worldId,'mfsy');assert.deepEqual(locks,[true,false]);
});

test("Story arrival is acknowledged only after world loading applies the pose",async()=>{
  let finish;const loaded=new Promise(resolve=>{finish=resolve;}),character={id:12,modeRevision:7,scriptStateRevision:4};
  const {adapter,calls}=createAdapter({worlds:{mfsy:{id:"mfsy"}},accountSession:{character,applyWelcome:value=>Object.assign(character,value)},
    scriptEventController:{waitForRunEnd:async()=>{}},playerRuntime:{controller:{acquireMovementLock(){return ()=>{};}}},worldRuntime:{select:()=>loaded}});
  const pending=adapter.applyStoryDestination({characterId:12,modeRevision:7,runId:9,state:{revision:4,destination:{id:"s1.work.biker-alley",worldId:"mfsy",position:[-92,0,25],yaw:0}}});
  await Promise.resolve();await Promise.resolve();assert.equal(calls.some(c=>c?.[0]==="arrival-applied"),false);
  finish(true);await pending;assert.deepEqual(calls.slice(-2),[["arrival-applied",4],["publish",true]]);
});

test("Story reconnect restores the saved same-world pose before publishing; Free roam keeps offline movement", () => {
  const character = { id: 12, modeRevision: 7, scriptStateRevision: 4, playMode: "story", worldId: "dobuita", x: 70, y: 0, z: 20, yaw: 1.2 };
  const { adapter, calls } = createAdapter({ worlds: { dobuita: { id: "dobuita" } }, accountSession: { character } });
  adapter.onConnected(true);
  assert.deepEqual(calls, [["reset", { values: [70, 0, 20] }, 1.2, { persist: false }], ["arrival-applied", 4], ["publish", true]]);
  calls.length = 0; character.playMode = "free_roam"; adapter.onConnected(true);
  assert.deepEqual(calls, []);
});

test("Story reconnect returns destination loading and cannot acknowledge a newer character's arrival", async () => {
  let finish;
  const character = { id: 12, modeRevision: 7, scriptStateRevision: 4, playMode: "story", worldId: "mfsy", x: 70, y: 0, z: 20, yaw: 1.2 };
  const locks = [];
  const { adapter, calls } = createAdapter({ worlds: { mfsy: { id: "mfsy" } }, accountSession: { character },
    playerRuntime: { controller: { acquireMovementLock: () => { locks.push("acquire"); return () => locks.push("release"); } } },
    worldRuntime: { activeWorld: { id: "dobuita" }, select: () => new Promise(resolve => { finish = resolve; }) } });
  const pending = adapter.onConnected(true);
  assert.equal(typeof pending?.then, "function"); assert.deepEqual(calls, []);
  character.modeRevision++;
  finish(true); await assert.rejects(pending, /superseded/);
  assert.deepEqual(calls, []); assert.deepEqual(locks, ["acquire", "release"]);
});

test("overlapping Story loads release only their own movement lock and never stamp an obsolete arrival", async () => {
  const pending = [], owners = new Set();
  const { adapter, calls } = createAdapter({ worlds: { mfsy: { id: "mfsy" } },
    playerRuntime: { controller: { acquireMovementLock: () => { const owner = {}; owners.add(owner); return () => owners.delete(owner); } } },
    worldRuntime: { select: () => new Promise(resolve => pending.push(resolve)) } });
  const destination = { worldId: "mfsy", position: [1, 0, 2], yaw: 0 };
  const first = adapter.loadStoryArrival(destination, false, 4);
  const second = adapter.loadStoryArrival(destination, false, 5);
  assert.equal(owners.size, 2);
  pending[0](true); await assert.rejects(first, /superseded/);
  assert.equal(owners.size, 1); assert.deepEqual(calls, []);
  pending[1](true); assert.equal(await second, true);
  assert.equal(owners.size, 0); assert.deepEqual(calls, [["arrival-applied", 5], ["publish", true]]);
});

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

test("story receipts are fenced to the selected character and play mode", () => {
  const received = [];
  const accountSession = { character: { id: 12, modeRevision: 7 } };
  const { adapter } = createAdapter({
    accountSession,
    nativeStoryRuntime: { applyScriptSettlement: state => received.push(state) },
  });
  const onReceipt = adapter.callbacks().onScriptEventCommitted;
  const state = { nativeDialogue: { revision: 4 } };
  onReceipt({ characterId: 12, modeRevision: 6, state });
  onReceipt({ characterId: 11, modeRevision: 7, state });
  onReceipt({ characterId: 12, modeRevision: 7, state });
  accountSession.character = null;
  onReceipt({ characterId: 12, modeRevision: 7, state });
  assert.deepEqual(received, [state]);
});

test("only newer durable story receipts refresh the balance and earned notebook flags", () => {
  const updates = [], character = { id: 12, modeRevision: 7, scriptStateRevision: 3 };
  const { adapter } = createAdapter({ accountSession: { character, inventory: [],
    applyWelcome(value) { updates.push(value); Object.assign(character, value); } },
    nativeStoryRuntime: { applyScriptSettlement() {} } });
  const accept = state => adapter.callbacks().onScriptEventCommitted({ characterId: 12, modeRevision: 7, state });
  accept({ revision: 4, yen: 2500, flags: { "notebook.s1.allowance": true }, storyTimeMs:Date.UTC(1986,11,3,19) });
  accept({ revision: 3, yen: 2000, flags: {} });
  assert.equal(updates.length, 1); assert.equal(character.yen, 2500);
  assert.equal(character.storyFlags["notebook.s1.allowance"], true);
  assert.equal(character.storyTimeMs,Date.UTC(1986,11,3,19));
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

test("stuck publishes only successful recovery and reports an obstructed entrance", () => {
  const { adapter, calls } = createAdapter();
  adapter.playerRuntime.controller.recoverFromCollision = ({ fallbackPosition }) => {
    assert.equal(fallbackPosition, adapter.worldRuntime.spawn);
    return { recovered: true, source: "recent-safe" };
  };
  assert.match(adapter.callbacks().onStuck().message, /Use \/stuck again/);
  assert.deepEqual(calls, ["dirty", ["publish", true]]);
  calls.length = 0;
  adapter.playerRuntime.controller.recoverFromCollision = () => ({ recovered: false, source: "blocked-spawn" });
  assert.match(adapter.callbacks().onStuck().message, /entrance is obstructed/);
  assert.deepEqual(calls, []);
});

test("stuck refuses loading, world switching, and driving without attempting recovery", () => {
  for (const state of ["loading", "switching", "driving"]) {
    const { adapter, calls } = createAdapter();
    adapter.playerRuntime.controller.recoverFromCollision = () => assert.fail("must not recover");
    if (state === "loading") adapter.worldRuntime.ready = false;
    if (state === "switching") adapter.worldRuntime.switching = true;
    if (state === "driving") adapter.forkliftAssembly.mode.driving = true;
    assert.equal(adapter.callbacks().onStuck().recovered, false);
    assert.deepEqual(calls, []);
  }
});
