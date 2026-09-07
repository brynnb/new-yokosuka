import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation011aSemanticHandlers,
} from "../play/events/NativeOperation011aRuntime.js";
import {
  createNativeOperation0153SemanticHandlers,
  createNativeOperation0153State,
} from "../play/events/NativeOperation0153Runtime.js";
import {
  createNativeOperation015cSemanticHandlers,
  createNativeOperation015cState,
} from "../play/events/NativeOperation015cRuntime.js";
import {
  createNativeOperation0193SemanticHandlers,
  createNativeOperation0193State,
} from "../play/events/NativeOperation0193Runtime.js";

function action(semanticId, arguments_, kinds = []) {
  return {
    kind: "engineOperation",
    semanticId,
    arguments: arguments_.map((value, index) => ({
      kind: kinds[index] || "constant",
      value,
    })),
  };
}

test("operation 0x011a forwards the exact object-record release word", async () => {
  const released = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation011aSemanticHandlers({
      releaseNativeObjectRecord: value => released.push(value),
    }),
  });
  assert.deepEqual(await execute(action(
    "native-operation-011a-object-record-release",
    [0xffffffff],
  )), {
    status: "continued",
    mutation: { handle: 0xffffffff },
  });
  assert.deepEqual(released, [0xffffffff]);
});

test("operation 0x0153 reproduces the native signed-negative flag", async () => {
  const state = createNativeOperation0153State();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0153SemanticHandlers({ state }),
  });
  for (const [value, expected] of [[0, 0], [1, 0], [0xffffffff, 1]]) {
    const result = await execute(action(
      "native-operation-0153-negative-flag-write",
      [value],
    ));
    assert.equal(result.mutation.value, expected);
  }
  assert.equal(state.value, 1);
  assert.equal((await execute(action(
    "native-operation-0153-negative-flag-write",
    [2],
  ))).reason, "native-operation-0153-argument-unproved");
});

test("operation 0x015c resolves and stably acquires authored names", async () => {
  const state = createNativeOperation015cState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation015cSemanticHandlers({ state }),
  });
  const context = {
    resolveNativeStaticString: pointer => (
      pointer === 0x22402 ? "OPEN1" : undefined
    ),
  };
  const request = action(
    "native-operation-015c-named-controller-acquire",
    [0x22402, 0],
    ["static-pointer", "constant"],
  );
  assert.equal((await execute(request, context)).result, 1);
  assert.equal((await execute(request, context)).result, 1);
  assert.equal(state.handles.get("OPEN1"), 1);
});

test("operation 0x0193 routes initialize, advance, and tagged initialize", async () => {
  const state = createNativeOperation0193State();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0193SemanticHandlers({ state }),
  });
  await execute(action("native-operation-0193-controller", [0, 0]));
  await execute(action("native-operation-0193-controller", [1, 0]));
  await execute(action("native-operation-0193-controller", [2, 0x5953464d]));
  assert.deepEqual(state.initializations, [
    { mode: 0, tagWord: 0 },
    { mode: 1, tagWord: 0x5953464d },
  ]);
  assert.equal(state.advanceCount, 1);
  assert.equal((await execute(action(
    "native-operation-0193-controller",
    [1, 2],
  ))).reason, "native-operation-0193-mode-1-value-unproved");
});
