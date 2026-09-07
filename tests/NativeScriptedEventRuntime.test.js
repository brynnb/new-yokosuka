import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeDialogueInteractionRuntime,
} from "../play/dialogue/NativeDialogueInteractionRuntime.js";
import {
  createNativeDialogueState,
} from "../play/dialogue/NativeDialogueState.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";

const pack = JSON.parse(readFileSync(new URL(
  "../play/data/events/nativeEventPrograms.generated.json",
  import.meta.url,
)));
const presentationPack = structuredClone(pack);
const hatoPresentationRoute = presentationPack.programs
  .find(program => program.id === "disc1-d000-entry-0x7abf4")
  .scriptedInteractions.find(interaction => interaction.actorCode === "HATO");
hatoPresentationRoute.entryFunction = (
  hatoPresentationRoute.dialogueEntryFunction
);

function gateContext(overrides = {}) {
  return {
    dialogueState: createNativeDialogueState(),
    gameDate: new Date("1986-01-01T12:00:00Z"),
    playerPosition: {
      x: 119.13939666748047,
      y: 0,
      z: 79.6144027709961,
    },
    playerYaw: -9375 * Math.PI * 2 / 0x10000,
    ...overrides,
  };
}

test("scripted event runtime starts an exact reviewed program entry directly", async () => {
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
  });
  const program = presentationPack.programs.find(
    value => value.id === "disc1-d000-entry-0x7abf4",
  );

  const result = await runtime.startProgram({
    programId: program.id,
    entryFunction: program.entryFunction,
    area: "D000",
    context: gateContext(),
  });

  assert.notEqual(result.reason?.kind, "scripted-event-program-missing");
  assert.notEqual(result.reason?.kind, "scripted-event-entry-missing");
  runtime.cancel("test-complete");
});

test("scripted event runtime rejects unknown direct entries and area mismatches", async () => {
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
  });
  assert.deepEqual(await runtime.startProgram({ programId: "missing" }), {
    status: "stopped",
    reason: {
      kind: "scripted-event-program-missing",
      programId: "missing",
    },
  });
  assert.equal((await runtime.startProgram({
    programId: "disc1-d000-entry-0x7abf4",
    entryFunction: "0xdeadbeef",
  })).reason.kind, "scripted-event-entry-missing");
  assert.equal((await runtime.startProgram({
    programId: "disc1-d000-entry-0x7abf4",
    area: "JU00",
  })).reason.kind, "scripted-event-area-mismatch");
});

test("scripted event runtime yields presentation then commits native state", async () => {
  const actorByteState = createNativeActorByteState({ HATO: 7 });
  const requests = [];
  const completions = [];
  const starts = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
    onStarted(identity) {
      starts.push(identity);
    },
    onDialogueRequest(request) {
      requests.push(request);
    },
    onComplete(result) {
      completions.push(result);
    },
  });

  assert.equal(runtime.hasInteraction("D000", "HATO"), true);
  const yielded = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    sceneActor: { id: "HATO:one", actorCode: "HATO" },
    context: gateContext(),
  });
  assert.equal(yielded.status, "yielded");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].kind, "native");
  assert.equal(starts[0].area, "D000");
  assert.equal(starts[0].programId, "disc1-d000-entry-0x7abf4");
  assert.equal(starts[0].interactionEntryFunction, "0x7fa98");
  assert.equal(starts[0].actorCode, "HATO");
  assert.deepEqual(requests[0], {
    kind: "dialogue",
    actorCode: "HATO",
    voiceIds: ["F1030B001"],
    resourcePointer: 0xb0f48,
    source: {
      functionFileOffset: "0x7fa98",
      callFileOffset: "0x7faae",
    },
    sceneActor: { id: "HATO:one", actorCode: "HATO" },
    programId: "disc1-d000-entry-0x7abf4",
    entryFunction: "0x7fa98",
  });
  assert.equal(actorByteState.read("HATO"), 7);

  const completed = await runtime.resumeDialogue();
  assert.equal(completed.status, "completed");
  assert.equal(completed.actorCode, "HATO");
  assert.equal(actorByteState.read("HATO"), 8);
  assert.equal(completions.length, 1);
});

