import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0071SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(mode, value = 0) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "fixed-three-channel-float-word-access",
    arguments: [mode, value].map(word => ({
      kind: "constant",
      value: word,
    })),
  };
}

function runtime(state) {
  return {
    context: createNativeSceneFieldRuntimeContext(state),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation0071SemanticHandlers(),
    }),
  };
}

test("operation 0x0071 preserves all three exact float-word channels", async () => {
  const state = createNativeSceneGameplayState();
  const { context, execute } = runtime(state);
  const values = [0x42700000, 0x3f800000, 0xbf000000];
  for (const [channel, value] of values.entries()) {
    const mode = channel * 2;
    const first = await execute(action(mode, value), context);
    assert.equal(first.status, "continued");
    assert.equal(first.result, undefined);
    assert.equal(first.mutation.channel, channel);

    const replacement = value ^ 0x00800000;
    const second = await execute(action(mode, replacement), context);
    assert.equal(second.result, value);
    assert.equal(second.mutation.previous, value);
  }
  assert.equal((await execute(action(1), context)).result, 0x42f00000);
  assert.equal((await execute(action(3), context)).result, 0x3f000000);
});

test("operation 0x0071 reads and unknown modes fail closed", async () => {
  const state = createNativeSceneGameplayState();
  const { context, execute } = runtime(state);
  assert.deepEqual(await execute(action(1), context), {
    status: "stopped",
    reason: "native-operation-0071-value-unavailable",
  });
  assert.deepEqual(await execute(action(5), context), {
    status: "stopped",
    reason: "native-operation-0071-mode-unproved",
  });
});

test("operation 0x0071 values roll back with room scene state", async () => {
  const state = createNativeSceneGameplayState();
  const snapshot = state.snapshot();
  const { context, execute } = runtime(state);
  await execute(action(0, 0x42700000), context);
  assert.equal((await execute(action(1), context)).result, 0x42700000);
  state.restore(snapshot);
  assert.equal(
    (await execute(action(1), context)).reason,
    "native-operation-0071-value-unavailable",
  );
});
