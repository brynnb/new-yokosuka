import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativePersistentScriptBitSemanticHandlers,
  createNativePersistentScriptBitState,
} from "../play/events/NativePersistentScriptBitState.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

test("persistent script bits preserve the exact 256-bit native layout", () => {
  const state = createNativePersistentScriptBitState();
  assert.equal(state.write(0, 1), true);
  assert.equal(state.write(200, 1), true);
  assert.equal(state.write(255, 1), true);
  assert.equal(state.read(0), 1);
  assert.equal(state.read(200), 1);
  assert.equal(state.read(255), 1);
  assert.equal(state.read(256), 0);
  assert.equal(state.toJSON().bytes.length, 32);

  const restored = createNativePersistentScriptBitState(state.toJSON());
  assert.equal(restored.read(200), 1);
  assert.equal(restored.write(200, 0), true);
  assert.equal(restored.read(200), 0);
});

test("persistent script-bit writes enforce the proven operation ABI", async () => {
  const state = createNativePersistentScriptBitState();
  const handler = createNativePersistentScriptBitSemanticHandlers({ state })[
    "persistent-script-bit-write"
  ];
  const result = await handler({
    context: {},
    readArgument: index => [0, 202, 1][index],
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, { index: 202, previous: 0, value: 1 });
  assert.equal(state.read(202), 1);

  const invalid = await handler({
    context: {},
    readArgument: index => [1, 202, 0][index],
  });
  assert.equal(invalid.status, "stopped");
  assert.equal(invalid.reason, "persistent-script-bit-write-arguments-invalid");
  assert.equal(state.read(202), 1);
});

test("persistent script-bit writes fail closed without durable state", async () => {
  const handler = createNativePersistentScriptBitSemanticHandlers()[
    "persistent-script-bit-write"
  ];
  const result = await handler({
    context: {},
    readArgument: index => [0, 7, 1][index],
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "persistent-script-bit-state-missing");
});

test("persistent script-bit writes read an exact frame-sourced Boolean", async () => {
  const state = createNativePersistentScriptBitState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePersistentScriptBitSemanticHandlers({ state }),
  });
  const action = {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "persistent-script-bit-write",
    callFileOffset: "0x1c8ca",
    arguments: [
      { kind: "constant", value: 0 },
      { kind: "frame-field", offset: 100 },
      { kind: "frame-field", offset: 12 },
    ],
  };
  const frame = new Map([[100, 202], [12, 1]]);
  assert.deepEqual(await execute(action, {
    readFrameField: offset => frame.get(offset),
  }), {
    status: "continued",
    mutation: { index: 202, previous: 0, value: 1 },
  });
  assert.equal(state.read(202), 1);

  frame.set(12, 2);
  assert.deepEqual(await execute(action, {
    readFrameField: offset => frame.get(offset),
  }), {
    status: "stopped",
    reason: "persistent-script-bit-write-arguments-invalid",
  });
  assert.equal(state.read(202), 1);
});
