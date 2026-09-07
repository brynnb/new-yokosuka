import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation017aSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function action(mode, word1, word2) {
  return {
    kind: "engineOperation",
    semanticId: "native-operation-017a-control",
    arguments: [
      { kind: "constant", value: mode },
      { kind: "constant", value: word1 },
      { kind: "constant", value: word2 },
    ],
  };
}

test("forwards all three exact operation-0x017a routes", async () => {
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation017aSemanticHandlers({
      applyNativeOperation017aControl: detail => {
        calls.push(detail);
        return { applied: true, ...detail };
      },
    }),
  });
  assert.equal((await execute(action(0, 5, 1))).status, "continued");
  assert.equal((await execute(action(1, 0xdead, 0xbeef))).status, "continued");
  assert.equal((await execute(action(2, 8, 0))).status, "continued");
  assert.deepEqual(calls, [
    { mode: 0, maskWord: 5, modeByteWord: 1 },
    { mode: 1 },
    { mode: 2, clearMaskWord: 8 },
  ]);
});

test("operation 0x017a stops without its native subsystem", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation017aSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(0, 1, 0)), {
    status: "stopped",
    reason: "native-operation-017a-adapter-missing",
  });
});
