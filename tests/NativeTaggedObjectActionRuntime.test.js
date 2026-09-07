import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeTaggedObjectActionSemanticHandlers,
  createNativeTaggedObjectActionState,
  createNativeTaggedObjectControllerSemanticHandlers,
  createNativeTaggedObjectControllerState,
} from "../play/events/NativeTaggedObjectActionRuntime.js";

function action(mode, objectTag = null) {
  return {
    kind: "engineOperation",
    semanticId: "tagged-object-action",
    callFileOffset: "0x100",
    arguments: [
      { kind: "constant", value: mode },
      ...(
        objectTag
          ? [{
              kind: "constant",
              value: 0x314b4254,
              ascii: objectTag,
            }]
          : []
      ),
    ],
  };
}

test("tagged-object actions preserve exact active and return phases", async () => {
  const state = createNativeTaggedObjectActionState();
  const results = [0, 0, 1, 0, 0, 1];
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTaggedObjectActionSemanticHandlers({
      state,
      executeTaggedObjectAction: detail => {
        calls.push(detail);
        return results.shift();
      },
    }),
  });

  assert.equal((await execute(action(1, "TBK1"))).result, 0);
  assert.deepEqual(state.read(), {
    objectTag: "TBK1",
    nativeState: 1,
    completed: false,
    revision: 1,
  });
  assert.equal((await execute(action(4))).result, 0);
  assert.equal(state.read().completed, false);
  assert.equal((await execute(action(4))).result, 1);
  assert.equal(state.read().completed, true);
  assert.equal((await execute(action(5))).result, 0);
  assert.equal((await execute(action(2))).result, 0);
  assert.deepEqual(state.read(), {
    objectTag: "TBK1",
    nativeState: 2,
    completed: false,
    revision: 4,
  });
  assert.equal((await execute(action(4))).result, 1);
  assert.equal(state.read().completed, true);
  assert.deepEqual(
    calls.map(call => [call.mode, call.objectTag]),
    [
      [1, "TBK1"],
      [4, "TBK1"],
      [4, "TBK1"],
      [5, "TBK1"],
      [2, "TBK1"],
      [4, "TBK1"],
    ],
  );
});

test("tagged-object actions reject invented completion and transitions", async () => {
  const state = createNativeTaggedObjectActionState();
  let controllerCalls = 0;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTaggedObjectActionSemanticHandlers({
      state,
      executeTaggedObjectAction: ({ mode }) => {
        controllerCalls += 1;
        return mode === 1 ? 0 : 2;
      },
    }),
  });
  await execute(action(1, "TBK1"));
  assert.deepEqual(await execute(action(4)), {
    status: "stopped",
    reason: "native tagged-object controller result must be -1, 0, or 1",
  });
  assert.throws(
    () => state.apply({ mode: 2, result: 0 }),
    /requires completed state 1/,
  );
  assert.equal(controllerCalls, 2);
  assert.deepEqual(await execute(action(5)), {
    status: "stopped",
    reason: "native tagged-object mode 5 requires a completed action",
  });
  assert.equal(controllerCalls, 2);
});

test("tagged-object action semantics remain fail closed without a controller", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTaggedObjectActionSemanticHandlers({
      state: createNativeTaggedObjectActionState(),
    }),
  });
  assert.deepEqual(await execute(action(1, "TBK1")), {
    status: "stopped",
    reason: "tagged-object-action-controller-missing",
  });
});

test("outer controller modes initialize a pair before writing configuration", async () => {
  const state = createNativeTaggedObjectControllerState();
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTaggedObjectControllerSemanticHandlers({
      state,
      initializeTaggedObjectControllerPair: detail => {
        calls.push(detail);
        return 0;
      },
    }),
  });
  const initialize = {
    kind: "engineOperation",
    semanticId: "tagged-object-controller-initialize",
    callFileOffset: "0x69b38",
    arguments: [
      { kind: "constant", value: 0 },
      { kind: "constant", value: 0x4c554b59, ascii: "YKUL" },
      { kind: "constant", value: 0x52554b59, ascii: "YKUR" },
    ],
  };
  assert.equal((await execute(initialize)).result, 0);
  assert.deepEqual(calls.map(({ firstObjectTag, secondObjectTag }) => [
    firstObjectTag,
    secondObjectTag,
  ]), [["YKUL", "YKUR"]]);
  const configure = {
    kind: "engineOperation",
    semanticId: "tagged-object-controller-configuration-write",
    callFileOffset: "0x69b68",
    arguments: [
      { kind: "constant", value: 16 },
      { kind: "constant", value: 0x000ae354 },
    ],
  };
  assert.equal((await execute(configure)).result, 0);
  assert.deepEqual(state.read(), {
    activePair: ["YKUL", "YKUR"],
    configurationPointer: 0x000ae354,
    revision: 2,
  });
});

test("outer mode sixteen preserves the native inactive result", async () => {
  const state = createNativeTaggedObjectControllerState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeTaggedObjectControllerSemanticHandlers({ state }),
  });
  assert.deepEqual(await execute({
    kind: "engineOperation",
    semanticId: "tagged-object-controller-configuration-write",
    arguments: [
      { kind: "constant", value: 16 },
      { kind: "constant", value: 0x000ae354 },
    ],
  }), {
    status: "continued",
    result: -1,
    mutation: null,
  });
});
