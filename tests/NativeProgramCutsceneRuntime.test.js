import assert from "node:assert/strict";
import test from "node:test";

import {
  NativeProgramCutsceneRuntime,
} from "../play/cutscenes/NativeProgramCutsceneRuntime.js";

const PROGRAM = Object.freeze({
  id: "disc1-ju00-kitten-care-owner-0x27554",
  area: "JU00",
  entryFunction: "0x27554",
  directEntries: ["0x2aa70"],
});

const CUTSCENE = Object.freeze({
  id: "kitten-care",
  worldId: "yamanose",
  program: Object.freeze({
    programId: PROGRAM.id,
    entryFunction: "0x2aa70",
    area: "JU00",
  }),
});

function nativeRuntimeHarness({
  startResult = { status: "yielded" },
  onStart = null,
  startError = null,
  cancelSettles = true,
} = {}) {
  const listeners = new Set();
  const calls = [];
  const runtime = {
    program(programId) {
      calls.push(["program", programId]);
      return programId === PROGRAM.id ? PROGRAM : null;
    },
    onSettled(listener) {
      calls.push(["subscribe"]);
      listeners.add(listener);
      return () => {
        calls.push(["unsubscribe"]);
        listeners.delete(listener);
      };
    },
    async startProgram(detail) {
      calls.push(["start", detail]);
      onStart?.(runtime, detail);
      if (startError) throw startError;
      return startResult;
    },
    cancel(reason) {
      calls.push(["cancel", reason]);
      if (cancelSettles) {
        runtime.settle("cancelled", {
          status: "cancelled",
          reason,
          programId: PROGRAM.id,
          entryFunction: CUTSCENE.program.entryFunction,
        });
      }
      return true;
    },
    seekBySeconds(seconds) {
      calls.push(["seek", seconds]);
      return true;
    },
    settle(kind, result) {
      for (const listener of [...listeners]) listener({ kind, result });
    },
  };
  return { calls, listeners, runtime };
}

function playbackHarness({ native = nativeRuntimeHarness(), ...overrides } = {}) {
  const completed = [];
  const stopped = [];
  let resolveCount = 0;
  const runtime = new NativeProgramCutsceneRuntime({
    getNativeRuntime: () => {
      resolveCount += 1;
      return native.runtime;
    },
    getArea: () => "JU00",
    getWorldId: () => "yamanose",
    createContext: ({ cutscene, program }) => ({
      marker: `${cutscene.id}:${program.id}`,
    }),
    onComplete: cutsceneId => completed.push(cutsceneId),
    onStopped: (reason, cutsceneId) => stopped.push([reason, cutsceneId]),
    ...overrides,
  });
  return {
    completed,
    native,
    resolveCount: () => resolveCount,
    runtime,
    stopped,
  };
}

test("native program cutscene resolves lazily and subscribes before starting", async () => {
  const native = nativeRuntimeHarness({
    startResult: { status: "completed" },
    onStart(runtime) {
      runtime.settle("completed", {
        status: "completed",
        programId: PROGRAM.id,
        entryFunction: CUTSCENE.program.entryFunction,
      });
    },
  });
  const context = playbackHarness({ native });

  assert.equal(context.resolveCount(), 0);
  assert.equal(await context.runtime.start(CUTSCENE), true);

  assert.equal(context.resolveCount(), 1);
  assert.deepEqual(native.calls.map(([kind]) => kind), [
    "program",
    "subscribe",
    "start",
    "unsubscribe",
  ]);
  assert.deepEqual(native.calls[2][1], {
    programId: PROGRAM.id,
    entryFunction: "0x2aa70",
    area: "JU00",
    context: { marker: `${CUTSCENE.id}:${PROGRAM.id}` },
  });
  assert.deepEqual(context.completed, [CUTSCENE.id]);
  assert.deepEqual(context.stopped, []);
  assert.equal(context.runtime.active, false);
  assert.deepEqual(context.runtime.transportState(), { active: false });

  native.runtime.settle("completed", { status: "completed" });
  assert.deepEqual(context.completed, [CUTSCENE.id]);
});

test("native program cutscene exposes conservative transport while active", async () => {
  const context = playbackHarness();

  assert.equal(await context.runtime.start(CUTSCENE), true);
  assert.equal(context.runtime.active, true);
  assert.deepEqual(context.runtime.transportState(), {
    active: true,
    paused: false,
    seeking: false,
  });
  assert.equal(context.runtime.setPaused(true), false);
  assert.equal(context.runtime.seekBySeconds(5), true);
  assert.deepEqual(
    context.native.calls.filter(([kind]) => kind === "seek"),
    [["seek", 5]],
  );
  assert.equal(context.runtime.update(1 / 30), false);

  context.native.runtime.settle("completed", {
    status: "completed",
    programId: PROGRAM.id,
    entryFunction: CUTSCENE.program.entryFunction,
  });
  assert.deepEqual(context.completed, [CUTSCENE.id]);
  assert.equal(context.runtime.active, false);
});

