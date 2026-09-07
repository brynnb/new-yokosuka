import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0199SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function action() {
  return {
    kind: "engineOperation",
    semanticId: "native-operation-0199-mode-zero",
    callFileOffset: "0x300",
    arguments: [
      { kind: "constant", value: 0 },
      { kind: "constant", value: 539 },
      { kind: "constant", value: 0, ascii: "AKIR" },
      { kind: "constant", value: 0, ascii: "NAMS" },
      { kind: "constant", value: 0xbf800000 },
      { kind: "constant", value: 0x43400000 },
    ],
  };
}

test("forwards the exact operation-0x0199 mode-zero request", async () => {
  let request;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0199SemanticHandlers({
      applyNativeOperation0199ModeZero: detail => {
        request = detail;
        return { applied: true };
      },
    }),
  });
  assert.equal((await execute(action(), {
    location: { functionId: "0x200" },
  })).status, "continued");
  assert.deepEqual(request, {
    mode: 0,
    controlWord: 539,
    firstObjectTag: "AKIR",
    secondObjectTag: "NAMS",
    firstFloatWord: 0xbf800000,
    secondFloatWord: 0x43400000,
    source: {
      functionFileOffset: "0x200",
      callFileOffset: "0x300",
    },
  });
});

test("stops without the exact mode-zero subsystem", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0199SemanticHandlers(),
  });
  assert.deepEqual(await execute(action()), {
    status: "stopped",
    reason: "native-operation-0199-mode-zero-adapter-missing",
  });
});

test("writes the exact operation-0x0199 mode-one global dword", async () => {
  let written;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0199SemanticHandlers({
      writeNativeOperation0199ControlDword: value => {
        written = value;
        return 7;
      },
    }),
  });
  const result = await execute({
    semanticId: "native-operation-0199-control-dword-write",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 0xffffffff },
    ],
  });
  assert.equal(written, 0xffffffff);
  assert.deepEqual(result, {
    status: "continued",
    mutation: { previous: 7, value: 0xffffffff },
  });
});

test("returns the exact signed operation-0x0199 mode-two byte", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0199SemanticHandlers({
      readNativeOperation0199StatusByte: () => 0xfe,
    }),
  });
  const result = await execute({
    semanticId: "native-operation-0199-status-byte-query",
    arguments: [{ kind: "constant", value: 2 }],
  });
  assert.deepEqual(result, { result: -2 });
});

test("mode-two status queries fail closed when uninitialized", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0199SemanticHandlers({
      readNativeOperation0199StatusByte: () => undefined,
    }),
  });
  const result = await execute({
    semanticId: "native-operation-0199-status-byte-query",
    arguments: [{ kind: "constant", value: 2 }],
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "native-operation-0199-status-byte-unavailable");
});
