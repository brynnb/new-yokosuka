import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeNoOpSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";

test("native no-op semantics continue without resolving operands", async () => {
  const semanticId = "native-operation-012c-no-op";
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeNoOpSemanticHandlers([semanticId]),
    resolveOperand: () => {
      throw new Error("native no-op attempted to resolve an operand");
    },
  });
  assert.deepEqual(await execute({
    semanticId,
    arguments: [
      { kind: "runtime", source: "ignored" },
      { kind: "runtime", source: "also-ignored" },
    ],
  }), {
    status: "continued",
    mutation: { route: "native-no-op", semanticId },
  });
});

test("native no-op registry rejects invalid and duplicate IDs", () => {
  assert.throws(
    () => createNativeNoOpSemanticHandlers([""]),
    /non-empty string/,
  );
  assert.throws(
    () => createNativeNoOpSemanticHandlers(["same", "same"]),
    /duplicate native no-op/,
  );
});
