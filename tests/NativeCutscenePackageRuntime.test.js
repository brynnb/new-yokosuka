import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NativeCutscenePackageRuntime,
} from "../play/cutscenes/NativeCutscenePackageRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeAseqActivityRuntime,
} from "../play/events/NativeAseqActivityRuntime.js";
import {
  createNativeCutsceneMusicRuntime,
} from "../play/cutscenes/NativeCutsceneMusicRuntime.js";

const activityManifest = JSON.parse(readFileSync(
  "play/assets/dobuita/drauth/manifest.json",
  "utf8",
));

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function resource(name, calls, load) {
  return {
    loaded: false,
    async load(...args) {
      calls.push([`${name}:load`, ...args]);
      await load?.(this);
      this.loaded = true;
      return true;
    },
    clear() {
      calls.push([`${name}:clear`]);
      this.loaded = false;
    },
  };
}

function mapResource(calls, load = null) {
  return {
    loaded: false,
    load(...args) {
      calls.push(["maps:load", ...args]);
      load?.(this);
      this.loaded = true;
      return true;
    },
    clear() {
      calls.push(["maps:clear"]);
      this.loaded = false;
    },
  };
}

function runtimeWith(resources) {
  const runtime = Object.create(NativeCutscenePackageRuntime.prototype);
  Object.assign(runtime, resources);
  return runtime;
}

function programRuntimeWith({
  calls,
  actors = null,
}) {
  const vector = () => ({
    x: 0,
    y: 0,
    z: 0,
    copyFrom() {},
    set() {},
  });
  const domNode = () => ({
    hidden: true,
    replaceChildren() {},
    setAttribute() {},
    textContent: "",
  });
  const runtime = new NativeCutscenePackageRuntime({
    definition: {
      id: "composite-package",
      worldId: "street",
      actorDefinitions: [],
      actorTags: ["AKIR"],
      assets: {},
      actors: { requirePlayer: false },
      playback: {
        manifest: activityManifest,
      },
    },
    scene: {},
    camera: {
      position: vector(),
      rotation: vector(),
      upVector: vector(),
      fov: 1,
      minZ: 0.1,
      setTarget() {},
    },
    getPlayerModel: () => null,
    syncPlayerTransform() {},
    scheduledActors: {
      activityActor: () => null,
      beginActivityActors: () => [],
      endActivityActors: () => true,
    },
    motionRuntime: {
      applyActivitySequence: () => true,
    },
    audioPreferences: {
      getState: () => ({}),
      subscribe: () => () => {},
    },
    dialogueAudio: {
      attach() {},
      detach() {},
    },
    dialogueDom: {
      root: domNode(),
      speaker: domNode(),
      sourceText: domNode(),
      japaneseText: domNode(),
      options: domNode(),
    },
    musicControls: {
      playTemporaryTrack: () => false,
      setPlaybackPaused: () => true,
      stopTemporaryTrack: () => true,
    },
    fetchArrayBuffer: async () => new ArrayBuffer(0),
    onComplete() {},
    onStopped() {},
  });
  Object.assign(runtime, {
    activityRuntime: null,
    activeCutsceneId: null,
    programLease: null,
    compositeProgramPresentation: null,
    createCompositeProgramPresentation: () => ({
      begin(owner, actorTags) {
        calls.push(["composite:begin", owner, actorTags]);
        return true;
      },
      update(owner) {
        calls.push(["composite:update", owner]);
        return 0;
      },
      end(owner) {
        calls.push(["composite:end", owner]);
        return true;
      },
    }),
    playback: { active: false },
    presentation: {
      active: false,
      beginProgram(owner, options) {
        calls.push(["presentation:begin", owner, options]);
        return true;
      },
      endProgram() {
        calls.push(["presentation:end"]);
        return true;
      },
      reset() {
        calls.push(["presentation:reset"]);
        return true;
      },
    },
    actors: actors || {
      ownsPlayerProgram: true,
      programActor: () => ({ actorCode: "AKIR" }),
      programActors: () => [{
        actorCode: "AKIR",
        root: {
          position: { x: 0, y: 0, z: 0, set() {} },
          rotation: { x: 0, y: 0, z: 0, set() {} },
          scaling: { x: 1, y: 1, z: 1, set() {} },
          rotationQuaternion: null,
          isEnabled: () => true,
          setEnabled() {},
          getDescendants: () => [],
          computeWorldMatrix() {},
        },
      }],
      syncProgramActorTransform: () => true,
      beginProgram(owner, actorTags) {
        calls.push(["actors:begin", owner, actorTags]);
        return true;
      },
      endProgram(owner, reason) {
        calls.push(["actors:end", owner, reason]);
        return true;
      },
    },
    mapLayers: {
      end() {
        calls.push(["maps:end"]);
      },
    },
    attachedObjects: {
      endTrack() {
        calls.push(["attached:end"]);
      },
    },
    music: {
      reset() {
        calls.push(["music:reset"]);
      },
    },
  });
  return runtime;
}

