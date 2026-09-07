import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0194SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

function action(mode, padding = 0) {
  return {
    kind: "engineOperation",
    semanticId: "native-operation-0194-control",
    arguments: [
      { kind: "constant", value: mode },
      { kind: "constant", value: padding },
    ],
  };
}

test("operation 0x0194 forwards its three exact native routes", async () => {
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0194SemanticHandlers({
      invokeNativeOperation0194Mode0: value => {
        calls.push(["mode0", value]);
      },
      invokeNativeOperation0194Mode1: () => {
        calls.push(["mode1"]);
      },
      queryNativeOperation0194Mode2: () => {
        calls.push(["mode2"]);
        return 0x12ab;
      },
    }),
  });

  assert.deepEqual(await execute(action(0)), {
    status: "continued",
    mutation: { mode: 0, forwardedValue: 0 },
  });
  assert.deepEqual(await execute(action(1)), {
    status: "continued",
    mutation: { mode: 1 },
  });
  assert.deepEqual(await execute(action(2)), { result: 0xab });
  assert.deepEqual(calls, [["mode0", 0], ["mode1"], ["mode2"]]);
});

test("operation 0x0194 rejects unproved modes and padding", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0194SemanticHandlers({
      invokeNativeOperation0194Mode0: () => {
        throw new Error("unproved padding reached adapter");
      },
    }),
  });
  assert.equal(
    (await execute(action(0, 1))).reason,
    "native-operation-0194-padding-unproved",
  );
  assert.equal(
    (await execute(action(3))).reason,
    "native-operation-0194-mode-unproved",
  );
});

test("operation 0x0194 requires the exact route adapter and byte query", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0194SemanticHandlers(),
  });
  for (const mode of [0, 1, 2]) {
    assert.equal(
      (await execute(action(mode))).reason,
      `native-operation-0194-mode-${mode}-adapter-missing`,
    );
  }

  const invalidQuery = createNativeEventOperationExecutor({
    handlers: createNativeOperation0194SemanticHandlers({
      queryNativeOperation0194Mode2: () => undefined,
    }),
  });
  assert.equal(
    (await invalidQuery(action(2))).reason,
    "native-operation-0194-mode-2-result-invalid",
  );
});