test("scripted event cancellation discards deferred native state", async () => {
  const actorByteState = createNativeActorByteState({ HATO: 9 });
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
  });
  await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(runtime.cancel("player-cancelled"), true);
  assert.equal(actorByteState.read("HATO"), 9);
  assert.equal(runtime.status, "idle");
});

test("scripted event execution scope commits only after authored completion", async () => {
  const lifecycle = [];
  const actorByteState = createNativeActorByteState({ HATO: 3 });
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
    createExecution: ({ actorCode }) => ({
      context: { executionMarker: actorCode },
      handlers: {},
      commit: () => lifecycle.push("commit"),
      rollback: () => lifecycle.push("rollback"),
    }),
  });

  await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.deepEqual(lifecycle, []);
  assert.equal(actorByteState.read("HATO"), 3);

  const completed = await runtime.resumeDialogue();
  assert.equal(completed.status, "completed");
  assert.deepEqual(lifecycle, ["commit"]);
  assert.equal(actorByteState.read("HATO"), 4);
});

test("scripted execution receives its program, gate, and dialogue-frame updates", async () => {
  const updates = [];
  let executionDetail;
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
    createExecution: detail => {
      executionDetail = detail;
      return {
        context: {},
        handlers: {},
        update: update => updates.push(update),
      };
    },
  });

  const started = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(started.status, "yielded");
  assert.equal(executionDetail.program.id, "disc1-d000-entry-0x7abf4");
  assert.equal(executionDetail.gate.matched, true);
  assert.deepEqual(
    executionDetail.gate.nativePosition,
    [-119.13939666748047, 0, 79.6144027709961],
  );
  assert.equal(runtime.update(0.25), true);
  assert.deepEqual(updates, [{
    deltaSeconds: 0.25,
    status: "dialogue",
  }]);
  runtime.cancel("test-complete");
});

test("synchronous execution scope is cancellable before start returns", async () => {
  const actorByteState = createNativeActorByteState();
  let rolledBack = 0;
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
    createExecution: () => ({
      context: {},
      handlers: {},
      rollback: () => {
        rolledBack += 1;
      },
    }),
  });

  const started = runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.notEqual(runtime.current, null);
  assert.equal(runtime.cancel("world-change"), true);
  assert.equal(rolledBack, 1);
  await started;
});

test("asynchronous execution preparation reserves ownership and rolls back after cancellation", async () => {
  let resolveExecution;
  let preparationStarted;
  const executionReady = new Promise((resolve) => {
    resolveExecution = resolve;
  });
  const preparing = new Promise((resolve) => {
    preparationStarted = resolve;
  });
  const lifecycle = [];
  const starts = [];
  const settlements = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
    createExecution: async () => {
      preparationStarted();
      return executionReady;
    },
    onStarted: detail => starts.push(detail),
  });
  runtime.onSettled(settlement => settlements.push(settlement));

  const starting = runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  await preparing;
  assert.equal(runtime.status, "preparing");
  assert.equal(runtime.current, null);

  const competing = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(competing.reason.kind, "scripted-event-already-running");
  assert.equal(runtime.cancel("world-change"), true);
  assert.equal(runtime.cancel("duplicate"), false);
  assert.equal(runtime.status, "stopping");
  const replacementBeforeCleanup = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(
    replacementBeforeCleanup.reason.kind,
    "scripted-event-already-running",
  );

  resolveExecution({
    context: {},
    handlers: {},
    rollback: detail => lifecycle.push(detail.reason),
  });
  const cancelled = await starting;

  assert.deepEqual(cancelled, {
    status: "cancelled",
    reason: "world-change",
    programId: "disc1-d000-entry-0x7abf4",
    entryFunction: hatoPresentationRoute.entryFunction,
    actorCode: "HATO",
  });
  assert.deepEqual(lifecycle, [{
    kind: "cancelled",
    reason: "world-change",
  }]);
  assert.deepEqual(starts, []);
  assert.equal(runtime.status, "idle");
  assert.equal(runtime.current, null);
  assert.deepEqual(settlements, [{
    kind: "cancelled",
    result: cancelled,
  }]);
});

