import assert from "node:assert/strict";
import test from "node:test";

import {
  NativeCutsceneDirector,
} from "../play/cutscenes/NativeCutsceneDirector.js";
import {
  NativeCutscenePackageRegistry,
} from "../play/cutscenes/NativeCutscenePackageRegistry.js";

function packageDefinition({
  id,
  worldId,
  actors = [],
  binding = null,
}) {
  return {
    id,
    worldId,
    actorDefinitions: actors,
    actorTags: actors.map(actor => actor.actorCode),
    assets: { "play/test.bin": "/test.bin" },
    playback: { manifest: {}, binding },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

function harness({
  packageStartResult = true,
  packageStopError = null,
  program = false,
  programUsesContext = false,
  programStartResult = true,
} = {}) {
  const registry = new NativeCutscenePackageRegistry([
    packageDefinition({
      id: "opening",
      worldId: "intro",
      binding: { slot: 0, primaryPointer: 5, secondaryPointer: 6 },
      actors: [{ actorCode: "AKIR", modelCode: "YKC_M" }],
    }),
    packageDefinition({
      id: "street-auth",
      worldId: "street",
      binding: { slot: 0, primaryPointer: 1, secondaryPointer: 2 },
      actors: [
        { actorCode: "AKIR", modelCode: "YKC_M" },
        { actorCode: "SMTH", modelCode: "GIB_M" },
      ],
    }),
  ]);
  const calls = [];
  const runtimes = new Map();
  const completed = [];
  const stopped = [];
  let acquireCount = 0;
  let releaseCount = 0;

  const director = new NativeCutsceneDirector({
    registry,
    packageRuntimeOptions: {},
    acquireGameplay: (cutscene) => {
      acquireCount += 1;
      calls.push(["acquire", cutscene.id]);
      return () => {
        releaseCount += 1;
        calls.push(["release", cutscene.id]);
      };
    },
    onComplete: cutscene => completed.push(cutscene.id),
    onStopped: (cutscene, reason) => stopped.push([cutscene.id, reason]),
    programRuntimeOptions: program ? {} : null,
    createProgramRuntime: program
      ? ({ createContext, onComplete, onStopped }) => ({
          active: false,
          async start(cutscene) {
            this.active = true;
            if (programUsesContext) {
              calls.push([
                "program-context",
                await createContext({
                  cutscene,
                  program: { id: cutscene.program.programId },
                }),
              ]);
            }
            calls.push(["program-start", cutscene.id]);
            return programStartResult;
          },
          update(seconds) {
            calls.push(["program-update", seconds]);
          },
          stop(reason) {
            if (!this.active) return false;
            this.active = false;
            calls.push(["program-stop", reason]);
            onStopped(reason, "program-scene");
            return true;
          },
          finish() {
            this.active = false;
            onComplete("program-scene");
          },
          transportState: () => ({ active: true, paused: false }),
          setPaused: () => false,
          seekBySeconds: () => false,
        })
      : undefined,
    createPackageRuntime: ({ definition, onComplete, onStopped }) => {
      const activityAdapter = {
            acceptsActivity: detail => (
              detail.slot === definition.playback.binding.slot
              && detail.binding.primaryPointer
                === definition.playback.binding.primaryPointer
              && detail.binding.secondaryPointer
                === definition.playback.binding.secondaryPointer
            ),
            startActivity: async detail => {
              calls.push(["activity-start", detail]);
              return { activityId: "native", durationFrames: 2 };
            },
            updateActivity: detail => (calls.push(["activity-update", detail]), true),
            stopActivity: detail => (calls.push(["activity-stop", detail]), true),
            rollbackActivity: reason => (calls.push(["activity-rollback", reason]), true),
          };
      const runtime = {
        id: definition.id,
        active: false,
        ownsPresentation: false,
        programLease: null,
        async start(cutscene) {
          this.active = true;
          this.ownsPresentation = true;
          calls.push(["start", definition.id, cutscene.id]);
          return packageStartResult;
        },
        update(seconds) {
          calls.push(["update", definition.id, seconds]);
        },
        stop(reason) {
          if (packageStopError) throw packageStopError;
          if (!this.active) return true;
          this.active = false;
          this.ownsPresentation = false;
          onStopped(reason, director.activeCutscene.cutscene.id);
          return true;
        },
        finish(cutsceneId) {
          this.active = false;
          this.ownsPresentation = false;
          onComplete(cutsceneId);
        },
        transportState: () => ({ active: true, paused: false }),
        setPaused: paused => (calls.push(["paused", paused]), true),
        seekBySeconds: seconds => (calls.push(["seek", seconds]), true),
        loadWorld: meshes => calls.push(["load", definition.id, meshes]),
        clearWorld: () => calls.push(["clear", definition.id]),
        beginProgram(detail) {
          if (this.programLease) throw new Error("program already leased");
          this.programLease = Object.freeze({
            packageId: definition.id,
            programId: detail.program.id,
          });
          calls.push(["program-begin", definition.id, detail.program.id]);
          return this.programLease;
        },
        updateProgramPresentation(lease) {
          if (lease !== this.programLease) return false;
          calls.push(["program-update-presentation", definition.id]);
          return true;
        },
        completeProgram(lease) {
          if (lease !== this.programLease) return false;
          calls.push(["program-complete", definition.id, lease.programId]);
          this.programLease = null;
          return true;
        },
        rollbackProgram(lease, reason) {
          if (lease !== this.programLease) return false;
          calls.push([
            "program-rollback",
            definition.id,
            lease.programId,
            reason,
          ]);
          this.programLease = null;
          return true;
        },
        nativeActivityAdapter: () => activityAdapter,
        programContext: detail => ({
          packageId: definition.id,
          programId: detail.program.id,
        }),
        dispose: () => calls.push(["dispose", definition.id]),
      };
      runtimes.set(definition.id, runtime);
      return runtime;
    },
  });
  return {
    calls,
    completed,
    director,
    registry,
    runtimes,
    stopped,
    ownership: () => ({ acquireCount, releaseCount }),
  };
}

function preparingHarness(stage = "world") {
  const context = harness();
  const gate = deferred();
  const began = deferred();
  const signals = [];
  const originalFactory = context.director.createPackageRuntime;
  let preparations = 0;
  context.director.createPackageRuntime = options => {
    const runtime = originalFactory(options);
    const key = stage === "world" ? "loadWorld" : "prepareCutscene";
    const original = runtime[key];
    runtime[key] = async (value, options) => {
      preparations += 1;
      signals.push(options.signal);
      context.calls.push(["prepare-begin", preparations]);
      if (preparations === 1) {
        began.resolve();
        // Deliberately ignore AbortSignal while a decoder unwinds. The
        // director must keep replacement work serialized even in this case.
        await gate.promise;
      }
      original?.(value);
      context.calls.push(["prepare-end", preparations]);
    };
    return runtime;
  };
  return {
    ...context, gate, began, signals,
    cutscene: {
      id: "loading-scene", packageId: "opening", worldId: "intro",
      activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
    },
  };
}

for (const stage of ["world", "selected-activity"]) {
  test(`cancelling ${stage} preparation settles immediately and serializes retry`, async () => {
    const context = preparingHarness(stage);
    await context.director.loadWorld("intro", []);
    const first = context.director.start(context.cutscene);
    await context.began.promise;
    assert.equal(context.director.active, true, "preparation participates in cancellation UI");
    assert.deepEqual(context.ownership(), { acquireCount: 0, releaseCount: 0 });
    context.director.stop("user-cancelled");
    assert.equal(await first, false, "the caller does not wait for cancelled asset work");
    assert.equal(context.signals[0].aborted, true);

    const retry = context.director.start(context.cutscene);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context.signals.length, 1, "old decoder still owns package mutations");
    context.gate.resolve();
    assert.equal(await retry, true);
    assert.equal(context.signals.length, 2);
    assert.equal(context.signals[1].aborted, false);
    assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 0 });
    assert.deepEqual(context.stopped, [[context.cutscene.id, "user-cancelled"]]);
    const clear = context.calls.findIndex(([kind]) => kind === "clear");
    const restart = context.calls.findIndex(([kind, count]) => kind === "prepare-begin" && count === 2);
    assert.ok(clear >= 0 && clear < restart, "old cleanup cannot clear the retry");
    context.director.stop();
  });
}

