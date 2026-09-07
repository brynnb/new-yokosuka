import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeSceneOwnerFlagsSemanticHandlers,
  createNativeSceneOwnerFlagsState,
} from "../play/events/NativeSceneOwnerFlagsRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function action(bitIndex, value) {
  return {
    kind: "engineOperation",
    semanticId: "native-scene-owner-flag-bit-control",
    arguments: [
      { kind: "constant", value: bitIndex },
      { kind: "constant", value },
    ],
  };
}

test("scene-owner flag control preserves unrelated bits", async () => {
  const state = createNativeSceneOwnerFlagsState({ flagsWord: 0x80000001 });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneOwnerFlagsSemanticHandlers(),
  });

  const clear = await execute(action(0, 0), {
    nativeSceneOwnerFlagsState: state,
  });
  assert.equal(clear.status, "continued");
  assert.deepEqual(clear.mutation, {
    ownerFieldOffset: 0xe0,
    bitIndex: 0,
    set: false,
    mask: 1,
    previousWord: 0x80000001,
    flagsWord: 0x80000000,
  });

  const set = await execute(action(0, 1), {
    nativeSceneOwnerFlagsState: state,
  });
  assert.equal(set.status, "continued");
  assert.equal(state.read(), 0x80000001);
});

test("scene-owner flag control fails closed without exact state or bit", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSceneOwnerFlagsSemanticHandlers(),
  });
  assert.equal((await execute(action(0, 1), {})).reason,
    "native-scene-owner-flags-state-missing");
  const result = await execute(action(32, 1), {
    nativeSceneOwnerFlagsState: createNativeSceneOwnerFlagsState(),
  });
  assert.equal(result.reason.kind, "native-scene-owner-flag-contract-failed");
});
