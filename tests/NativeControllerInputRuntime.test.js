import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeControllerInputSemanticHandlers,
  createNativeControllerInputState,
} from "../play/events/NativeControllerInputRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function action(index, selector) {
  return {
    kind: "engineOperation",
    semanticId: "native-controller-input-field-query",
    arguments: [index, selector].map(value => ({ kind: "constant", value })),
  };
}

test("operation 0x0032 reads exact native controller record fields", async () => {
  const state = createNativeControllerInputState();
  state.write(0, {
    word4: 0x0800,
    word8: 0x1234,
    wordA: 0xabcd,
    byteC: 1,
    byteD: 2,
    byteE: 3,
    byteF: 4,
    word12: 0x5678,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeControllerInputSemanticHandlers(),
  });
  const context = { nativeControllerInputState: state };
  assert.equal((await execute(action(0, 0), context)).result, 0x0800);
  assert.equal((await execute(action(0, 2), context)).result, 0xabcd);
  assert.equal((await execute(action(0, 6), context)).result, 4);
  assert.equal((await execute(action(0, 7), context)).result, 0x5678);
});

test("operation 0x0032 defaults disconnected controller records to zero", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeControllerInputSemanticHandlers(),
  });
  const state = createNativeControllerInputState();
  assert.equal((await execute(action(0, 0), {
    nativeControllerInputState: state,
  })).result, 0);
});