test("execution preparation adapter failures release and roll back ownership", async () => {
  const lifecycle = [];
  const failure = new Error("event context unavailable");
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
    createExecution: () => ({
      handlers: {},
      rollback: detail => lifecycle.push(detail.reason),
    }),
    createContext: () => {
      throw failure;
    },
  });

  const stopped = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });

  assert.equal(stopped.reason.kind, "native-event-context-factory-failed");
  assert.equal(stopped.reason.message, failure.message);
  assert.deepEqual(lifecycle, [{
    kind: "native-event-context-factory-failed",
    message: failure.message,
  }]);
  assert.equal(runtime.status, "idle");
  assert.equal(runtime.pendingStart, null);
  assert.equal(runtime.current, null);
});

test("interpreter preparation failures release and roll back execution ownership", async () => {
  const lifecycle = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
    maxSteps: 0,
    createExecution: () => ({
      context: {},
      handlers: {},
      rollback: detail => lifecycle.push(detail.reason),
    }),
  });

  const stopped = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });

  assert.equal(stopped.reason.kind, "native-event-runtime-preparation-failed");
  assert.match(stopped.reason.message, /step limit must be positive/);
  assert.deepEqual(lifecycle, [{
    kind: "native-event-runtime-preparation-failed",
    message: stopped.reason.message,
  }]);
  assert.equal(runtime.status, "idle");
  assert.equal(runtime.pendingStart, null);
  assert.equal(runtime.current, null);
});

test("scripted event execution scope rolls back cancellation exactly once", async () => {
  const lifecycle = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
    createExecution: () => ({
      context: {},
      handlers: {},
      rollback: detail => lifecycle.push(detail.reason),
    }),
  });

  await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(runtime.cancel("world-changed"), true);
  assert.equal(runtime.cancel("duplicate"), false);
  assert.deepEqual(lifecycle, [{
    kind: "cancelled",
    reason: "world-changed",
  }]);
});

test("failed execution commit rolls back and preserves deferred state", async () => {
  const lifecycle = [];
  const settlements = [];
  const actorByteState = createNativeActorByteState({ HATO: 11 });
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
    createExecution: () => ({
      context: {},
      handlers: {},
      commit() {
        lifecycle.push("commit");
        throw new Error("room commit rejected");
      },
      rollback: () => lifecycle.push("rollback"),
    }),
  });
  runtime.onSettled(settlement => settlements.push(settlement));

  await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  const stopped = await runtime.resumeDialogue();
  assert.equal(stopped.status, "stopped");
  assert.equal(
    stopped.reason.kind,
    "native-event-execution-commit-failed",
  );
  assert.deepEqual(lifecycle, ["commit", "rollback"]);
  assert.equal(actorByteState.read("HATO"), 11);
  assert.deepEqual(settlements, [{
    kind: "stopped",
    result: stopped,
  }]);
  assert.equal(stopped.programId, "disc1-d000-entry-0x7abf4");
  assert.equal(stopped.entryFunction, hatoPresentationRoute.entryFunction);
  assert.equal(stopped.actorCode, "HATO");
});

test("terminal callback failures cannot suppress exact settlement", async () => {
  const callbackError = new Error("client persistence unavailable");
  const settlements = [];
  const logged = [];
  const originalError = console.error;
  console.error = (...detail) => logged.push(detail);
  try {
    const runtime = createNativeScriptedEventRuntime({
      programPack: presentationPack,
      actorByteState: createNativeActorByteState(),
      createExecution: () => ({ context: {}, handlers: {} }),
      onComplete: () => {
        throw callbackError;
      },
    });
    runtime.onSettled(settlement => settlements.push(settlement));

    const yielded = await runtime.startActorInteraction({
      area: "D000",
      actorCode: "HATO",
      context: gateContext(),
    });
    assert.equal(yielded.status, "yielded");
    const result = await runtime.resumeDialogue();

    assert.equal(result.status, "completed");
    assert.deepEqual(settlements, [{ kind: "completed", result }]);
    assert.equal(runtime.current, null);
    assert.equal(runtime.status, "complete");
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1], callbackError);
  } finally {
    console.error = originalError;
  }
});