test("superseding a pending cutscene prevents its late gameplay acquisition", async () => {
  const context = preparingHarness();
  await context.director.loadWorld("intro", []);
  const first = context.director.start(context.cutscene);
  await context.began.promise;
  const secondCutscene = { ...context.cutscene, id: "replacement" };
  const second = context.director.start(secondCutscene);
  assert.equal(await first, false);
  context.gate.resolve();
  assert.equal(await second, true);
  assert.deepEqual(context.calls.filter(([kind]) => kind === "acquire"), [["acquire", "replacement"]]);
  assert.deepEqual(context.stopped, [[context.cutscene.id, "superseded"]]);
  context.director.stop();
});

for (const reason of ["world-change", "disposed"]) {
  test(`${reason} prevents late preparation from starting`, async () => {
    const context = preparingHarness();
    await context.director.loadWorld("intro", []);
    const pending = context.director.start(context.cutscene);
    await context.began.promise;
    if (reason === "disposed") context.director.dispose();
    else await context.director.loadWorld("street", []);
    assert.equal(await pending, false);
    context.gate.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context.director.active, false);
    assert.deepEqual(context.ownership(), { acquireCount: 0, releaseCount: 0 });
    assert.deepEqual(context.stopped, [[context.cutscene.id, reason]]);
  });
}

