import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeMapcRecordSemanticHandlers,
  createNativeMapcRecordState,
} from "../play/events/NativeEventOperationRuntime.js";

function action(objectTag, value) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-mapc-bit-control",
    arguments: [
      { kind: "constant", value: 0, ascii: objectTag },
      { kind: "constant", value },
    ],
  };
}

test("sets and clears only MAPC control bit zero", async () => {
  const state = createNativeMapcRecordState();
  state.configure({
    objectTag: "AKIR",
    objectAvailable: true,
    recordAvailable: true,
    controlWord: 0x22,
    objectFloatWord48: 0,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeMapcRecordSemanticHandlers({
      applyResolvedObjectMapcControl: detail => state.apply(detail),
    }),
  });
  assert.equal((await execute(action("AKIR", 1))).status, "continued");
  assert.equal(state.read("AKIR").controlWord, 0x23);
  assert.equal((await execute(action("AKIR", 0))).status, "continued");
  assert.equal(state.read("AKIR").controlWord, 0x22);
  assert.equal(state.read("AKIR").objectFloatWord48, 0x3f800000);
});

test("zero still writes object +0x48 when MAPC is absent", async () => {
  const state = createNativeMapcRecordState();
  state.configure({
    objectTag: "FUKU",
    objectAvailable: true,
    recordAvailable: false,
    controlWord: 0x44,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeMapcRecordSemanticHandlers({
      applyResolvedObjectMapcControl: detail => state.apply(detail),
    }),
  });
  const result = await execute(action("FUKU", 0));
  assert.equal(result.status, "continued");
  assert.equal(state.read("FUKU").controlWord, 0x44);
  assert.equal(state.read("FUKU").objectFloatWord48, 0x3f800000);
});

test("preserves the native missing-object no-op", async () => {
  const state = createNativeMapcRecordState();
  state.configure({
    objectTag: "NONE",
    objectAvailable: false,
    recordAvailable: false,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeMapcRecordSemanticHandlers({
      applyResolvedObjectMapcControl: detail => state.apply(detail),
    }),
  });
  const result = await execute(action("NONE", 1));
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.nativeNoOp, true);
});
