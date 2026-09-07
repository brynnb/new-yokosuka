import assert from "node:assert/strict";
import test from "node:test";

import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation009bSemanticHandlers,
  createNativeOperation009bState,
} from "../play/events/NativeOperation009bRuntime.js";

const action = {
  kind: "engineOperation",
  semanticId: "native-registry-record-release",
  arguments: [{ kind: "frame-field", offset: 4 }],
};

test("operation 0x009b preserves native found and missing release results", async () => {
  const state = createNativeOperation009bState();
  state.install(17, { native: true });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation009bSemanticHandlers({ state }),
  });
  const context = {
    frameFields: new Map([[4, 17]]),
    readFrameField(offset) { return this.frameFields.get(offset); },
  };
  assert.deepEqual(await execute(action, context), {
    result: 1,
    mutation: { handle: 17, released: true },
  });
  assert.deepEqual(await execute(action, context), {
    result: 0,
    mutation: { handle: 17, released: false },
  });
});

test("operation 0x009b forwards the exact word to an injected registry", async () => {
  const released = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation009bSemanticHandlers({
      releaseNativeRegistryRecord: handle => {
        released.push(handle);
        return false;
      },
    }),
  });
  const constantAction = {
    ...action,
    arguments: [{ kind: "constant", value: 0xffffffff }],
  };
  assert.equal((await execute(constantAction)).result, 0);
  assert.deepEqual(released, [0xffffffff]);
});