test("failed package preparation remains observable and permits a clean retry", async () => {
  const context = preparingHarness();
  await context.director.loadWorld("intro", []);
  const pending = context.director.start(context.cutscene);
  await context.began.promise;
  context.gate.reject(new Error("fixture asset unavailable"));
  await assert.rejects(pending, /fixture asset unavailable/);
  assert.equal(context.director.active, false);
  assert.equal(await context.director.start(context.cutscene), true);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 0 });
  context.director.stop();
});

test("program-data preparation is cancellable before world resources or gameplay are acquired", async () => {
  const context = harness({ program: true });
  const gate = deferred();
  let signal;
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = options => Object.assign(originalFactory(options), {
    prepareCutscene: async () => true,
  });
  context.director.programRuntimeOptions.getNativeRuntime = () => ({
    loadProgram: (_id, options) => {
      signal = options.signal;
      return gate.promise;
    },
  });
  await context.director.loadWorld("intro", []);
  const pending = context.director.start({
    id: "program-scene", packageId: "opening", worldId: "intro",
    program: { programId: "opening-owner" },
  });
  assert.equal(context.director.active, true);
  context.director.stop("user-cancelled");
  assert.equal(await pending, false);
  assert.equal(signal.aborted, true);
  gate.resolve({ id: "opening-owner", functions: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(context.calls, []);
  assert.deepEqual(context.ownership(), { acquireCount: 0, releaseCount: 0 });
});

test("simultaneous caller cancellation observes a rejected preparation promise", async () => {
  const context = harness({ program: true });
  const caller = new AbortController();
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = options => Object.assign(originalFactory(options), {
    prepareCutscene: async () => true,
  });
  context.director.programRuntimeOptions.getNativeRuntime = () => ({
    loadProgram: () => {
      caller.abort();
      return Promise.reject(new Error("late cancelled download failure"));
    },
  });
  await context.director.loadWorld("intro", []);
  assert.equal(await context.director.start({
    id: "program-scene", packageId: "opening", worldId: "intro",
    program: { programId: "opening-owner" },
  }, { signal: caller.signal }), false);
  // Node's test runner reports an unhandled rejection if the already-created
  // download promise was abandoned by a synchronous cancellation throw.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(context.ownership(), { acquireCount: 0, releaseCount: 0 });
});

test("program cancellation reaches an AUTH activity still acquiring presentation", async () => {
  const context = harness({ program: true });
  await context.director.loadWorld("street", []);
  await context.director.start({
    id: "program-scene", packageId: "street-auth", worldId: "street",
    program: { programId: "street-owner", entryFunction: "0x100" },
  });
  const gate = deferred();
  const began = deferred();
  let capturedSignal;
  let latePresentation = false;
  const runtime = context.runtimes.get("street-auth");
  runtime.nativeActivityAdapter().startActivity = async (_detail, { signal } = {}) => {
    capturedSignal = signal;
    began.resolve();
    await gate.promise;
    signal?.throwIfAborted();
    latePresentation = true;
    return { activityId: "native", durationFrames: 2 };
  };
  const pending = context.director.nativeActivityAdapter(() => "street").startActivity({
    slot: 0, binding: { primaryPointer: 1, secondaryPointer: 2 },
  });
  await began.promise;
  context.director.stop("user-cancelled");
  gate.resolve();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(capturedSignal.aborted, true);
  assert.equal(latePresentation, false);
  assert.equal(context.director.directActivityRuntime, null);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
});

test("cancelled runtime startup remains a package barrier until adapter cleanup settles", async () => {
  const context = harness();
  const began = deferred();
  const gate = deferred();
  const originalFactory = context.director.createPackageRuntime;
  let startCount = 0;
  let prepareCount = 0;
  context.director.createPackageRuntime = options => {
    const runtime = originalFactory(options);
    const start = runtime.start.bind(runtime);
    runtime.prepareCutscene = async () => { prepareCount += 1; };
    runtime.start = async (cutscene, { signal }) => {
      startCount += 1;
      if (startCount === 1) {
        began.resolve();
        await gate.promise;
      }
      if (signal.aborted) return false;
      return start(cutscene);
    };
    return runtime;
  };
  const cutscene = {
    id: "delayed-scene", packageId: "opening", worldId: "intro",
    activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
  };
  await context.director.loadWorld("intro", []);
  const first = context.director.start(cutscene);
  await began.promise;
  context.director.stop("user-cancelled");
  assert.equal(await first, false);
  const retry = context.director.start(cutscene);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prepareCount, 1, "retry must not touch assets still owned by old start");
  gate.resolve();
  assert.equal(await retry, true);
  assert.equal(prepareCount, 2);
  assert.deepEqual(context.ownership(), { acquireCount: 2, releaseCount: 1 });
  context.director.stop();
});

test("a starting program can launch its own nested activity without waiting on itself", async () => {
  const context = harness({ program: true });
  const originalFactory = context.director.createProgramRuntime;
  context.director.createProgramRuntime = options => {
    const runtime = originalFactory(options);
    const start = runtime.start.bind(runtime);
    runtime.start = async cutscene => {
      await context.director.nativeActivityAdapter(() => "street").startActivity({
        slot: 0, binding: { primaryPointer: 1, secondaryPointer: 2 },
      });
      return start(cutscene);
    };
    return runtime;
  };
  await context.director.loadWorld("street", []);
  assert.equal(await context.director.start({
    id: "program-scene", packageId: "street-auth", worldId: "street",
    program: { programId: "street-owner", entryFunction: "0x100" },
  }), true);
  context.director.stop();
});

test("native cutscene director resolves packages and owns lifecycle once", async () => {
  const context = harness();
  const cutscene = {
    id: "scene-1",
    packageId: "opening",
    worldId: "intro",
    activity: {
      slot: 0,
      binding: { primaryPointer: 5, secondaryPointer: 6 },
    },
  };

  const meshes = [{ name: "intro-root" }];
  await context.director.loadWorld("intro", meshes);
  await context.director.start(cutscene);
  assert.equal(context.director.active, true);
  assert.equal(context.director.ownsPlayerPresentation, true);
  context.director.update(1 / 30);
  assert.equal(context.director.togglePaused(), true);
  assert.equal(context.director.seekBySeconds(5), true);
  context.runtimes.get("opening").finish(cutscene.id);

  assert.equal(context.director.active, false);
  assert.deepEqual(context.completed, [cutscene.id]);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
  assert.deepEqual(context.calls.slice(0, 4), [
    ["load", "opening", meshes],
    ["acquire", "scene-1"],
    ["start", "opening", "scene-1"],
    ["update", "opening", 1 / 30],
  ]);
});

test("program cutscenes own one session while exact AUTH activities run", async () => {
  const context = harness({ program: true });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await context.director.start(cutscene);
  const activity = context.director.nativeActivityAdapter(() => "street");
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };

  await activity.startActivity(detail);
  assert.equal(activity.stopActivity({ activityId: "native" }), true);
  assert.equal(context.director.active, true);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 0 });

  context.director.stop("program-complete");
  assert.equal(context.director.active, false);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
  assert.deepEqual(context.stopped, [["program-scene", "program-complete"]]);
});

