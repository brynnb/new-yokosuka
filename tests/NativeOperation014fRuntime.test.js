import assert from "node:assert/strict";
import test from "node:test";
import { createNativeEventOperationExecutor, createNativeOperation014fSemanticHandlers } from "../play/events/NativeEventOperationRuntime.js";

test("operation 0x014f preserves the exact raw float word", async () => {
  let written;
  const execute = createNativeEventOperationExecutor({ handlers: createNativeOperation014fSemanticHandlers({
    writeNativeOperation014fGlobalFloatWord: value => { written = value; return 7; },
  }) });
  assert.deepEqual(await execute({ semanticId: "native-operation-014f-global-float-word-write",
    arguments: [{ kind: "constant", value: 1053609165 }] }),
  { status: "continued", mutation: { previous: 7, value: 1053609165 } });
  assert.equal(written, 1053609165);
});