test("scripted event runtime fails closed outside declared routes", async () => {
  const runtime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState: createNativeActorByteState(),
  });
  assert.deepEqual(await runtime.startActorInteraction({
    area: "D000",
    actorCode: "AKIR",
  }), {
    status: "stopped",
    reason: {
      kind: "scripted-interaction-route-missing",
      area: "D000",
      actorCode: "AKIR",
    },
  });
});

test("scripted object routes are distinct and require their exact action", () => {
  const runtime = createNativeScriptedEventRuntime({
    programPack: pack,
    actorByteState: createNativeActorByteState(),
  });
  assert.equal(runtime.hasInteraction("D000", "AKIR"), false);
  assert.equal(runtime.hasObjectInteraction("D000", "TBK1"), true);
  assert.deepEqual(runtime.evaluateObjectInteraction({
    area: "D000",
    objectTag: "TBK1",
    context: {
      selectedObjectTag: "TBK1",
      selectedObjectAction: 1,
    },
  }), {
    resolved: true,
    matched: true,
    reason: null,
    objectTag: "TBK1",
    action: 1,
    actorCode: "AKIR",
    programId: "disc1-d000-phone-book-0x6a49c",
    entryFunction: "0x6a49c",
    roomControllerId: "disc1-d000-primary-interaction-owner",
  });
});

test("scripted event runtime does not bypass its extracted gate", async () => {
  const runtime = createNativeScriptedEventRuntime({
    programPack: pack,
    actorByteState: createNativeActorByteState(),
  });
  const result = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext({
      gameDate: new Date("1986-01-01T20:00:00Z"),
    }),
  });
  assert.deepEqual(result, {
    status: "not-matched",
    reason: "scripted-gate-hour",
    programId: "disc1-d000-entry-0x7abf4",
    entryFunction: "0x8002c",
    actorCode: "HATO",
  });
  assert.equal(runtime.status, "idle");
});

test("exact event yield flows through dialogue presentation before resume", async () => {
  let now = 100;
  const actorByteState = createNativeActorByteState({ HATO: 2 });
  const messages = [];
  let eventRuntime;
  const interactionRuntime = createNativeDialogueInteractionRuntime({
    now: () => now,
    onMessageStart(message) {
      messages.push(message.voiceId);
    },
    onComplete(detail) {
      if (detail.kind === "session") void eventRuntime.resumeDialogue();
    },
  });
  eventRuntime = createNativeScriptedEventRuntime({
    programPack: presentationPack,
    actorByteState,
    onDialogueRequest(request) {
      return interactionRuntime.start({
        kind: "scripted",
        actorCode: request.actorCode,
        voiceIds: request.voiceIds,
        source: request.source,
      });
    },
  });

  const yielded = await eventRuntime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(yielded.status, "yielded");
  assert.deepEqual(messages, ["F1030B001"]);
  assert.equal(actorByteState.read("HATO"), 2);

  now += 5000;
  assert.equal(interactionRuntime.update(), true);
  await interactionRuntime.pending;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(eventRuntime.status, "complete");
  assert.equal(actorByteState.read("HATO"), 3);
});