test("program cutscenes compose context from their resolved package runtime", async () => {
  const context = harness({ program: true, programUsesContext: true });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  await context.director.loadWorld("street", [{ name: "street-root" }]);

  assert.equal(await context.director.start(cutscene), true);
  assert.deepEqual(
    context.calls.find(([kind]) => kind === "program-context"),
    [
      "program-context",
      { packageId: "street-auth", programId: "street-owner" },
    ],
  );
});

test("program transaction ownership delegates complete and rollback exactly once", async () => {
  const context = harness({ program: true });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const transaction = { program: { id: "street-owner" } };
  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await context.director.start(cutscene);

  const completedOwnership = adapter.beginProgram(transaction);
  assert.equal(adapter.updateProgram({ ownership: completedOwnership }), true);
  assert.equal(adapter.completeProgram({ ownership: completedOwnership }), true);
  assert.equal(adapter.completeProgram({ ownership: completedOwnership }), false);

  const rolledBackOwnership = adapter.beginProgram(transaction);
  assert.equal(adapter.rollbackProgram({
    ownership: rolledBackOwnership,
    reason: "script-failed",
  }), true);
  assert.equal(adapter.rollbackProgram({
    ownership: rolledBackOwnership,
    reason: "script-failed-again",
  }), false);

  assert.deepEqual(
    context.calls.filter(([kind]) => kind.startsWith("program-")),
    [
      ["program-start", "program-scene"],
      ["program-begin", "street-auth", "street-owner"],
      ["program-update-presentation", "street-auth"],
      ["program-complete", "street-auth", "street-owner"],
      ["program-begin", "street-auth", "street-owner"],
      ["program-rollback", "street-auth", "street-owner", "script-failed"],
    ],
  );
});

