import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation019eSemanticHandlers,
  createNativeOperation019eState,
} from "../play/events/NativeOperation019eRuntime.js";

function action(...arguments_) {
  return {
    semanticId: "native-operation-019e-controller-control",
    arguments: arguments_.map(value => ({ kind: "constant", value })),
  };
}

function executor() {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation019eSemanticHandlers(),
  });
}

test("operation 0x019e mode two stores and returns its Boolean control", async () => {
  const state = createNativeOperation019eState();
  const context = { nativeOperation019eState: state };
  assert.equal((await executor()(action(2, 7), context)).result, 1);
  assert.equal((await executor()(action(2, 0), context)).result, 0);
  assert.equal(state.read().enabled, false);
});

test("operation 0x019e mode four retains the exact controller descriptor", async () => {
  const state = createNativeOperation019eState();
  const operation = action(4, 3, 0x30303044, 17, 0x1000, 14001859, 6);
  operation.arguments[2].ascii = "D000";
  operation.arguments[4] = {
    kind: "static-pointer",
    value: 0x1000,
    staticWords: [0x11223344, 0x55667788, 0xffffffff],
  };
  const result = await executor()(operation, {
    nativeOperation019eState: state,
  });
  assert.equal(result.result, 0);
  assert.deepEqual(state.read().records, [{
    sceneIndex: 3,
    areaTag: "D000",
    kind: 17,
    scheduleWords: [0x11223344, 0x55667788],
    timeWord: 14001859,
    flags: 6,
  }]);
});

test("operation 0x019e duplicate identity follows native compared fields", async () => {
  const state = createNativeOperation019eState();
  const first = action(4, 1, 0x3059484a, 20, 0xffffffff, 12302359, 0);
  first.arguments[2].ascii = "JHY0";
  const second = structuredClone(first);
  second.arguments[6].value = 8;
  const context = { nativeOperation019eState: state };
  assert.equal((await executor()(first, context)).result, 0);
  assert.equal((await executor()(second, context)).result, -1);
  assert.equal(state.read().records.length, 1);
});

test("operation 0x019e refuses an unmaterialized schedule pointer", async () => {
  const state = createNativeOperation019eState();
  const operation = action(4, 1, 0x3059484a, 20, 0x1000, 12302359, 0);
  operation.arguments[4] = { kind: "static-pointer", value: 0x1000 };
  const result = await executor()(operation, {
    nativeOperation019eState: state,
  });
  assert.equal(
    result.reason,
    "native operation 0x019e schedule words are unavailable",
  );
  assert.equal(state.read().records.length, 0);
});
