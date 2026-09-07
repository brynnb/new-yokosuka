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

function action(value) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "actor-figp-byte-10-write",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value },
    ],
  };
}

function runtime(state) {
  return {
    context: createNativeSceneFieldRuntimeContext(state),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeAssociatedRecordSemanticHandlers(),
    }),
  };
}

test("writes operation 0x00c8's exact FIGP byte +0x10", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFigpRecord({
    objectTag: "AKIR",
    actorAvailable: true,
    recordAvailable: true,
    byte10: 7,
    byte11: 2,
    byte12: 3,
  });
  const { execute, context } = runtime(state);
  const result = await execute(action(0x12345682), context);
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: true,
    objectTag: "AKIR",
    recordTag: "FIGP",
    offset: 0x10,
    previous: 7,
    value: 0x82,
  });
  assert.deepEqual(state.readObjectFigpRecord("AKIR"), {
    actorAvailable: true,
    recordAvailable: true,
    byte10: 0x82,
    byte11: 2,
    byte12: 3,
  });
});

test("preserves operation 0x00c8's missing-actor and FIGP no-ops", async () => {
  for (const [actorAvailable, recordAvailable, reason] of [
    [false, false, "actor-unavailable"],
    [true, false, "figp-record-missing"],
  ]) {
    const state = createNativeSceneGameplayState();
    state.configureObjectFigpRecord({
      objectTag: "AKIR",
      actorAvailable,
      recordAvailable,
    });
    const { execute, context } = runtime(state);
    assert.deepEqual((await execute(action(4), context)).mutation, {
      applied: false,
      nativeNoOp: true,
      reason,
    });
  }
});

test("fails closed without shared FIGP state ownership", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(0), {}), {
    status: "stopped",
    reason: "actor-figp-byte-10-adapter-missing",
  });
});