test("package world load waits for concurrent work before rolling back", async () => {
  const calls = [];
  const actorGate = deferred();
  const sceneObjects = resource("scene", calls, async () => {
    throw new Error("scene load failed");
  });
  const packageActors = resource("actors", calls, async () => {
    await actorGate.promise;
  });
  const mapLayers = mapResource(calls);
  const attachedObjects = resource("attached", calls);
  const runtime = runtimeWith({
    sceneObjects,
    packageActors,
    mapLayers,
    attachedObjects,
  });

  const loading = runtime.loadWorld(["world-root"]);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls.slice(0, 2), [
    ["scene:load", ["world-root"]],
    ["actors:load"],
  ]);
  assert.equal(packageActors.loaded, false);
  assert.equal(calls.some(([kind]) => kind.endsWith(":clear")), false);

  actorGate.resolve();
  await assert.rejects(loading, /scene load failed/);

  assert.equal(packageActors.loaded, false);
  assert.equal(mapLayers.loaded, false);
  assert.equal(attachedObjects.loaded, false);
  assert.deepEqual(
    calls.filter(([kind]) => kind.endsWith(":clear")).map(([kind]) => kind),
    ["scene:clear", "actors:clear", "maps:clear", "attached:clear"],
  );
});

for (const failure of ["actors", "maps", "attached"]) {
  test(`package world load rolls every resource back when ${failure} fails`, async () => {
    const calls = [];
    const fail = async (state) => {
      state.loaded = true;
      throw new Error(`${failure} load failed`);
    };
    const sceneObjects = resource("scene", calls);
    const packageActors = resource(
      "actors",
      calls,
      failure === "actors" ? fail : null,
    );
    const mapLayers = mapResource(
      calls,
      failure === "maps"
        ? (state) => {
            state.loaded = true;
            throw new Error("maps load failed");
          }
        : null,
    );
    const attachedObjects = resource(
      "attached",
      calls,
      failure === "attached" ? fail : null,
    );
    const runtime = runtimeWith({
      sceneObjects,
      packageActors,
      mapLayers,
      attachedObjects,
    });

    await assert.rejects(
      runtime.loadWorld(["world-root"]),
      new RegExp(`${failure} load failed`),
    );

    assert.deepEqual(
      [sceneObjects, packageActors, mapLayers, attachedObjects]
        .map(value => value.loaded),
      [false, false, false, false],
    );
    assert.deepEqual(
      calls.filter(([kind]) => kind.endsWith(":clear")).map(([kind]) => kind),
      ["scene:clear", "actors:clear", "maps:clear", "attached:clear"],
    );
  });
}

test("package world loading is separate from selected-program preparation", async () => {
  const calls = [];
  const selected = [{ slot: 1, binding: { primaryPointer: 2, secondaryPointer: 3 } }];
  const program = { id: "selected-owner" };
  const signal = new AbortController().signal;
  const runtime = runtimeWith({
    definition: { actorTags: ["AKIR", "TEST"] },
    sceneObjects: resource("scene", calls),
    packageActors: resource("actors", calls),
    scrollSprites: resource("scroll", calls),
    mapLayers: mapResource(calls),
    attachedObjects: resource("attached", calls),
    presentation: {
      async prepareProgramAssets() {
        calls.push(["presentation:prewarm"]);
        return true;
      },
      async prepareActors(detail, options) {
        assert.deepEqual(detail.actors, ["AKIR", "TEST"]);
        assert.equal(options.signal, signal);
        calls.push(["actors:prewarm-program"]);
        return true;
      },
    },
    activityRuntime: {
      catalog: {
        selectionsForProgram(value, entry) {
          assert.equal(value, program);
          assert.equal(entry, "entry");
          return selected;
        },
      },
      async prepareActivities(value, options) {
        assert.deepEqual(value, selected);
        assert.equal(options.signal, signal);
        calls.push(["activities:prewarm-selected"]);
        return true;
      },
    },
  });

  await runtime.loadWorld(["world-root"]);

  assert.deepEqual(calls.map(([kind]) => kind), [
    "scene:load",
    "actors:load",
    "scroll:load",
    "maps:load",
    "attached:load",
  ]);

  await runtime.prepareCutscene({ program: { entryFunction: "entry" } }, { program, signal });
  assert.deepEqual(calls.slice(-3).map(([kind]) => kind), [
    "presentation:prewarm",
    "activities:prewarm-selected",
    "actors:prewarm-program",
  ]);
});