test("stopping a native program cutscene cancels and cleans up exactly once", async () => {
  const context = playbackHarness();
  await context.runtime.start(CUTSCENE);

  assert.equal(context.runtime.stop("user-exit"), true);
  assert.equal(context.runtime.stop("duplicate-exit"), false);
  assert.deepEqual(context.stopped, [["user-exit", CUTSCENE.id]]);
  assert.equal(context.native.listeners.size, 0);
  assert.deepEqual(
    context.native.calls.filter(([kind]) => kind === "cancel"),
    [["cancel", "user-exit"]],
  );
});

test("native program failures preserve their settlement reason", async () => {
  const context = playbackHarness();
  await context.runtime.start(CUTSCENE);
  const reason = {
    kind: "native-operation-unresolved",
    semanticId: "scene-object-state",
  };

  context.native.runtime.settle("stopped", {
    status: "stopped",
    reason,
    programId: PROGRAM.id,
    entryFunction: CUTSCENE.program.entryFunction,
  });

  assert.deepEqual(context.stopped, [[reason, CUTSCENE.id]]);
  assert.equal(context.runtime.active, false);
  assert.equal(context.native.listeners.size, 0);
});

test("direct start results settle ownership when no notification is emitted", async () => {
  const failed = playbackHarness({
    native: nativeRuntimeHarness({
      startResult: {
        status: "stopped",
        reason: { kind: "scripted-event-already-running" },
      },
    }),
  });
  await assert.rejects(
    failed.runtime.start(CUTSCENE),
    /scripted-event-already-running/,
  );
  assert.deepEqual(failed.stopped, [[
    { kind: "scripted-event-already-running" },
    CUTSCENE.id,
  ]]);
  assert.equal(failed.runtime.active, false);

  const completed = playbackHarness({
    native: nativeRuntimeHarness({ startResult: { status: "completed" } }),
  });
  assert.equal(await completed.runtime.start(CUTSCENE), true);
  assert.deepEqual(completed.completed, [CUTSCENE.id]);
  assert.equal(completed.runtime.active, false);
});

test("native program start errors retain nested child-coroutine operation causes", async () => {
  const context = playbackHarness({
    native: nativeRuntimeHarness({
      startResult: {
        status: "stopped",
        reason: "scripted-child-coroutine-stopped",
        result: {
          status: "stopped",
          reason: "child-coroutine-stopped",
          result: {
            status: "stopped",
            reason: {
              kind: "operation-stopped",
              semanticId: "resolved-object-runtime-flag",
              detail: "native object record is unavailable",
            },
          },
        },
      },
    }),
  });
  await assert.rejects(
    context.runtime.start(CUTSCENE),
    /resolved-object-runtime-flag:native object record is unavailable/,
  );
});

test("native program cutscenes reject mismatched world, area, and entries", async () => {
  const inactiveWorld = playbackHarness({ getWorldId: () => "dobuita" });
  await assert.rejects(
    inactiveWorld.runtime.start(CUTSCENE),
    /world yamanose is not active/,
  );
  assert.equal(inactiveWorld.resolveCount(), 0);

  const mismatchedDescriptorWorld = playbackHarness();
  await assert.rejects(
    mismatchedDescriptorWorld.runtime.start({
      ...CUTSCENE,
      program: { ...CUTSCENE.program, worldId: "dobuita" },
    }),
    /native program world does not match/,
  );
  assert.equal(mismatchedDescriptorWorld.resolveCount(), 0);

  const inactiveArea = playbackHarness({ getArea: () => "D000" });
  await assert.rejects(
    inactiveArea.runtime.start(CUTSCENE),
    /native area JU00 is not active/,
  );

  const mismatchedDescriptorArea = playbackHarness();
  await assert.rejects(
    mismatchedDescriptorArea.runtime.start({
      ...CUTSCENE,
      program: { ...CUTSCENE.program, area: "D000" },
    }),
    /native program area does not match/,
  );

  const unknownEntry = playbackHarness();
  await assert.rejects(
    unknownEntry.runtime.start({
      ...CUTSCENE,
      program: { ...CUTSCENE.program, entryFunction: "0xdeadbeef" },
    }),
    /entry 0xdeadbeef is not reviewed/,
  );
});

