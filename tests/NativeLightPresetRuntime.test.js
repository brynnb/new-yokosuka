import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeLightPresetSemanticHandlers,
  createNativeLightPresetState,
} from "../play/events/NativeLightPresetRuntime.js";

function action(value) {
  return {
    kind: "engineOperation",
    semanticId: "native-light-preset-select",
    arguments: [{ kind: "constant", value: value >>> 0 }],
  };
}

test("operation 0x010f selects exact native LGHT preset slots", async () => {
  const state = createNativeLightPresetState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeLightPresetSemanticHandlers(),
  });
  const context = { nativeLightPresetState: state };
  assert.equal((await execute(action(1), context)).mutation.accepted, true);
  assert.deepEqual(state.read(), { selectedIndex: 1, revision: 1 });
  assert.equal((await execute(action(0), context)).mutation.previousIndex, 1);
  assert.deepEqual(state.read(), { selectedIndex: 0, revision: 2 });
});

test("operation 0x010f mirrors native out-of-range no-op behavior", async () => {
  const state = createNativeLightPresetState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeLightPresetSemanticHandlers(),
  });
  const result = await execute(action(-1), { nativeLightPresetState: state });
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.accepted, false);
  assert.deepEqual(state.read(), { selectedIndex: null, revision: 0 });
});
