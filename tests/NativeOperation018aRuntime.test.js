import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation018aSemanticHandlers,
  createNativeOperation018aState,
} from "../play/events/NativeEventOperationRuntime.js";

function action(semanticId, mode, value) {
  return {
    semanticId,
    arguments: [
      { kind: "constant", value: mode },
      { kind: "constant", value },
    ],
  };
}

test("room allocation and 0x018a activation retain distinct source contracts", async () => {
  const state = createNativeOperation018aState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation018aSemanticHandlers({ state }),
  });
  assert.equal((await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8))).status, "stopped");
  state.initializeRoomPool();
  await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8));
  await execute(action("native-operation-018a-secondary-initialize", 1, 0x5ea8));
  const snapshot = state.snapshot();
  assert.equal(snapshot.primary.allocationBytes, 704);
  assert.equal(snapshot.primary.allocationTag, "AMB1");
  assert.deepEqual(snapshot.primary.setupCommands, [
    { command: 0x09a0, channel: 1, argument: 25 },
    { command: 0x5da8, channel: 0, argument: 0 },
  ]);
  assert.equal(snapshot.primary.slots.length, 16);
  assert.deepEqual(snapshot.primary.slotCommands, Array.from({ length: 16 }, (_, i) => (
    { command: 0x28a0, channel: 1, argument: i + 1 }
  )));
  assert.deepEqual(snapshot.primary.controllerRegistrations.map(value => value.slot), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  assert.deepEqual(snapshot.secondary.setupCommands, [
    { command: 0x09a0, channel: 1, argument: 50 },
    { command: 0x5ea8, channel: 0, argument: 0 },
  ]);
  assert.deepEqual(snapshot.secondary.controllerRegistrations.map(value => value.slot), [3, 2, 1]);
});

test("operation 0x018a selector above sixteen resets all slots in native order", async () => {
  const state = createNativeOperation018aState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation018aSemanticHandlers({ state }),
  });
  const before = await execute(action("native-operation-018a-primary-slot-reset", 2, 17));
  assert.equal(before.mutation.nativeNoOp, true);
  state.initializeRoomPool();
  assert.equal((await execute(action("native-operation-018a-primary-slot-reset", 2, 17))).mutation.nativeNoOp, true);
  await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8));
  const reset = await execute(action("native-operation-018a-primary-slot-reset", 2, 17));
  assert.deepEqual(reset.mutation.slotIndices, [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(state.snapshot().primary.slots.every(slot => (
    slot.word32 === 0 && slot.word36 === 127 && slot.word40 === 0xffffffff
  )), true);
  const noResource = await execute(action("native-operation-018a-primary-slot-conditional-mark", 3, 4));
  assert.equal(noResource.mutation.nativeNoOp, true);
  state.configurePrimarySlotResource(4, 0x1234);
  await execute(action("native-operation-018a-primary-slot-conditional-mark", 3, 4));
  assert.equal(state.snapshot().primary.slots[3].recordWord0, 1);
});

function recordWriteAction() {
  return {
    semanticId: "native-operation-018b-primary-record-write",
    arguments: [1, 0, 0x92ffc, 0x3f333333, 0x40400000, 0x3f333333, 0, 0x93008]
      .map((value, i) => ({ kind: [2, 7].includes(i) ? "static-pointer" : "constant", value })),
  };
}

test("018b writes inactive pool records, 018a preserves them, and reset preserves pointer/float fields", async () => {
  const state = createNativeOperation018aState();
  const execute = createNativeEventOperationExecutor({ handlers: createNativeOperation018aSemanticHandlers({ state }) });
  const write = recordWriteAction();
  assert.equal((await execute(write)).status, "stopped");
  state.initializeRoomPool();
  assert.equal((await execute(write)).status, "continued");
  const before = state.snapshot();
  assert.equal(before.primary.active, false);
  assert.equal(before.primary.slots[0].recordWord0, 1);
  assert.equal(before.primary.slots[0].resourceWord8, 0x92ffc);
  assert.equal(before.primary.slots[0].resourceWord28, 0x93008);
  assert.deepEqual([before.primary.slots[0].floatWord12, before.primary.slots[0].floatWord16, before.primary.slots[0].floatWord20],
    [0x3f333333, 0x40400000, 0x3f333333]);
  await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8));
  assert.deepEqual(state.snapshot().primary.slots, before.primary.slots);
  await execute(action("native-operation-018a-primary-slot-reset", 2, 1));
  const reset = state.snapshot().primary.slots[0];
  assert.deepEqual(reset, { ...before.primary.slots[0], recordWord0: 0, word36: 127, word40: 0xffffffff });
  await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8));
  assert.deepEqual(state.snapshot().primary.slots[0], { ...reset, word36: 0, word40: 0 });
  state.restore(before);
  assert.deepEqual(state.snapshot(), before);
  write.arguments[2].value = 123;
  before.primary.slots[0].resourceOperand.value = 456;
  assert.equal(state.snapshot().primary.slots[0].resourceOperand.value, 0x92ffc, "source and snapshots cannot mutate the owner");
});

test("malformed 018b words, slots, pointers and argument counts cannot partially write the pool", async () => {
  const state = createNativeOperation018aState();
  state.initializeRoomPool();
  const execute = createNativeEventOperationExecutor({ handlers: createNativeOperation018aSemanticHandlers({ state }) });
  const before = state.snapshot();
  for (const change of [a => { a.arguments[0].value = 0; }, a => { a.arguments[0].value = 17; },
    a => { a.arguments[3].value = NaN; }, a => { a.arguments[2].kind = "constant"; }, a => { a.arguments.pop(); }]) {
    const malformed = recordWriteAction();
    change(malformed);
    assert.equal((await execute(malformed)).status, "stopped");
    assert.deepEqual(state.snapshot(), before);
  }
});
