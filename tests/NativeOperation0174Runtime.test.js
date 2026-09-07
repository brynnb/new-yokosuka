import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0174SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function action(value) {
  return {
    kind: "engineOperation",
    semanticId: "native-operation-0174-global-dword-write",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value },
    ],
  };
}

test("writes the exact operation-0x0174 global dword", async () => {
  let written;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0174SemanticHandlers({
      writeNativeOperation0174GlobalDword: value => {
        written = value;
        return 1;
      },
    }),
  });
  assert.deepEqual(await execute(action(0)), {
    status: "continued",
    mutation: { previous: 1, value: 0 },
  });
  assert.equal(written, 0);
});

test("rejects unauthored operation-0x0174 routes", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0174SemanticHandlers({
      writeNativeOperation0174GlobalDword: () => undefined,
    }),
  });
  const unsupportedMode = action(1);
  unsupportedMode.arguments[0].value = 0;
  assert.deepEqual(await execute(unsupportedMode), {
    status: "stopped",
    reason: "native-operation-0174-arguments-unproved",
  });
  assert.deepEqual(await execute(action(2)), {
    status: "stopped",
    reason: "native-operation-0174-arguments-unproved",
  });
});

test("fails closed without operation-0x0174 state ownership", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0174SemanticHandlers(),
  });
  assert.deepEqual(await execute(action(1)), {
    status: "stopped",
    reason: "native-operation-0174-global-dword-writer-missing",
  });
});