test("package selection prepares standalone activities and checks cancellation between stages", async () => {
  const controller = new AbortController();
  const activity = { slot: 1, binding: { primaryPointer: 2, secondaryPointer: 3 } };
  const prepared = [];
  let cancel = true;
  const runtime = runtimeWith({
    presentation: {
      async prepareProgramAssets() {
        if (cancel) controller.abort();
      },
    },
    activityRuntime: {
      async prepareActivities(selections) { prepared.push(selections); },
    },
  });
  await assert.rejects(runtime.prepareCutscene({ activity }, { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.deepEqual(prepared, []);
  cancel = false;
  await runtime.prepareCutscene({ activity });
  assert.deepEqual(prepared, [[activity]]);
});

test("cancelled world preparation settles loaders before clearing their resources", async () => {
  const controller = new AbortController();
  const pending = deferred();
  const calls = [];
  const sceneObjects = resource("scene", calls, () => pending.promise);
  const runtime = runtimeWith({ sceneObjects, mapLayers: mapResource(calls) });
  const loading = runtime.loadWorld([], { signal: controller.signal });
  controller.abort();
  pending.resolve();
  await assert.rejects(loading, { name: "AbortError" });
  assert.equal(sceneObjects.loaded, false);
  assert.equal(calls.some(([kind]) => kind === "maps:load"), false);
});

test("program acquisition leaves package ownership closed when actors fail", () => {
  const calls = [];
  const actors = {
    beginProgram(owner, actorTags) {
      calls.push(["actors:begin", owner]);
      assert.deepEqual(actorTags, ["AKIR"]);
      throw new Error("actor lease failed");
    },
  };
  const runtime = programRuntimeWith({ calls, actors });

  assert.throws(
    () => runtime.beginProgram({ program: { id: "owner-program" } }),
    /actor lease failed/,
  );

  assert.equal(runtime.programLease, null);
  assert.deepEqual(calls.map(([kind]) => kind), ["actors:begin"]);
});

test("program acquisition treats an explicit actor rejection as failure", () => {
  const calls = [];
  const actors = {
    beginProgram(owner, actorTags) {
      calls.push(["actors:begin", owner]);
      assert.deepEqual(actorTags, ["AKIR"]);
      return false;
    },
  };
  const runtime = programRuntimeWith({ calls, actors });

  assert.throws(
    () => runtime.beginProgram({ program: { id: "owner-program" } }),
    /native program ownership/,
  );

  assert.equal(runtime.programLease, null);
  assert.deepEqual(calls.map(([kind]) => kind), ["actors:begin"]);
});

test("exact multi-activity programs retain camera ownership between activities", () => {
  const calls = [];
  const runtime = programRuntimeWith({ calls });
  const owner = runtime.beginProgram({
    program: {
      id: "sequence-program",
      preview: { kind: "exact-auth-activity-sequence-v1" },
    },
    sceneState: createNativeSceneGameplayState(),
  });

  assert.deepEqual(
    calls.find(([kind]) => kind === "presentation:begin")[2],
    { continuousActivities: true, actorTags: ["AKIR"] },
  );
  runtime.rollbackProgram(owner, "test-complete");
});

test("package programs release embedded AUTH slots for immediate replay", () => {
  const calls = [];
  const runtime = programRuntimeWith({ calls });
  const binding = { slot: 0, activityId: "OP02/SEQDATA0.AUTH" };
  runtime.activityRuntime = {
    active: false,
    embeddedBindings: () => [binding],
  };
  const sceneState = createNativeSceneGameplayState();
  const detail = {
    program: { id: "sequence-program" },
    sceneState,
  };

  const firstOwner = runtime.beginProgram(detail);
  assert.deepEqual(sceneState.readNativeOperation013eSlot(0), {
    kind: "map-embedded-slot",
    activityId: binding.activityId,
  });
  assert.equal(runtime.completeProgram(firstOwner), true);
  assert.equal(sceneState.readNativeOperation013eSlot(0), null);

  const replayOwner = runtime.beginProgram(detail);
  assert.equal(runtime.completeProgram(replayOwner), true);
  assert.equal(sceneState.readNativeOperation013eSlot(0), null);
});

test("program release resets package state even when actor cleanup fails", () => {
  const calls = [];
  const actors = {
    beginProgram(owner) {
      calls.push(["actors:begin", owner]);
      return true;
    },
    endProgram(owner, reason) {
      calls.push(["actors:end", owner, reason]);
      throw new Error("actor release failed");
    },
    programActor: () => ({ actorCode: "AKIR" }),
    programActors: () => [{
      actorCode: "AKIR",
      root: {
        position: { x: 0, y: 0, z: 0, set() {} },
        rotation: { x: 0, y: 0, z: 0, set() {} },
        scaling: { x: 1, y: 1, z: 1, set() {} },
        rotationQuaternion: null,
        isEnabled: () => true,
        setEnabled() {},
        getDescendants: () => [],
        computeWorldMatrix() {},
      },
    }],
    syncProgramActorTransform: () => true,
  };
  const runtime = programRuntimeWith({ calls, actors });
  const owner = runtime.beginProgram({
    program: { id: "owner-program" },
    sceneState: createNativeSceneGameplayState(),
  });

  assert.throws(
    () => runtime.rollbackProgram(owner, "script-failed"),
    error => (
      error instanceof AggregateError
      && error.errors.length === 1
      && /cleanup failed/.test(error.message)
    ),
  );

  assert.equal(runtime.programLease, null);
  assert.equal(runtime.completeProgram(owner), false);
  assert.deepEqual(calls.map(([kind]) => kind), [
    "actors:begin",
    "presentation:begin",
    "composite:begin",
    "composite:end",
    "presentation:end",
    "actors:end",
    "maps:end",
    "attached:end",
    "music:reset",
    "presentation:reset",
  ]);
});

test("program presentation flushes before a nested AUTH activity starts", async () => {
  const calls = [];
  const runtime = programRuntimeWith({ calls });
  const owner = runtime.beginProgram({
    program: { id: "owner-program" },
    sceneState: createNativeSceneGameplayState(),
  });
  runtime.activityRuntime = {
    active: false,
    acceptsActivity: () => true,
    async startActivity() {
      calls.push(["activity:start"]);
      return { activityId: "embedded", durationFrames: 1 };
    },
  };
  runtime.attachedObjects = null;
  runtime.music.beginActivity = () => calls.push(["music:begin"]);
  calls.length = 0;

  await runtime.nativeActivityAdapter().startActivity({ slot: 0 });

  assert.deepEqual(calls.map(([kind]) => kind), [
    "composite:update",
    "activity:start",
    "music:begin",
  ]);
  runtime.activityRuntime.active = false;
  runtime.presentation.active = false;
  runtime.rollbackProgram(owner, "test-complete");
});

test("a cancelled nested AUTH begin releases its late owner without starting music", async () => {
  const calls = [];
  const runtime = programRuntimeWith({ calls });
  const controller = new AbortController();
  const entered = deferred();
  const pending = deferred();
  const presentationOwner = {};
  const released = [];
  runtime.activityRuntime = createNativeAseqActivityRuntime({
    manifest: activityManifest,
    audioManifest: JSON.parse(readFileSync("public/audio/world/drauth/manifest.json", "utf8")),
    loadAsset: path => readFileSync(path),
    presentation: {
      async beginActivity() {
        entered.resolve();
        await pending.promise;
        return presentationOwner;
      },
      advanceActivity() { return true; },
      endActivity(detail) { released.push(detail.owner); return true; },
    },
  });
  runtime.music.beginActivity = () => calls.push(["music:begin"]);
  const record = activityManifest.activities[0];
  const starting = runtime.nativeActivityAdapter().startActivity({
    slot: record.slot,
    binding: { primaryPointer: record.primaryPointer, secondaryPointer: record.secondaryPointer },
  }, { signal: controller.signal });
  await entered.promise;
  controller.abort();
  pending.resolve();
  await assert.rejects(starting, { name: "AbortError" });
  assert.deepEqual(released, [presentationOwner]);
  assert.equal(runtime.activityRuntime.active, null);
  assert.equal(calls.some(([kind]) => kind === "music:begin"), false);
});

for (const exit of ["complete", "cancel", "start-failure"]) {
  test(`nested AUTH soundtrack continues until program ${exit}, then permits replay`, async () => {
    const calls = [];
    const runtime = programRuntimeWith({ calls });
    runtime.attachedObjects = null;
    runtime.music = createNativeCutsceneMusicRuntime({
      cues: [{ startActivity: true, trackId: "soundtrack", loop: true }],
    }, {
      playTemporaryTrack: track => (calls.push(["play", track]), true),
      stopTemporaryTrack: track => (calls.push(["stop", track]), true),
      setPlaybackPaused() {},
    });
    runtime.activityRuntime = {
      active: false,
      async startActivity(detail) { this.active = true; return detail; },
      stopActivity() { this.active = false; return true; },
      rollbackActivity() { this.active = false; return true; },
    };
    const adapter = runtime.nativeActivityAdapter();
    const detail = {
      program: { id: "preview-program", preview: { kind: "exact-auth-activity-sequence-v1" } },
      sceneState: createNativeSceneGameplayState(),
    };
    const owner = runtime.beginProgram(detail);
    await adapter.startActivity({ slot: 0 });
    adapter.stopActivity({});
    assert.equal(calls.filter(([kind]) => kind === "stop").length, 0);
    await adapter.startActivity({ slot: 0 });
    assert.equal(calls.filter(([kind]) => kind === "play").length, 1);
    if (exit === "complete") {
      adapter.stopActivity({});
      runtime.completeProgram(owner);
    } else if (exit === "cancel") {
      adapter.rollbackActivity("cancelled");
      runtime.rollbackProgram(owner, "cancelled");
    } else {
      adapter.stopActivity({});
      runtime.attachedObjects = { beginActivity: () => false, endTrack() {} };
      await assert.rejects(adapter.startActivity({ slot: 0 }), /rejected attached objects/);
      runtime.rollbackProgram(owner, "start-failed");
    }
    assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
    runtime.attachedObjects = null;
    const replayOwner = runtime.beginProgram(detail);
    await adapter.startActivity({ slot: 0 });
    assert.equal(calls.filter(([kind]) => kind === "play").length, 2);
    adapter.stopActivity({});
    runtime.completeProgram(replayOwner);
    assert.equal(calls.filter(([kind]) => kind === "stop").length, 2);
  });
}

test("program ownership acquires and releases native scroll sprites transactionally", () => {
  const calls = [];
  const runtime = programRuntimeWith({ calls });
  runtime.scrollSprites = {
    begin(owner, sceneState) {
      calls.push(["scroll:begin", owner, sceneState]);
      return true;
    },
    end(owner) {
      calls.push(["scroll:end", owner]);
      return true;
    },
  };
  const sceneState = createNativeSceneGameplayState();
  const owner = runtime.beginProgram({
    program: { id: "owner-program" },
    sceneState,
  });
  runtime.rollbackProgram(owner, "test-complete");

  assert.deepEqual(calls.map(([kind]) => kind), [
    "actors:begin",
    "presentation:begin",
    "scroll:begin",
    "composite:begin",
    "composite:end",
    "scroll:end",
    "presentation:end",
    "actors:end",
    "maps:end",
    "attached:end",
    "music:reset",
    "presentation:reset",
  ]);
  assert.equal(calls.find(([kind]) => kind === "scroll:begin")[2], sceneState);
});

test("program context exposes FACE-table state only for owned facial actors", () => {
  const actor = { actorCode: "AKID" };
  const runtime = runtimeWith({
    programLease: { programId: "owner" },
    programFaceTable: new Map([["AKID", Object.freeze({
      actorTag: "AKID",
      activity: 1,
      refreshCount: 0,
    })]]),
    actors: {
      programActor: actorTag => actorTag === "AKID" ? actor : null,
    },
    presentation: { applyNodeMotionResource: () => false },
  });
  const context = runtime.programContext();

  assert.equal(context.resolveNativeFaceTableActor("AKID"), actor);
  assert.equal(context.resolveNativeFaceTableActor("SINF"), null);
  assert.deepEqual(context.refreshNativeFaceTable({ actorTag: "AKID", actor }), {
    actorTag: "AKID",
    activity: 1,
    refreshCount: 1,
  });
  assert.equal(context.queryNativeFaceActorActivity({ actorTag: "AKID", actor }), 1);
});
