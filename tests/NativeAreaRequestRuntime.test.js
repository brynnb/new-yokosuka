import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAreaRequestSemanticHandlers,
  createNativeAreaRequestState,
} from "../play/events/NativeAreaRequestRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function action(values) {
  return {
    kind: "engineOperation",
    semanticId: "native-area-request-record-write",
    arguments: values.map(value => ({ kind: "constant", value: value >>> 0 })),
  };
}

test("operation 0x0187 writes the exact native area-request record", async () => {
  const state = createNativeAreaRequestState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAreaRequestSemanticHandlers(),
  });
  const result = await execute(
    action([4, 1, 0x3230504f, 49]),
    { nativeAreaRequestState: state },
  );
  assert.equal(result.status, "continued");
  assert.deepEqual(state.read(), {
    flagsCc: 1,
    wordD0: 0x3230504f,
    wordD4: 1,
    wordD8: 49,
    wordDc: 4,
  });

  await execute(action([4, 1, 0x3230504f, 0]), {
    nativeAreaRequestState: state,
  });
  assert.deepEqual(state.read(), {
    flagsCc: 1,
    wordD0: 0x3230504f,
    wordD4: 1,
    wordD8: 0,
    wordDc: 4,
  });
});

test("operation 0x0187 fails closed without its owned state", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAreaRequestSemanticHandlers(),
  });
  const result = await execute(action([4, 1, 0x3230504f, 0]), {});
  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "native-area-request-state-missing");
});