test("scripted runtime resumes a proven scheduler continuation on update", async () => {
  const activation = pack.programs[0].scriptedInteractions[0].activation;
  const schedulerPack = {
    schema: "new-yokosuka-native-event-program-pack-v1",
    programs: [{
      id: "scheduler-test",
      area: "D000",
      entryFunction: "0x100",
      scriptedInteractions: [{
        actorCode: "HATO",
        entryFunction: "0x100",
        activation,
      }],
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            kind: "runtimeInterfaceCall",
            callFileOffset: "0x104",
            runtimeCallKind: "resumable-scheduler-dispatch",
            behaviorStatus: "proven",
            semanticId: "native-scheduler-countdown",
            runtimeDispatch: {
              selector: 0,
              argumentCount: 1,
              arguments: [{ kind: "constant", value: 1 }],
            },
            resultBitTest: {
              kind: "runtimeResultBit",
              mask: 0x00010000,
              resolvedBranch: {
                branchFileOffset: "0x114",
                comparisonTrueSuccessor: "0x130",
                comparisonFalseSuccessor: "0x120",
              },
            },
          }],
          successors: ["0x110"],
        }, {
          id: "0x110",
          endFileOffsetExclusive: "0x116",
          actions: [],
          terminator: { fileOffset: "0x114", mnemonic: "bf" },
          successors: ["0x130", "0x120"],
        }, {
          id: "0x120",
          endFileOffsetExclusive: "0x128",
          actions: [{
            kind: "coroutineContinuationTransfer",
            callFileOffset: "0x122",
            semanticId: "native-coroutine-save-continuation",
          }],
          successors: ["0x130"],
        }, {
          id: "0x130",
          endFileOffsetExclusive: "0x138",
          actions: [],
          successors: [],
        }],
      }],
    }],
  };
  let executionUpdates = 0;
  const runtime = createNativeScriptedEventRuntime({
    programPack: schedulerPack,
    actorByteState: createNativeActorByteState(),
    createExecution: () => ({
      context: {},
      handlers: {},
      update: () => {
        executionUpdates += 1;
      },
    }),
  });
  const first = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(first.status, "yielded");
  assert.equal(runtime.status, "continuation");
  assert.equal(runtime.update(), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.status, "complete");
  assert.equal(executionUpdates, 1);
});

test("scripted runtime seeks an active continuation through bounded clock updates", async () => {
  const activation = pack.programs[0].scriptedInteractions[0].activation;
  const schedulerPack = {
    schema: "new-yokosuka-native-event-program-pack-v1",
    programs: [{
      id: "scheduler-seek-test",
      area: "D000",
      entryFunction: "0x100",
      scriptedInteractions: [{
        actorCode: "HATO",
        entryFunction: "0x100",
        activation,
      }],
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            kind: "runtimeInterfaceCall",
            callFileOffset: "0x104",
            runtimeCallKind: "resumable-scheduler-dispatch",
            behaviorStatus: "proven",
            semanticId: "native-scheduler-countdown",
            runtimeDispatch: {
              selector: 0,
              argumentCount: 1,
              arguments: [{ kind: "constant", value: 1 }],
            },
            resultBitTest: {
              kind: "runtimeResultBit",
              mask: 0x00010000,
              resolvedBranch: {
                branchFileOffset: "0x114",
                comparisonTrueSuccessor: "0x130",
                comparisonFalseSuccessor: "0x120",
              },
            },
          }],
          successors: ["0x110"],
        }, {
          id: "0x110",
          endFileOffsetExclusive: "0x116",
          actions: [],
          terminator: { fileOffset: "0x114", mnemonic: "bf" },
          successors: ["0x130", "0x120"],
        }, {
          id: "0x120",
          endFileOffsetExclusive: "0x128",
          actions: [{
            kind: "coroutineContinuationTransfer",
            callFileOffset: "0x122",
            semanticId: "native-coroutine-save-continuation",
          }],
          successors: ["0x130"],
        }, {
          id: "0x130",
          endFileOffsetExclusive: "0x138",
          actions: [],
          successors: [],
        }],
      }],
    }],
  };
  const deltas = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: schedulerPack,
    actorByteState: createNativeActorByteState(),
    createExecution: () => ({
      context: {},
      handlers: {},
      update: ({ deltaSeconds }) => deltas.push(deltaSeconds),
    }),
  });
  const first = await runtime.startActorInteraction({
    area: "D000",
    actorCode: "HATO",
    context: gateContext(),
  });
  assert.equal(first.status, "yielded");
  assert.equal(runtime.seekBySeconds(5), true);
  assert.equal(deltas.length, 20);
  assert.ok(deltas.every(delta => delta > 0 && delta <= 0.25));
  assert.ok(Math.abs(deltas.reduce((sum, delta) => sum + delta, 0) - 5) < 1e-9);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.status, "complete");
});