test("native program cutscenes temporarily activate their reviewed native area", async () => {
  let area = "D000";
  const areaChanges = [];
  const context = playbackHarness({
    getArea: () => area,
    activateArea: nextArea => {
      areaChanges.push(nextArea);
      area = nextArea;
      return true;
    },
    restoreArea: previousArea => {
      areaChanges.push(previousArea);
      area = previousArea;
      return true;
    },
  });

  await context.runtime.start(CUTSCENE);
  assert.equal(area, "JU00");
  assert.deepEqual(areaChanges, ["JU00"]);

  context.native.runtime.settle("completed", {
    status: "completed",
    programId: PROGRAM.id,
    entryFunction: CUTSCENE.program.entryFunction,
  });
  assert.equal(area, "D000");
  assert.deepEqual(areaChanges, ["JU00", "D000"]);
});

test("a thrown native start failure stops ownership and remains observable", async () => {
  const error = new Error("execution factory failed");
  const context = playbackHarness({
    native: nativeRuntimeHarness({ startError: error }),
  });

  await assert.rejects(context.runtime.start(CUTSCENE), error);
  assert.deepEqual(context.stopped, [[error, CUTSCENE.id]]);
  assert.equal(context.runtime.active, false);
  assert.equal(context.native.listeners.size, 0);
});

test("stopping asynchronous context preparation cannot launch an orphan program", async () => {
  let resolveContext;
  const contextReady = new Promise((resolve) => {
    resolveContext = resolve;
  });
  let preparationStarted;
  const preparing = new Promise((resolve) => {
    preparationStarted = resolve;
  });
  const context = playbackHarness({
    createContext: async () => {
      preparationStarted();
      return contextReady;
    },
  });

  const starting = context.runtime.start(CUTSCENE);
  await preparing;
  assert.equal(context.runtime.active, true);
  assert.equal(context.runtime.stop("world-change"), true);
  resolveContext({ marker: "late-context" });

  assert.equal(await starting, false);
  assert.deepEqual(context.stopped, [["world-change", CUTSCENE.id]]);
  assert.deepEqual(
    context.native.calls.filter(([kind]) => kind === "start"),
    [],
  );
  assert.deepEqual(
    context.native.calls.filter(([kind]) => kind === "cancel"),
    [],
  );
  assert.equal(context.native.listeners.size, 0);
});

test("program settlement ignores notifications from another native event", async () => {
  const context = playbackHarness();
  await context.runtime.start(CUTSCENE);

  context.native.runtime.settle("completed", {
    status: "completed",
    programId: "another-program",
    entryFunction: "0xdeadbeef",
  });
  assert.equal(context.runtime.active, true);
  assert.deepEqual(context.completed, []);

  context.native.runtime.settle("completed", {
    status: "completed",
    programId: PROGRAM.id,
    entryFunction: CUTSCENE.program.entryFunction,
  });
  assert.equal(context.runtime.active, false);
  assert.deepEqual(context.completed, [CUTSCENE.id]);
});

test("compiled entry invocation fields are authoritative runtime inputs", async () => {
  const native = nativeRuntimeHarness();
  const resolveProgram = native.runtime.program;
  native.runtime.program = (programId) => {
    const program = resolveProgram(programId);
    return program ? {
      ...program,
      entryInvocation: {
        initialFrameFields: { 12: 0x52494b41 },
      },
    } : null;
  };
  const context = playbackHarness({
    native,
    createContext: () => ({
      marker: "package-context",
      initialFrameFields: { 12: 0 },
    }),
  });

  await context.runtime.start(CUTSCENE);

  const start = context.native.calls.find(([kind]) => kind === "start");
  assert.deepEqual(start[1].context, {
    marker: "package-context",
    initialFrameFields: { 12: 0x52494b41 },
  });
});

test("subscription cleanup failure cannot suppress terminal handoff", async () => {
  const native = nativeRuntimeHarness();
  const cleanupError = new Error("subscription registry unavailable");
  const subscribe = native.runtime.onSettled;
  native.runtime.onSettled = (listener) => {
    subscribe(listener);
    return () => {
      throw cleanupError;
    };
  };
  const stopped = [];
  const logged = [];
  const originalError = console.error;
  console.error = (...detail) => logged.push(detail);
  try {
    const context = playbackHarness({
      native,
      onStopped: (reason, cutsceneId) => stopped.push([reason, cutsceneId]),
    });
    await context.runtime.start(CUTSCENE);

    assert.equal(context.runtime.stop("world-change"), true);
    assert.equal(context.runtime.active, false);
    assert.deepEqual(stopped, [["world-change", CUTSCENE.id]]);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1], cleanupError);
  } finally {
    console.error = originalError;
  }
});
