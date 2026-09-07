import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation008fSemanticHandlers,
  createNativeOperation008fState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";

function action(objectTag, descriptor, value = 0) {
  const tagWord = (
    objectTag.charCodeAt(0)
    | objectTag.charCodeAt(1) << 8
    | objectTag.charCodeAt(2) << 16
    | objectTag.charCodeAt(3) << 24
  ) >>> 0;
  return {
    semanticId: "native-operation-008f-object-orchestration",
    arguments: [
      { kind: "constant", value: tagWord, ascii: objectTag },
      { kind: "constant", value: descriptor },
      { kind: "constant", value },
    ],
  };
}

function executor(options = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation008fSemanticHandlers(options),
  });
}

function descriptorAdapters(calls, identities, gate = 1) {
  return {
    captureNativeOperation008fIdentity(object) {
      calls.push(["capture", object]);
      return identities.shift();
    },
    invokeNativeOperation008fDescriptorPrepare(object) {
      calls.push(["prepare", object]);
    },
    resolveNativeOperation008fOwnerField1c() {
      calls.push(["owner-field-1c"]);
      return 0x11223344;
    },
    applyNativeOperation008fDescriptor(detail) {
      calls.push(["apply", detail]);
    },
    queryNativeOperation008fGate(object) {
      calls.push(["gate", object]);
      return gate;
    },
    invokeNativeOperation008fReconcile(object) {
      calls.push(["reconcile", object]);
    },
    invokeNativeOperation008fFinalizeStage0(object) {
      calls.push(["finalize-0", object]);
    },
    invokeNativeOperation008fFinalizeStage1(object) {
      calls.push(["finalize-1", object]);
    },
  };
}

test("operation 0x008f zero descriptor preserves both native stages", async () => {
  const state = createNativeOperation008fState();
  state.configureObject({ objectTag: "AKIR", object: null });
  const calls = [];
  const result = await executor({
    invokeNativeOperation008fZeroStage0(object) {
      calls.push(["zero-0", object]);
    },
    invokeNativeOperation008fZeroStage1(object) {
      calls.push(["zero-1", object]);
    },
  })(action("AKIR", 0), { nativeOperation008fState: state });

  assert.deepEqual(calls, [["zero-0", null], ["zero-1", null]]);
  assert.deepEqual(result, {
    status: "continued",
    mutation: { route: "zero-descriptor", objectTag: "AKIR" },
  });
});

test("operation 0x008f descriptor route stops after a zero gate", async () => {
  const state = createNativeOperation008fState();
  const object = { nativeIdentity: 7 };
  state.configureObject({ objectTag: "AKIR", object });
  const calls = [];
  const result = await executor(
    descriptorAdapters(calls, [0x7000], 0),
  )(action("AKIR", 0x44534352, 0xffffffff), {
    nativeOperation008fState: state,
  });

  assert.deepEqual(calls, [
    ["capture", object],
    ["prepare", object],
    ["owner-field-1c"],
    ["apply", {
      object,
      ownerField1c: 0x11223344,
      descriptor: 0x44534352,
      value: 0xffffffff,
    }],
    ["gate", object],
  ]);
  assert.equal(result.mutation.route, "descriptor-gate-zero");
});

test("operation 0x008f skips reconcile when native identity is unchanged", async () => {
  const state = createNativeOperation008fState();
  const object = {};
  const identity = {};
  state.configureObject({ objectTag: "FUKU", object });
  const calls = [];
  const result = await executor(
    descriptorAdapters(calls, [identity, identity]),
  )(action("FUKU", 0x1000, 4), {
    nativeOperation008fState: state,
  });

  assert.deepEqual(calls.map(call => call[0]), [
    "capture",
    "prepare",
    "owner-field-1c",
    "apply",
    "gate",
    "capture",
    "finalize-0",
    "finalize-1",
  ]);
  assert.equal(result.mutation.reconciled, false);
});

test("operation 0x008f reconciles changed identity before finalization", async () => {
  const state = createNativeOperation008fState();
  const object = {};
  state.configureObject({ objectTag: "AKIR", object });
  const calls = [];
  const result = await executor(
    descriptorAdapters(calls, [0x1000, 0x2000]),
  )(action("AKIR", 0x2000), {
    nativeOperation008fState: state,
  });

  assert.deepEqual(calls.map(call => call[0]), [
    "capture",
    "prepare",
    "owner-field-1c",
    "apply",
    "gate",
    "capture",
    "reconcile",
    "finalize-0",
    "finalize-1",
  ]);
  assert.equal(result.mutation.reconciled, true);
});

test("operation 0x008f preflights every possible adapter", async () => {
  const state = createNativeOperation008fState();
  state.configureObject({ objectTag: "AKIR", object: {} });
  const calls = [];
  const adapters = descriptorAdapters(calls, [1, 2]);
  delete adapters.invokeNativeOperation008fReconcile;
  const result = await executor(adapters)(action("AKIR", 1), {
    nativeOperation008fState: state,
  });
  assert.equal(
    result.reason,
    "native-operation-008f-invokeNativeOperation008fReconcile-missing",
  );
  assert.deepEqual(calls, []);

  const zeroCalls = [];
  const zeroResult = await executor({
    invokeNativeOperation008fZeroStage0() {
      zeroCalls.push("zero-0");
    },
  })(action("AKIR", 0), { nativeOperation008fState: state });
  assert.equal(
    zeroResult.reason,
    "native-operation-008f-invokeNativeOperation008fZeroStage1-missing",
  );
  assert.deepEqual(zeroCalls, []);
});

test("operation 0x008f distinguishes unavailable state from null object", async () => {
  const state = createNativeOperation008fState();
  assert.equal(
    (await executor()(action("AKIR", 0), {})).reason,
    "native-operation-008f-state-unavailable",
  );
  assert.equal(
    (await executor()(action("AKIR", 0), {
      nativeOperation008fState: state,
    })).reason,
    "native-operation-008f-object-state-unavailable",
  );
  assert.throws(
    () => state.configureObject({ objectTag: "AKIR" }),
    /may not be undefined/,
  );
});

test("operation 0x008f state is exposed through scene runtime context", () => {
  const scene = createNativeSceneGameplayState();
  const object = {};
  scene.configureNativeOperation008fObject({
    objectTag: "AKIR",
    object,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);
  assert.equal(context.nativeOperation008fState, scene.nativeOperation008fState);
  assert.deepEqual(
    context.nativeOperation008fState.resolveObject("AKIR"),
    { available: true, object },
  );
});
