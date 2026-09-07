import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeDebugFormatSemanticHandlers,
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function action(arguments_) {
  return {
    kind: "engineOperation",
    semanticId: "native-debug-format",
    callFileOffset: "0x120",
    arguments: arguments_,
  };
}

test("forwards exact debug format pointers and raw variadic words", async () => {
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeDebugFormatSemanticHandlers({
      formatNativeDebugMessage: detail => {
        calls.push(detail);
        return { result: 17, message: "JOMO_AKIRA = 4\n" };
      },
    }),
  });
  const result = await execute(action([
    { kind: "static-pointer", value: 0x94288 },
    { kind: "constant", value: 4 },
  ]), {
    location: { functionId: "0x100" },
  });
  assert.deepEqual(result, {
    status: "continued",
    result: 17,
    debugMessage: "JOMO_AKIRA = 4\n",
  });
  assert.deepEqual(calls, [{
    formatPointer: 0x94288,
    argumentWords: [4],
    source: {
      functionFileOffset: "0x100",
      callFileOffset: "0x120",
    },
  }]);
});

test("dead debug formatting continues without platform presentation", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeDebugFormatSemanticHandlers(),
  });
  assert.deepEqual(await execute(action([
    { kind: "static-pointer", value: 0x94288 },
  ])), {
    status: "continued",
    debugMessage: null,
  });
});

test("debug formatting stops when a missing platform result is consumed", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeDebugFormatSemanticHandlers(),
  });
  assert.deepEqual(await execute({
    ...action([{ kind: "static-pointer", value: 0x94288 }]),
    resultTarget: { kind: "frameField", offset: 4 },
  }), {
    status: "stopped",
    reason: "native-debug-formatter-adapter-missing",
  });
});
