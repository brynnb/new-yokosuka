import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation016dSemanticHandlers,
  createNativeOperation016dState,
} from "../play/events/NativeEventOperationRuntime.js";

function action(mode, argument1 = 11, argument2 = 22, argument3 = 33) {
  return {
    semanticId: "native-operation-016d-control",
    arguments: [mode, argument1, argument2, argument3].map(value => ({
      kind: "constant",
      value,
    })),
  };
}

function executor(handlers, context = {}) {
  return {
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation016dSemanticHandlers(handlers),
    }),
    context,
  };
}

test("operation 0x016d mode zero forwards only arguments one and two", async () => {
  const calls = [];
  const runtime = executor({
    applyModeZero(detail) {
      calls.push(detail);
      return { applied: true };
    },
  });
  const result = await runtime.execute(action(0), runtime.context);
  assert.deepEqual(calls, [{ mode: 0, argument1: 11, argument2: 22 }]);
  assert.deepEqual(result, {
    status: "continued",
    mutation: { applied: true },
  });
});

test("operation 0x016d mode one forwards all three payload words", async () => {
  const calls = [];
  const runtime = executor({
    applyModeOne(detail) {
      calls.push(detail);
    },
  });
  const result = await runtime.execute(action(1), runtime.context);
  assert.deepEqual(calls, [{
    mode: 1,
    argument1: 11,
    argument2: 22,
    argument3: 33,
  }]);
  assert.equal(result.status, "continued");
});

test("operation 0x016d mode two implements the exact signed query", async () => {
  const state = createNativeOperation016dState();
  const runtime = executor({}, {
    queryNativeOperation016dControlDword224b20: () => (
      state.queryControlDword224b20()
    ),
  });

  state.configureControlDword224b20(0);
  assert.deepEqual(
    await runtime.execute(action(2), runtime.context),
    { result: 1 },
  );
  state.configureControlDword224b20(0x7fffffff);
  assert.deepEqual(
    await runtime.execute(action(2), runtime.context),
    { result: 1 },
  );
  state.configureControlDword224b20(0xffffffff);
  assert.deepEqual(
    await runtime.execute(action(2), runtime.context),
    { result: 0 },
  );
  state.configureControlDword224b20(-0x80000000);
  assert.deepEqual(
    await runtime.execute(action(2), runtime.context),
    { result: 0 },
  );
});

test("operation 0x016d mode three takes no authored payload", async () => {
  const calls = [];
  const runtime = executor({
    applyModeThree(detail) {
      calls.push(detail);
    },
  });
  assert.equal(
    (await runtime.execute(action(3), runtime.context)).status,
    "continued",
  );
  assert.deepEqual(calls, [{ mode: 3 }]);
});

test("operation 0x016d mode four is the exact native no-op", async () => {
  const runtime = executor();
  assert.deepEqual(
    await runtime.execute(action(4), runtime.context),
    {
      status: "continued",
      mutation: { mode: 4, nativeNoOp: true },
    },
  );
});

test("operation 0x016d stops at missing state, adapters, and unproved modes", async () => {
  const runtime = executor();
  assert.equal(
    (await runtime.execute(action(0), runtime.context)).reason,
    "native-operation-016d-mode-zero-adapter-missing",
  );
  assert.equal(
    (await runtime.execute(action(1), runtime.context)).reason,
    "native-operation-016d-mode-one-adapter-missing",
  );
  assert.equal(
    (await runtime.execute(action(2), runtime.context)).reason,
    "native-operation-016d-control-state-unavailable",
  );
  assert.equal(
    (await runtime.execute(action(3), runtime.context)).reason,
    "native-operation-016d-mode-three-adapter-missing",
  );
  assert.equal(
    (await runtime.execute(action(5), runtime.context)).reason,
    "native-operation-016d-mode-unproved",
  );
});

test("operation 0x016d state refuses unavailable or non-dword values", () => {
  const state = createNativeOperation016dState();
  assert.throws(
    () => state.queryControlDword224b20(),
    /control-state-unavailable/,
  );
  assert.throws(
    () => state.configureControlDword224b20(0x100000000),
    /32-bit integer/,
  );
});
