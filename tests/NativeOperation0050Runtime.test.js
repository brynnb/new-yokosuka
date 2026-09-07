import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0050SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(mode, ...trailing) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-operation-0050-aseq-activity-control",
    arguments: [mode, ...trailing].map(value => ({
      kind: "constant",
      value: value >>> 0,
    })),
  };
}

function runtime(adapters = {}) {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 0,
      primaryPointer: 0xb138a,
      secondaryPointer: 0xb1391,
    }],
  });
  state.nativeOperation013eState.bind({
    slot: 0,
    primaryPointer: 0xb138a,
    secondaryPointer: 0xb1391,
  });
  return {
    state,
    context: createNativeSceneFieldRuntimeContext(state),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation0050SemanticHandlers(adapters),
    }),
  };
}

test("operation 0x0050 starts an exact installed activity and polls to zero", async () => {
  const updates = [];
  const stops = [];
  const { state, context, execute } = runtime({
    startActivity: async ({ slot, binding }) => {
      assert.equal(slot, 0);
      assert.deepEqual(binding, {
        primaryPointer: 0xb138a,
        secondaryPointer: 0xb1391,
      });
      return { activityId: "DRAUTH/SEQDATA1.AUTH", durationFrames: 2 };
    },
    stopActivity: async detail => {
      stops.push(detail);
      return true;
    },
  });

  const started = await execute(action(0), context);
  assert.equal(started.status, "continued");
  assert.deepEqual(state.readNativeOperation0050Activity(), {
    activityId: "DRAUTH/SEQDATA1.AUTH",
    slot: 0,
    durationFrames: 2,
    currentFrame: 0,
    stateByte: 1,
    delayedStopLatch: 0,
    word40: 0,
  });
  assert.equal((await execute(action(-7), context)).result, 0);
  assert.equal((await execute(action(-1), context)).result, 1);

  updates.push(state.advanceNativeOperation0050Activity());
  assert.equal((await execute(action(-1), context)).result, 1);
  updates.push(state.advanceNativeOperation0050Activity());
  assert.equal(state.advanceNativeOperation0050Activity(), null);
  assert.equal((await execute(action(-1), context)).result, 0);
  assert.equal(state.readNativeOperation0050Activity(), null);
  assert.equal((await execute(action(-7), context)).result, 0);
  assert.deepEqual(updates.map(update => update.currentFrame), [1, 2]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].reason, "complete");
});

test("operation 0x0050 fails closed for unbound slots and missing adapters", async () => {
  const { context, execute } = runtime();
  const unbound = await execute(action(1), context);
  assert.equal(unbound.status, "stopped");
  assert.equal(unbound.reason.kind, "native-operation-0050-contract-failed");
  assert.match(unbound.reason.message, /no installed AUTH resource/);

  const missing = await execute(action(0), context);
  assert.equal(missing.status, "stopped");
  assert.equal(missing.reason.kind, "native-operation-0050-contract-failed");
  assert.match(missing.reason.message, /adapter is unavailable/);
});

test("operation 0x0050 rejects unproved controls and invalid activity identity", async () => {
  let cleaned = false;
  const { context, execute } = runtime({
    startActivity: () => ({ durationFrames: 10 }),
    stopActivity: ({ reason }) => {
      cleaned = reason === "invalid-start";
      return true;
    },
  });
  const invalid = await execute(action(0), context);
  assert.equal(invalid.status, "stopped");
  assert.match(invalid.reason.message, /exact identity/);
  assert.equal(cleaned, true);

  const unproved = await execute(action(-2), context);
  assert.equal(unproved.status, "stopped");
  assert.equal(unproved.reason, "native-operation-0050-mode-unproved");
});

test("operation 0x0050 mode minus nine is the exact native no-op", async () => {
  const { state, context, execute } = runtime();
  const before = state.snapshot();
  assert.deepEqual(await execute(action(-9, 6, 0), context), {
    status: "continued",
  });
  assert.deepEqual(state.snapshot(), before);
});

test("operation 0x0050 exposes exact OP00 slot, latch, and stop controls", async () => {
  const stops = [];
  const { state, context, execute } = runtime({
    startActivity: () => ({
      activityId: "OP00/AUTH01/0114/00",
      durationFrames: 300,
    }),
    stopActivity: detail => {
      stops.push(detail);
      return true;
    },
  });

  assert.equal(state.nativeOperation0050State.readSlotWord10(0), 0);
  assert.deepEqual(await execute(action(-12, 0, 7), context), {
    status: "continued",
    mutation: { slot: 0, previous: 0, word10: 1 },
  });
  assert.equal(state.nativeOperation0050State.readSlotWord10(0), 1);
  assert.equal((await execute(action(-10), context)).result, 0);

  await execute(action(0), context);
  assert.equal((await execute(action(-10), context)).result, 0);
  assert.deepEqual(await execute(action(-6), context), {
    status: "continued",
  });
  assert.equal(state.readNativeOperation0050Activity(), null);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].reason, "native-stop");

  assert.deepEqual(await execute(action(-6), context), {
    status: "continued",
  });
  assert.equal(stops.length, 1);
});