test("automatic events execute their exact gate before transactional control", async () => {
  const automaticPack = {
    schema: "new-yokosuka-native-event-program-pack-v1",
    programs: [{
      id: "automatic-test",
      area: "D000",
      entryFunction: "0x200",
      scriptedInteractions: [],
      automaticEvents: [{
        id: "selector-18",
        actorCode: "TONY",
        gateEntryFunction: "0x100",
        matchedReturnValue: 18,
        entryFunction: "0x200",
        dialogueEntryFunction: "0x200",
        voiceIds: ["E0000A001"],
      }],
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        returnValue: {
          kind: "frame-field",
          offset: 3,
          width: 1,
          signedLoad: true,
        },
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            kind: "frameFieldWrite",
            callFileOffset: "0x104",
            offset: 3,
            width: 1,
            value: 18,
          }],
          successors: [],
        }],
      }, {
        id: "0x200",
        entryBlock: "0x200",
        dialogueRegion: {
          actorTags: ["TONY"],
          voiceIds: ["E0000A001"],
        },
        blocks: [{
          id: "0x200",
          endFileOffsetExclusive: "0x210",
          actions: [{
            kind: "engineOperation",
            callFileOffset: "0x204",
            semanticId: "dialogue-start",
            adapterStatus: "proven",
            arguments: [{ kind: "static-pointer", value: 0x300 }],
          }],
          successors: [],
        }],
      }],
    }],
  };
  const lifecycle = [];
  const requests = [];
  const runtime = createNativeScriptedEventRuntime({
    programPack: automaticPack,
    actorByteState: createNativeActorByteState(),
    createProbe: () => ({ context: {}, handlers: {} }),
    createExecution: detail => {
      lifecycle.push({
        kind: "begin",
        gate: detail.gate,
        route: detail.route.id,
      });
      return {
        context: {},
        handlers: {},
        commit: () => lifecycle.push({ kind: "commit" }),
      };
    },
    onDialogueRequest: request => requests.push(request),
  });
  assert.equal(runtime.hasAutomaticEvents("D000"), true);
  const yielded = await runtime.pollAutomaticEvents({ area: "D000" });
  assert.equal(yielded.status, "yielded");
  assert.equal(requests[0].actorCode, "TONY");
  assert.equal(requests[0].entryFunction, "0x200");
  assert.deepEqual(lifecycle[0], {
    kind: "begin",
    gate: {
      resolved: true,
      matched: true,
      reason: null,
      nativeReturnValue: 18,
      gateEntryFunction: "0x100",
    },
    route: "selector-18",
  });
  assert.equal((await runtime.resumeDialogue()).status, "completed");
  assert.deepEqual(lifecycle.at(-1), { kind: "commit" });
});

test("automatic events do not begin execution when the exact gate misses", async () => {
  const automaticPack = {
    schema: "new-yokosuka-native-event-program-pack-v1",
    programs: [{
      id: "automatic-miss",
      area: "D000",
      automaticEvents: [{
        id: "selector-18",
        actorCode: "TONY",
        gateEntryFunction: "0x100",
        matchedReturnValue: 18,
        entryFunction: "0x200",
      }],
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        returnValue: {
          kind: "frame-field",
          offset: 3,
          width: 1,
          signedLoad: true,
        },
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            kind: "frameFieldWrite",
            callFileOffset: "0x104",
            offset: 3,
            width: 1,
            value: 0xff,
          }],
          successors: [],
        }],
      }, {
        id: "0x200",
        entryBlock: "0x200",
        blocks: [{
          id: "0x200",
          endFileOffsetExclusive: "0x210",
          actions: [],
          successors: [],
        }],
      }],
    }],
  };
  let executions = 0;
  const runtime = createNativeScriptedEventRuntime({
    programPack: automaticPack,
    actorByteState: createNativeActorByteState(),
    createExecution: () => {
      executions += 1;
      return {};
    },
  });
  assert.deepEqual(await runtime.pollAutomaticEvents({ area: "D000" }), {
    status: "not-matched",
    reason: "automatic-event-gate",
    area: "D000",
  });
  assert.equal(executions, 0);
  assert.equal(runtime.status, "idle");
});
