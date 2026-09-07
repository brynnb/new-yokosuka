import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueInteractionRuntime,
} from "../play/dialogue/NativeDialogueInteractionRuntime.js";
import {
  NATIVE_DIALOGUE_ACTOR_RUNTIME,
} from "../play/data/dialogue/nativeActorRuntime.generated.js";

function fakeSession(results) {
  return {
    descriptor: {
      participantFacingTargets: [[1, 1.5, 2]],
      participantFourccs: ["AKIR", "INE_"],
    },
    start() {
      return {
        status: "started",
        actorCode: "INE_",
        actor: { participantFacingTargets: [[1, 1.5, 2]] },
      };
    },
    async next() {
      return results.shift() ?? { status: "complete" };
    },
  };
}

function messageGroup() {
  const message = {
    voiceId: "F0000B001",
    nativeParticipantCode: "INE_",
  };
  return {
    status: "messageGroup",
    actor: {
      actorCode: "INE_",
      participantFacingTargets: [[1, 1.5, 2]],
    },
    participants: ["AKIR", "INE_"],
    messages: [message],
    presentation: {
      nativeDurationSeconds: 1,
      commands: [
        {
          kind: "nativeCommand",
          commandWord: 0x14,
          nativeTimeSeconds: 0,
          nativeReceiver: { path: "queued" },
        },
        {
          kind: "nativeCommand",
          commandWord: 0x32,
          nativeTimeSeconds: 0,
          nativeReceiver: { path: "queued" },
        },
        {
          kind: "message",
          nativeTimeSeconds: 0,
          message,
        },
      ],
    },
  };
}

test("interaction runtime executes timed groups before session completion", async () => {
  let now = 100;
  const events = [];
  const runtime = createNativeDialogueInteractionRuntime({
    now: () => now,
    sessionFactory: () => fakeSession([
      messageGroup(),
      { status: "complete", actorCode: "INE_" },
    ]),
    onMessageStart(message) {
      events.push(["messageStart", message.voiceId]);
    },
    onMessageEnd(message, detail) {
      events.push(["messageEnd", message.voiceId, detail.reason]);
    },
    onNativeCommand(dispatch) {
      events.push([
        "command",
        dispatch.command.commandWord,
        dispatch.actor?.actorCode ?? null,
        dispatch.facingTarget?.index ?? null,
        dispatch.participantRoute?.participantCode ?? null,
      ]);
    },
    onComplete(detail) {
      events.push(["complete", detail.kind]);
    },
  });

  const first = await runtime.start({ actorCode: "INE_" });
  assert.equal(first.status, "messageGroup");
  assert.deepEqual(events, [
    ["command", 0x14, "INE_", 0, null],
    ["command", 0x32, "INE_", null, "INE_"],
    ["messageStart", "F0000B001"],
  ]);
  now = 1099;
  assert.equal(runtime.update(), false);
  now = 1100;
  assert.equal(runtime.update(), true);
  await runtime.pending;
  assert.deepEqual(events.slice(-3), [
    ["messageEnd", "F0000B001", "nativeDeadline"],
    ["complete", "messageGroup"],
    ["complete", "session"],
  ]);
  assert.equal(runtime.status, "complete");
});

test("interaction runtime advances a line without reversing its clock", async () => {
  let now = 100;
  const events = [];
  const runtime = createNativeDialogueInteractionRuntime({
    now: () => now,
    sessionFactory: () => fakeSession([
      messageGroup(),
      { status: "complete", actorCode: "INE_" },
    ]),
    onMessageStart(message) {
      events.push(["start", message.voiceId]);
    },
    onMessageEnd(message) {
      events.push(["end", message.voiceId]);
    },
  });

  await runtime.start({ actorCode: "INE_" });
  assert.equal(runtime.advance(), true);
  await runtime.pending;
  assert.deepEqual(events, [
    ["start", "F0000B001"],
    ["end", "F0000B001"],
  ]);
  assert.equal(runtime.status, "complete");

  now = 101;
  assert.equal(runtime.update(), false);
});

test("interaction runtime pauses at explicit native events", async () => {
  const observed = [];
  const runtime = createNativeDialogueInteractionRuntime({
    sessionFactory: () => fakeSession([
      {
        status: "event",
        event: { kind: "nativeEvent", opcode: 0xe1, recordOffset: 42 },
      },
      { status: "complete" },
    ]),
    onEvent(event) {
      observed.push(event);
    },
  });
  const event = await runtime.start({ actorCode: "INE_" });
  assert.equal(event.status, "event");
  assert.equal(runtime.status, "event");
  assert.deepEqual(observed, [{
    kind: "nativeEvent",
    opcode: 0xe1,
    recordOffset: 42,
  }]);
  const completed = await runtime.resumeEvent();
  assert.equal(completed.status, "complete");
  assert.equal(runtime.status, "complete");
});

test("interaction runtime executes native internal transitions without pausing", async () => {
  const observed = [];
  const runtime = createNativeDialogueInteractionRuntime({
    sessionFactory: () => fakeSession([
      {
        status: "event",
        event: { kind: "state5", recordOffset: 40 },
      },
      {
        status: "event",
        event: {
          kind: "invokeAndYield",
          encodedOperand: 0x32,
          recordOffset: 44,
        },
      },
      messageGroup(),
    ]),
    onInternalStateTransition(event) {
      observed.push(["transition", event.kind]);
    },
    onNativeCommand(dispatch) {
      observed.push([
        "command",
        dispatch.command.commandWord,
        dispatch.receiver?.path,
        dispatch.participantRoute?.participantCode,
      ]);
    },
  });

  const result = await runtime.start({ actorCode: "INE_" });
  assert.equal(result.status, "messageGroup");
  assert.deepEqual(observed.slice(0, 4), [
    ["transition", "state5"],
    ["command", 0x32, "queued", "INE_"],
    ["transition", "invokeAndYield"],
    ["command", 0x14, "queued", undefined],
  ]);
  assert.equal(runtime.status, "running");
  assert.equal(runtime.waitingEvent, null);
});

test("interaction runtime reports unresolved selection without starting", async () => {
  const unresolved = [];
  const runtime = createNativeDialogueInteractionRuntime({
    sessionFactory: () => ({
      start() {
        return {
          status: "unresolved",
          reasons: ["runtimeComponent:6:yen"],
        };
      },
    }),
    onUnresolved(result) {
      unresolved.push(result.reasons);
    },
  });
  const result = await runtime.start({ actorCode: "INE_" });
  assert.equal(result.status, "unresolved");
  assert.deepEqual(unresolved, [["runtimeComponent:6:yen"]]);
  assert.equal(runtime.status, "unresolved");
});

test("interaction runtime reaches authored dialogue across the actor corpus", async () => {
  const statusCounts = {};
  const context = {
    gameDate: new Date("1986-01-01T00:00:00Z"),
    yen: 0,
    currentMapIdentity: "NONE",
    playerPosition: [0, 0, 0],
    readStateBank() {
      return 0;
    },
    readRuntimeComponent() {
      return 0;
    },
    readActorRuntimeValue() {
      return 0;
    },
  };

  for (
    const actorCode of Object.keys(NATIVE_DIALOGUE_ACTOR_RUNTIME.resources)
  ) {
    const runtime = createNativeDialogueInteractionRuntime();
    const result = await runtime.start({
      actorCode,
      context,
      randomFloat: () => 0,
    });
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    runtime.stop("corpusTest");
  }

  assert.deepEqual(statusCounts, {
    complete: 2,
    messageGroup: 255,
  });
});