test("one program package lease spans multiple exact AUTH activities", async () => {
  const context = harness({ program: true });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await context.director.start(cutscene);
  const ownership = adapter.beginProgram({ program: { id: "street-owner" } });

  for (let index = 0; index < 2; index += 1) {
    await adapter.startActivity(detail);
    assert.equal(adapter.stopActivity({ activityId: "native" }), true);
  }
  assert.equal(adapter.completeProgram({ ownership }), true);

  assert.equal(
    context.calls.filter(([kind]) => kind === "program-begin").length,
    1,
  );
  assert.equal(
    context.calls.filter(([kind]) => kind === "activity-start").length,
    2,
  );
  assert.equal(
    context.calls.filter(([kind]) => kind === "activity-stop").length,
    2,
  );
  assert.equal(
    context.calls.filter(([kind]) => kind === "program-complete").length,
    1,
  );
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 0 });
});

test("concurrent package cutscene and exact activity starts have one winner", async () => {
  const context = harness();
  const loadStarted = deferred();
  const loadGate = deferred();
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = (options) => {
    const runtime = originalFactory(options);
    if (options.definition.id === "street-auth") {
      runtime.loadWorld = async (meshes) => {
        context.calls.push(["load-begin", runtime.id, meshes]);
        loadStarted.resolve();
        await loadGate.promise;
        context.calls.push(["load-end", runtime.id, meshes]);
      };
    }
    return runtime;
  };
  const cutscene = {
    id: "activity-scene",
    packageId: "street-auth",
    worldId: "street",
    activity: { slot: 0, primaryPointer: 1, secondaryPointer: 2 },
  };
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  await context.director.loadWorld("street", [{ name: "street-root" }]);

  const cutsceneStarting = context.director.start(cutscene);
  await loadStarted.promise;
  const activityStarting = adapter.startActivity(detail);
  loadGate.resolve();

  assert.equal(await cutsceneStarting, true);
  await assert.rejects(
    activityStarting,
    /another native activity is already active/,
  );
  assert.equal(context.director.activeCutscene?.cutscene.id, "activity-scene");
  assert.equal(context.director.directActivityRuntime, null);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 0 });
});

