import assert from "node:assert/strict";
import test from "node:test";

import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import { createNativeOperation0170SemanticHandlers } from "../play/events/NativeOperation0170Runtime.js";

function action(selector, mode) {
  return {
    kind: "engineOperation",
    callFileOffset: "0x85e06",
    semanticId: "native-map-render-preparation-control",
    arguments: [selector, mode].map(value => ({
      kind: "constant",
      value: value >>> 0,
    })),
  };
}

test("operation 0x0170 dispatches exact all-slot MAP invalidation and rebuild", async () => {
  const requests = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0170SemanticHandlers({
      applyMapRenderPreparation: detail => (requests.push(detail), true),
    }),
  });
  const context = { location: { functionId: "0x85df0" } };
  assert.equal((await execute(action(-1, 0), context)).status, "continued");
  assert.equal((await execute(action(-1, 1), context)).status, "continued");
  assert.deepEqual(requests.map(({ selector, mode }) => ({ selector, mode })), [
    { selector: -1, mode: 0 },
    { selector: -1, mode: 1 },
  ]);
  assert.deepEqual(requests[0].source, {
    functionFileOffset: "0x85df0",
    callFileOffset: "0x85e06",
  });
});

test("operation 0x0170 fails closed outside its proven contract", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0170SemanticHandlers({
      applyMapRenderPreparation: () => true,
    }),
  });
  assert.equal(
    (await execute(action(32, 0), {})).reason.kind,
    "native-operation-0170-contract-failed",
  );
  assert.equal(
    (await execute(action(-1, 2), {})).reason,
    "native-operation-0170-mode-unproved",
  );
});
