import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeOsagParameterSemanticHandlers,
  createNativeOsagParameterState,
} from "../play/events/NativeOsagParameterRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function action(target, value) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "resolved-object-osag-float-word-write",
    arguments: [target, { kind: "constant", value }],
  };
}

function actor(value = "SORY") {
  return {
    kind: "constant",
    value: 0x59524f53,
    ascii: value,
  };
}

function runtime(state) {
  return {
    context: { nativeOsagParameterState: state },
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOsagParameterSemanticHandlers(),
    }),
  };
}

test("writes the exact authored float word to OSAG +0x01e8", async () => {
  const state = createNativeOsagParameterState();
  state.configureRecord({
    objectTag: "SORY",
    objectAvailable: true,
    recordAvailable: true,
    floatWord1e8: 0x3f800000,
  });
  const { execute, context } = runtime(state);
  const result = await execute(action(actor(), 0x3e0f5c29), context);
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: true,
    objectTag: "SORY",
    componentTag: "OSAG",
    fieldOffset: 0x01e8,
    previous: 0x3f800000,
    floatWord1e8: 0x3e0f5c29,
  });
  assert.equal(state.read("SORY").floatWord1e8, 0x3e0f5c29);
});

test("resolves a dynamic object word without hard-coding SORY", async () => {
  const state = createNativeOsagParameterState();
  state.configureRecord({
    objectTag: "ABCD",
    objectAvailable: true,
    recordAvailable: true,
  });
  const { execute, context } = runtime(state);
  context.readFrameField = offset => (
    offset === 8 ? 0x44434241 : undefined
  );
  const result = await execute(action(
    { kind: "frame-field", offset: 8 },
    0x40400000,
  ), context);
  assert.equal(result.status, "continued");
  assert.equal(state.read("ABCD").floatWord1e8, 0x40400000);
});

test("retains native missing-object and missing-record no-ops", async () => {
  const state = createNativeOsagParameterState();
  state.configureRecord({
    objectTag: "NONE",
    objectAvailable: false,
    recordAvailable: false,
  });
  state.configureRecord({
    objectTag: "NREC",
    objectAvailable: true,
    recordAvailable: false,
  });
  const { execute, context } = runtime(state);
  assert.deepEqual((await execute(action(actor("NONE"), 1), context)).mutation, {
    applied: false,
    nativeNoOp: true,
    reason: "object-missing",
  });
  assert.deepEqual((await execute(action(actor("NREC"), 1), context)).mutation, {
    applied: false,
    nativeNoOp: true,
    reason: "associated-osag-record-missing",
  });
  assert.deepEqual(await execute(action(actor("MISS"), 1), context), {
    status: "stopped",
    reason: "osag-object-state-unavailable",
  });
});

test("stops when canonical OSAG parameter state is unavailable", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOsagParameterSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(actor(), 0x3f800000), {}), {
    status: "stopped",
    reason: "native-osag-parameter-state-missing",
  });
});