test("concurrent exact activity starts reserve the package once after loading", async () => {
  const context = harness();
  const loadStarted = deferred();
  const loadGate = deferred();
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = (options) => {
    const runtime = originalFactory(options);
    if (options.definition.id === "street-auth") {
      runtime.loadWorld = async () => {
        loadStarted.resolve();
        await loadGate.promise;
      };
    }
    return runtime;
  };
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  await context.director.loadWorld("street", [{ name: "street-root" }]);

  const firstStart = adapter.startActivity(detail);
  await loadStarted.promise;
  const secondStart = adapter.startActivity(detail);
  loadGate.resolve();

  assert.deepEqual(await firstStart, {
    activityId: "native",
    durationFrames: 2,
  });
  await assert.rejects(
    secondStart,
    /another native activity became active while loading/,
  );
  assert.equal(
    context.calls.filter(([kind]) => kind === "activity-start").length,
    1,
  );
  assert.equal(adapter.stopActivity({ activityId: "native" }), true);
  assert.equal(context.director.directActivityRuntime, null);
});

test("a preparing program reserves ownership before unrelated activities start", async () => {
  const context = harness({ program: true });
  const loadStarted = deferred();
  const loadGate = deferred();
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = (options) => {
    const runtime = originalFactory(options);
    if (options.definition.id === "street-auth") {
      runtime.loadWorld = async () => {
        loadStarted.resolve();
        await loadGate.promise;
      };
    }
    return runtime;
  };
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  await context.director.loadWorld("street", [{ name: "street-root" }]);

  const programStarting = context.director.start(cutscene);
  await loadStarted.promise;
  const unrelatedActivityStarting = adapter.startActivity(detail);
  loadGate.resolve();

  assert.equal(await programStarting, true);
  await assert.rejects(
    unrelatedActivityStarting,
    /another native activity is already active/,
  );
  assert.equal(context.director.activeCutscene?.cutscene.id, "program-scene");
  assert.equal(context.director.directActivityRuntime, null);
});

test("same-world root replacement invalidates an in-flight package load", async () => {
  const context = harness();
  const firstLoadStarted = deferred();
  const firstLoadGate = deferred();
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = (options) => {
    const runtime = originalFactory(options);
    if (options.definition.id === "street-auth") {
      let loadCount = 0;
      runtime.loadWorld = async (meshes) => {
        loadCount += 1;
        context.calls.push(["generation-load", loadCount, meshes]);
        if (loadCount === 1) {
          firstLoadStarted.resolve();
          await firstLoadGate.promise;
        }
      };
    }
    return runtime;
  };
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  const oldRoots = [{ name: "old-street-root" }];
  const newRoots = [{ name: "new-street-root" }];
  await context.director.loadWorld("street", oldRoots);

  const staleStart = adapter.startActivity(detail);
  await firstLoadStarted.promise;
  await context.director.loadWorld("street", newRoots);
  firstLoadGate.resolve();

  await assert.rejects(staleStart, { name: "AbortError", message: "world-change" });
  assert.deepEqual(await adapter.startActivity(detail), {
    activityId: "native",
    durationFrames: 2,
  });
  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "generation-load"),
    [
      ["generation-load", 1, oldRoots],
      ["generation-load", 2, newRoots],
    ],
  );
  const firstClear = context.calls.findIndex(([kind]) => kind === "clear");
  const secondLoad = context.calls.findIndex(
    ([kind, count]) => kind === "generation-load" && count === 2,
  );
  assert.ok(firstClear >= 0 && firstClear < secondLoad);
});

