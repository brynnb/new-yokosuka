import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation01bdSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function action() {
  return {
    kind: "engineOperation",
    semanticId: "native-operation-01bd-global-dword-consume",
    arguments: [
      { kind: "runtime", source: "ignored-native-operand-zero" },
      { kind: "runtime", source: "ignored-native-operand-one" },
    ],
  };
}

test("returns and consumes operation-0x01bd's exact global dword", async () => {
  let consumed = false;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation01bdSemanticHandlers({
      consumeNativeOperation01bdGlobalDword: () => {
        consumed = true;
        return 37;
      },
    }),
  });
  assert.deepEqual(await execute(action()), { result: 37 });
  assert.equal(consumed, true);
});

test("does not resolve operation-0x01bd's ignored authored operands", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation01bdSemanticHandlers({
      consumeNativeOperation01bdGlobalDword: () => -1,
    }),
    resolveOperand: () => {
      throw new Error("ignored operand was resolved");
    },
  });
  assert.deepEqual(await execute(action()), { result: -1 });
});

test("fails closed while operation-0x01bd's producer is unavailable", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation01bdSemanticHandlers({
      consumeNativeOperation01bdGlobalDword: () => undefined,
    }),
  });
  assert.deepEqual(await execute(action()), {
    status: "stopped",
    reason: "native-operation-01bd-global-dword-unavailable",
  });
});
