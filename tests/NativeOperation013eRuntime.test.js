import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation013eSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(mode, slot, ...pointers) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-operation-013e-resource-slot-control",
    arguments: [mode, slot, ...pointers].map(value => ({
      kind: "constant",
      value,
    })),
  };
}

function runtime(state) {
  return {
    context: createNativeSceneFieldRuntimeContext(state),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation013eSemanticHandlers(),
    }),
  };
}

test("operation 0x013e binds and releases an exact declared resource pair", async () => {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 0,
      primaryPointer: 0xb138a,
      secondaryPointer: 0xb1391,
    }],
  });
  const { context, execute } = runtime(state);

  const installed = await execute(
    action(0, 0, 0xb138a, 0xb1391),
    context,
  );
  assert.equal(installed.status, "continued");
  assert.deepEqual(state.readNativeOperation013eSlot(0), {
    primaryPointer: 0xb138a,
    secondaryPointer: 0xb1391,
  });

  const released = await execute(action(1, 0), context);
  assert.equal(released.status, "continued");
  assert.equal(released.mutation.released, true);
  assert.equal(state.readNativeOperation013eSlot(0), null);
});

test("operation 0x013e rejects undeclared resources and invalid slots", async () => {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 0,
      primaryPointer: 0x1000,
      secondaryPointer: 0x2000,
    }],
  });
  const { context, execute } = runtime(state);

  const undeclared = await execute(action(0, 0, 0x3000, 0x4000), context);
  assert.equal(undeclared.status, "stopped");
  assert.equal(
    undeclared.reason.kind,
    "native-operation-013e-contract-failed",
  );
  assert.match(undeclared.reason.message, /not declared/);

  const invalidSlot = await execute(action(1, 70), context);
  assert.equal(invalidSlot.status, "stopped");
  assert.equal(
    invalidSlot.reason.kind,
    "native-operation-013e-contract-failed",
  );
  assert.match(invalidSlot.reason.message, /0 through 69/);
});

test("operation 0x013e rejects a declared resource pair in the wrong slot", async () => {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 1,
      primaryPointer: 0x1000,
      secondaryPointer: 0x2000,
    }],
  });
  const { context, execute } = runtime(state);
  const result = await execute(action(0, 0, 0x1000, 0x2000), context);
  assert.equal(result.status, "stopped");
  assert.match(result.reason.message, /slot and resource pair/);
});

test("operation 0x013e scene state participates in transaction snapshots", () => {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 4,
      primaryPointer: 0x1000,
      secondaryPointer: 0x2000,
    }],
  });
  const snapshot = state.snapshot();
  state.nativeOperation013eState.bind({
    slot: 4,
    primaryPointer: 0x1000,
    secondaryPointer: 0x2000,
  });
  assert.notEqual(state.readNativeOperation013eSlot(4), null);
  state.restore(snapshot);
  assert.equal(state.readNativeOperation013eSlot(4), null);
});

test("operation 0x013e declarations are replaced for each pinned program", () => {
  const state = createNativeSceneGameplayState();
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 0,
      primaryPointer: 0x1000,
      secondaryPointer: 0x2000,
    }],
  });
  state.prepareNativeOperation013eBindings({
    operation013eStaticBindings: [{
      slot: 0,
      primaryPointer: 0x3000,
      secondaryPointer: 0x4000,
    }],
  });
  assert.throws(() => state.nativeOperation013eState.bind({
    slot: 0,
    primaryPointer: 0x1000,
    secondaryPointer: 0x2000,
  }), /not declared/);
  assert.doesNotThrow(() => state.nativeOperation013eState.bind({
    slot: 0,
    primaryPointer: 0x3000,
    secondaryPointer: 0x4000,
  }));
});

test("embedded AUTH bindings release only their exact package identity", () => {
  const state = createNativeSceneGameplayState();
  state.installNativeEmbeddedAuthBinding({
    slot: 2,
    activityId: "OP02/SEQDATA2.AUTH",
  });
  assert.throws(() => state.uninstallNativeEmbeddedAuthBinding({
    slot: 2,
    activityId: "OTHER/SEQDATA2.AUTH",
  }), /is not owned/);
  assert.deepEqual(state.uninstallNativeEmbeddedAuthBinding({
    slot: 2,
    activityId: "OP02/SEQDATA2.AUTH",
  }), {
    slot: 2,
    released: true,
    previous: {
      kind: "map-embedded-slot",
      activityId: "OP02/SEQDATA2.AUTH",
    },
  });
  assert.equal(state.readNativeOperation013eSlot(2), null);
  assert.equal(state.uninstallNativeEmbeddedAuthBinding({
    slot: 2,
    activityId: "OP02/SEQDATA2.AUTH",
  }).released, false);
});