test("a runtime that rejects start releases gameplay ownership", async () => {
  const context = harness({ packageStartResult: false });
  const cutscene = {
    id: "scene-1",
    packageId: "opening",
    worldId: "intro",
    activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
  };
  await context.director.loadWorld("intro", [{ name: "intro-root" }]);

  await assert.rejects(
    context.director.start(cutscene),
    /native runtime rejected start/,
  );

  assert.equal(context.director.active, false);
  assert.equal(context.director.activeCutscene, null);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
  assert.deepEqual(context.stopped, [["scene-1", "start-failed"]]);
});

test("a program runtime that rejects start releases gameplay ownership", async () => {
  const context = harness({ program: true, programStartResult: false });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: {
      programId: "street-owner",
      entryFunction: "0x100",
    },
  };
  await context.director.loadWorld("street", [{ name: "street-root" }]);

  await assert.rejects(
    context.director.start(cutscene),
    /native runtime rejected start/,
  );

  assert.equal(context.director.active, false);
  assert.equal(context.director.activeCutscene, null);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
  assert.deepEqual(context.stopped, [["program-scene", "start-failed"]]);
});

test("a start cleanup failure still releases gameplay ownership", async () => {
  const context = harness({
    packageStartResult: false,
    packageStopError: new Error("rollback failed"),
  });
  const cutscene = {
    id: "scene-1",
    packageId: "opening",
    worldId: "intro",
    activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
  };
  await context.director.loadWorld("intro", [{ name: "intro-root" }]);
  await assert.rejects(context.director.start(cutscene), error => (
    error instanceof AggregateError
    && error.errors.some(value => /rollback failed/.test(value.message))
  ));
  assert.equal(context.director.activeCutscene, null);
  assert.deepEqual(context.ownership(), { acquireCount: 1, releaseCount: 1 });
});

test("a late native program rollback releases its exact package lease", async () => {
  const context = harness({ program: true });
  const cutscene = {
    id: "program-scene",
    packageId: "street-auth",
    worldId: "street",
    program: { programId: "street-owner", entryFunction: "0x100" },
  };
  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await context.director.start(cutscene);
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const ownership = adapter.beginProgram({ program: { id: "street-owner" } });

  context.director.activeCutscene.runtime.finish();
  assert.equal(context.director.activeCutscene, null);
  assert.equal(adapter.rollbackProgram({ ownership, reason: "late-factory" }), true);
  assert.equal(context.runtimes.get("street-auth").programLease, null);
});

test("package cutscenes still reject nested native activities", async () => {
  const context = harness();
  await context.director.loadWorld("intro", [{ name: "intro-root" }]);
  await context.director.start({
    id: "scene-1",
    packageId: "opening",
    worldId: "intro",
    activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
  });
  const activity = context.director.nativeActivityAdapter(() => "street");

  await assert.rejects(
    activity.startActivity({
      slot: 0,
      binding: { primaryPointer: 1, secondaryPointer: 2 },
    }),
    /another native activity is already active/,
  );
});

test("native activity operations use the package for the active world", async () => {
  const context = harness();
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const detail = { slot: 0, binding: { primaryPointer: 1, secondaryPointer: 2 } };

  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await adapter.startActivity(detail);
  assert.equal(context.director.active, true);
  assert.equal(adapter.updateActivity({ currentFrame: 1 }), true);
  assert.equal(adapter.stopActivity({ activityId: "native" }), true);
  assert.equal(context.director.active, false);
  assert.deepEqual(context.calls.filter(([kind]) => kind.startsWith("activity-")), [
    ["activity-start", detail],
    ["activity-update", { currentFrame: 1 }],
    ["activity-stop", { activityId: "native" }],
  ]);
});

