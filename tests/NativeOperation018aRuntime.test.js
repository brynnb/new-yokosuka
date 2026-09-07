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

test("operation 0x018a retains exact primary and secondary controller allocation", async () => {
  const state = createNativeOperation018aState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation018aSemanticHandlers({ state }),
  });
  await execute(action("native-operation-018a-primary-initialize", 0, 0x5da8));
  await execute(action("native-operation-018a-secondary-initialize", 1, 0x5ea8));
  const snapshot = state.snapshot();
  assert.equal(snapshot.primary.allocationUnits, 25);
  assert.equal(snapshot.primary.slots.length, 16);
  assert.deepEqual(snapshot.primary.controllerRegistrations.map(value => value.slot), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  assert.equal(snapshot.secondary.allocationUnits, 50);
  assert.deepEqual(snapshot.secondary.controllerRegistrations.map(value => value.slot), [3, 2, 1]);
});

test("operation 0x018a selector above sixteen resets all slots in native order", async () => {
  const state = createNativeOperation018aState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation018aSemanticHandlers({ state }),
  });
  const before = await execute(action("native-operation-018a-primary-slot-reset", 2, 17));
  assert.equal(before.mutation.nativeNoOp, true);
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
