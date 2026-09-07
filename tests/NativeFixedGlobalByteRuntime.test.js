import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeFixedGlobalByteSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";

function action(value) {
  return {
    semanticId: "fixed-global-byte-0c201fe0-write",
    arguments: [{ kind: "constant", value }],
  };
}

function bitSixAction(selector) {
  return {
    semanticId: "fixed-global-byte-0c201c40-bit-six-control",
    arguments: [{ kind: "constant", value: selector }],
  };
}

test("operation 0x0054 sets and clears only fixed-byte bit six", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedGlobalByteSemanticHandlers(),
  });
  assert.deepEqual(await execute(bitSixAction(0), context), {
    status: "continued",
    mutation: {
      offset: 0x0c201c40,
      width: 1,
      previous: 0,
      value: 0x40,
    },
  });
  scene.writeNativeField({ offset: 0x0c201c40, width: 1, value: 0xe5 });
  assert.deepEqual(await execute(bitSixAction(1), context), {
    status: "continued",
    mutation: {
      offset: 0x0c201c40,
      width: 1,
      previous: 0xe5,
      value: 0xa5,
    },
  });
});

test("operation 0x0054 fails closed for unknown selectors and state", async () => {
  const scene = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedGlobalByteSemanticHandlers(),
  });
  assert.equal(
    (await execute(bitSixAction(2), createNativeSceneFieldRuntimeContext(scene)))
      .reason,
    "fixed-global-byte-0c201c40-selector-unproved",
  );
  assert.equal(
    (await execute(bitSixAction(0), createNativeSceneFieldRuntimeContext(scene)))
      .reason,
    "fixed-global-byte-0c201c40-value-unavailable",
  );
});

test("operation 0x018e writes only fixed byte 0x0c201fe0", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedGlobalByteSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(1), context), {
    status: "continued",
    mutation: { offset: 0x0c201fe0, width: 1, value: 1 },
  });
  assert.equal(scene.readNativeField({
    offset: 0x0c201fe0,
    width: 1,
  }), 1);
  await execute(action(0), context);
  assert.equal(scene.readNativeField({
    offset: 0x0c201fe0,
    width: 1,
  }), 0);
});

test("operation 0x018e stops before unproved values or missing writes", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedGlobalByteSemanticHandlers(),
  });
  assert.equal(
    (await execute(action(2))).reason,
    "fixed-global-byte-0c201fe0-value-unproved",
  );
  assert.equal(
    (await execute(action(1))).reason,
    "fixed-global-byte-0c201fe0-write-adapter-missing",
  );
});