test("native activity operations select exact bindings among packages in one world", async () => {
  const context = harness();
  context.registry = new NativeCutscenePackageRegistry([
    packageDefinition({
      id: "street-first",
      worldId: "street",
      binding: { slot: 0, primaryPointer: 10, secondaryPointer: 20 },
    }),
    packageDefinition({
      id: "street-second",
      worldId: "street",
      binding: { slot: 0, primaryPointer: 30, secondaryPointer: 40 },
    }),
  ]);
  context.director.registry = context.registry;
  const adapter = context.director.nativeActivityAdapter(() => "street");
  const detail = {
    slot: 0,
    binding: { primaryPointer: 30, secondaryPointer: 40 },
  };

  await context.director.loadWorld("street", [{ name: "street-root" }]);
  await adapter.startActivity(detail);

  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "activity-start"),
    [["activity-start", detail]],
  );
  assert.equal(context.runtimes.has("street-first"), true);
  assert.equal(context.runtimes.has("street-second"), true);
});

test("native activity operations reject missing and ambiguous package bindings", async () => {
  const context = harness();
  const adapter = context.director.nativeActivityAdapter(() => "street");

  await context.director.loadWorld("street", [{ name: "street-root" }]);

  await assert.rejects(
    adapter.startActivity({
      slot: 0,
      binding: { primaryPointer: 9, secondaryPointer: 9 },
    }),
    /0 packages for native activity binding/,
  );
});

test("world registration lazily loads only the selected package", async () => {
  const context = harness();
  const meshes = [{ name: "street-root" }];
  await context.director.loadWorld("street", meshes);

  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "load"),
    [],
  );

  const adapter = context.director.nativeActivityAdapter(() => "street");
  const detail = {
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  };
  await adapter.startActivity(detail);

  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "load"),
    [["load", "street-auth", meshes]],
  );
});

test("an unusable co-located package cannot poison another package", async () => {
  const context = harness();
  context.registry = new NativeCutscenePackageRegistry([
    packageDefinition({
      id: "street-ready",
      worldId: "street",
      binding: { slot: 0, primaryPointer: 1, secondaryPointer: 2 },
    }),
    packageDefinition({
      id: "street-staged",
      worldId: "street",
      binding: { slot: 0, primaryPointer: 3, secondaryPointer: 4 },
    }),
  ]);
  context.director.registry = context.registry;
  const originalFactory = context.director.createPackageRuntime;
  context.director.createPackageRuntime = (options) => {
    const runtime = originalFactory(options);
    if (options.definition.id === "street-staged") {
      runtime.loadWorld = async () => {
        throw new Error("staged package lifecycle is unavailable");
      };
    }
    return runtime;
  };
  const meshes = [{ name: "street-root" }];
  await context.director.loadWorld("street", meshes);
  const adapter = context.director.nativeActivityAdapter(() => "street");

  await adapter.startActivity({
    slot: 0,
    binding: { primaryPointer: 1, secondaryPointer: 2 },
  });

  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "load"),
    [["load", "street-ready", meshes]],
  );
});

test("cutscene start fails before gameplay ownership when its world is absent", async () => {
  const context = harness();
  await assert.rejects(
    context.director.start({
      id: "scene-1",
      packageId: "opening",
      worldId: "intro",
      activity: { slot: 0, binding: { primaryPointer: 5, secondaryPointer: 6 } },
    }),
    /world intro is not loaded/,
  );
  assert.deepEqual(context.ownership(), { acquireCount: 0, releaseCount: 0 });
});

test("cutscene package registry centralizes actors and rejects mismatched scenes", () => {
  const { registry } = harness();
  assert.deepEqual(
    registry.actorDefinitionsForWorld("street").map(value => value.actorCode),
    ["AKIR", "SMTH"],
  );
  assert.deepEqual(registry.actorTags(), ["AKIR", "SMTH"]);
  assert.throws(
    () => registry.requireForCutscene({
      id: "bad-world",
      packageId: "opening",
      worldId: "street",
    }),
    /world does not match/,
  );
});
