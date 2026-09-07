import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAssociatedRecordSemanticHandlers,
} from "../play/events/NativeAssociatedRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(objectTag, byte11, byte12) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-figp-byte-pair-write",
    arguments: [
      { kind: "constant", value: 0, ascii: objectTag },
      { kind: "constant", value: byte11 },
      { kind: "constant", value: byte12 },
    ],
  };
}

test("writes operation 0x0110's exact FIGP low-byte pair", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFigpRecord({
    objectTag: "AKIR",
    actorAvailable: true,
    recordAvailable: true,
    byte11: 7,
    byte12: 8,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual(await execute(action("AKIR", 0x102, 0x201), context), {
    status: "continued",
    mutation: {
      applied: true,
      objectTag: "AKIR",
      recordTag: "FIGP",
      previous: { byte11: 7, byte12: 8 },
      byte11: 2,
      byte12: 1,
    },
  });
  assert.deepEqual(state.readObjectFigpRecord("AKIR"), {
    actorAvailable: true,
    recordAvailable: true,
    byte10: 0,
    byte11: 2,
    byte12: 1,
  });
});

test("preserves operation 0x0110's missing-object and missing-FIGP no-ops", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFigpRecord({
    objectTag: "AKIR",
    actorAvailable: false,
    recordAvailable: false,
  });
  state.configureObjectFigpRecord({
    objectTag: "CHAI",
    actorAvailable: true,
    recordAvailable: false,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  for (const [objectTag, reason] of [
    ["AKIR", "actor-unavailable"],
    ["CHAI", "figp-record-missing"],
  ]) {
    assert.deepEqual(await execute(action(objectTag, 2, 1), context), {
      status: "continued",
      mutation: { applied: false, nativeNoOp: true, reason },
    });
  }
});

test("fails closed without reusable FIGP state ownership", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action("AKIR", 0, 0)), {
    status: "stopped",
    reason: "resolved-object-figp-byte-pair-adapter-missing",
  });
});
