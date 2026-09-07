import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEnvironmentPresetSemanticHandlers,
  createNativeEnvironmentPresetState,
} from "../play/events/NativeEnvironmentPresetRuntime.js";
import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";

function action(index) {
  return {
    kind: "engineOperation",
    semanticId: "native-environment-preset-select",
    arguments: [{ kind: "constant", value: index }],
  };
}

test("environment preset selection preserves the exact native pipeline", async () => {
  const state = createNativeEnvironmentPresetState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeEnvironmentPresetSemanticHandlers(),
  });
  const result = await execute(action(1), {
    nativeEnvironmentPresetState: state,
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.read(), { selectedIndex: 1, revision: 1 });
  assert.deepEqual(result.mutation.nativePipeline, {
    outerTag: "FOG ",
    recordPayloadOffset: 8,
    recordStrideBytes: 80,
    nestedTags: ["FOG ", "BACK"],
    fogGlobalAddresses: [
      0x0c20bc44,
      0x0c20bc48,
      0x0c20bc4c,
      0x0c20bc50,
      0x0c20bc54,
    ],
    backgroundIndexedWordCount: 4,
  });
});

test("environment preset selection fails closed beyond authored indices", async () => {
  const state = createNativeEnvironmentPresetState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeEnvironmentPresetSemanticHandlers(),
  });
  assert.equal((await execute(action(2), {
    nativeEnvironmentPresetState: state,
  })).reason.kind, "native-environment-preset-contract-failed");
  assert.equal((await execute(action(0), {})).reason,
    "native-environment-preset-state-missing");
});
