import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NativeCutscenePackageRuntime,
} from "../play/cutscenes/NativeCutscenePackageRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

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

test("package world load prewarms every AUTH before playback", async () => {
  const calls = [];
  const runtime = runtimeWith({
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
    },
    activityRuntime: {
      async prepareAllActivities() {
        calls.push(["activities:prewarm"]);
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
    "presentation:prewarm",
    "activities:prewarm",
  ]);
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
