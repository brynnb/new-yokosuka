import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeTransientSlotSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(mode, value) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-transient-slot-control",
    callFileOffset: "0xe30c",
    arguments: [
      { kind: "constant", value: mode },
      { kind: "constant", value },
    ],
  };
}

test("allocates exact transient slots from 15 downward and releases them", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTransientSlotSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const first = await execute(action(1, 0x10103), context);
  assert.equal(first.status, "continued");
  assert.equal(first.result, 15);
  assert.deepEqual(state.nativeTransientSlotState.read(15), {
    activeByte: 1,
    byte1: 0,
    byte2: 0,
    byte3: 0,
    valueWord: 0x103,
  });
  assert.equal((await execute(action(1, -2), context)).result, 14);
  assert.equal(state.nativeTransientSlotState.read(14).valueWord, -2);
  const released = await execute(action(0, 15), context);
  assert.equal(released.status, "continued");
  assert.equal(released.mutation.released, true);
  assert.equal(state.nativeTransientSlotState.read(15), null);
  assert.equal((await execute(action(1, 7), context)).result, 15);
});

test("returns native minus one when all sixteen transient slots are occupied", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTransientSlotSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  for (let index = 15; index >= 0; index -= 1) {
    assert.equal((await execute(action(1, index), context)).result, index);
  }
  const full = await execute(action(1, 0), context);
  assert.equal(full.status, "continued");
  assert.equal(full.result, -1);
  assert.deepEqual(full.mutation, { slot: -1, record: null });
});

test("fails closed for unproven modes and invalid release slots", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTransientSlotSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual(await execute(action(2, 0), context), {
    status: "stopped",
    reason: "native-transient-slot-mode-unproven",
  });
  const invalid = await execute(action(0, 16), context);
  assert.equal(invalid.status, "stopped");
  assert.equal(invalid.reason.kind, "native-transient-slot-contract-failed");
});
