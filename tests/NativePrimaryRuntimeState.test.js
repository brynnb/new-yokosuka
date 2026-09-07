import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativePrimaryRuntimeSemanticHandlers,
} from "../play/events/NativePrimaryRuntimeState.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(semanticId, mode = null) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    arguments: mode === null
      ? []
      : [{ kind: "constant", value: mode }],
  };
}

function extendedAction(mode, ...values) {
  return {
    kind: "engineOperation",
    semanticId: "primary-runtime-extended-operation",
    callFileOffset: "0x280",
    arguments: [mode, ...values].map(value => (
      typeof value === "string"
        ? {
            kind: "constant",
            value: (
              value.charCodeAt(0)
              | value.charCodeAt(1) << 8
              | value.charCodeAt(2) << 16
              | value.charCodeAt(3) << 24
            ) >>> 0,
            ascii: value,
          }
        : { kind: "constant", value }
    )),
  };
}

function configuredState(overrides = {}) {
  const state = createNativeSceneGameplayState();
  state.configurePrimaryRuntimeState({
    available: true,
    currentEventPresent: true,
    gateByte: 0,
    stateDword1f8: 1,
    stateDword20: 9,
    statusByte1d9: 1,
    globalByteB02: 7,
    ...overrides,
  });
  return state;
}

test("queries exact mode-two and mode-eight primary runtime predicates", async () => {
  const state = configuredState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.equal((await execute(
    action("primary-runtime-state-one-query"),
    context,
  )).result, 1);
  assert.equal((await execute(
    action("primary-runtime-status-byte-query"),
    context,
  )).result, 1);

  state.configurePrimaryRuntimeState({
    available: true,
    currentEventPresent: true,
    gateByte: 2,
    stateDword1f8: 1,
    statusByte1d9: 0,
  });
  assert.equal((await execute(
    action("primary-runtime-state-one-query"),
    context,
  )).result, 0);
  assert.equal((await execute(
    action("primary-runtime-status-byte-query"),
    context,
  )).result, 0);
});

test("applies exact mode-zero primary runtime writes", async () => {
  const state = configuredState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  const result = await execute(
    action("primary-runtime-state-transition", 0),
    createNativeSceneFieldRuntimeContext(state),
  );
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readPrimaryRuntimeState(), {
    available: true,
    currentEventPresent: true,
    gateByte: 0,
    stateDword1f8: 0,
    stateDword20: 2,
    statusByte1d9: 1,
    globalByteB02: 0,
  });
});

test("preflights the exact mode-one transition callback", async () => {
  const state = configuredState();
  const context = {
    planPrimaryRuntimeTransition: mode => (
      state.planPrimaryRuntimeTransition(mode)
    ),
    commitPrimaryRuntimeTransition: plan => (
      state.commitPrimaryRuntimeTransition(plan)
    ),
  };
  const withoutCallback = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  assert.deepEqual(await withoutCallback(
    action("primary-runtime-state-transition", 1),
    context,
  ), {
    status: "stopped",
    reason: "primary-runtime-transition-callback-missing",
  });
  assert.equal(state.readPrimaryRuntimeState().stateDword20, 9);

  const stateOwned = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  assert.equal((await stateOwned(
    action("primary-runtime-state-transition", 1),
    createNativeSceneFieldRuntimeContext(state),
  )).status, "continued");
  assert.deepEqual(state.readPrimaryRuntimeTransitionCallback(), {
    argument: 1,
    revision: 1,
  });

  const callbacks = [];
  const withCallback = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers({
      invokePrimaryRuntimeTransition: value => callbacks.push(value),
    }),
  });
  assert.equal((await withCallback(
    action("primary-runtime-state-transition", 1),
    context,
  )).status, "continued");
  assert.deepEqual(callbacks, [1]);
  assert.equal(state.readPrimaryRuntimeState().stateDword1f8, 1);
  assert.equal(state.readPrimaryRuntimeState().stateDword20, 1);
});

test("stops when primary runtime availability has not been established", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  assert.deepEqual(await execute(
    action("primary-runtime-state-one-query"),
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState()),
  ), {
    status: "stopped",
    reason: "native primary runtime state is unavailable",
  });
});

test("preserves exact primary-runtime modes 7, 9, 13, and 18", async () => {
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers({
      invokePrimaryRuntimeMode7: value => calls.push([7, value]),
      invokePrimaryRuntimeMode9: value => calls.push([9, value]),
      invokePrimaryRuntimeMode13: value => calls.push([13, value]),
      invokePrimaryRuntimeMode18: () => calls.push([18]),
    }),
  });
  for (const [mode, value] of [[7, 4], [9, 1], [13, 0]]) {
    assert.equal(
      (await execute(extendedAction(mode, value))).status,
      "continued",
    );
  }
  assert.equal((await execute(extendedAction(18))).status, "continued");
  assert.deepEqual(calls, [[7, 4], [9, 1], [13, 0], [18]]);
});

test("preserves exact result-producing modes 11, 15, and 17", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers({
      queryPrimaryRuntimeMode11: () => -1,
      queryPrimaryRuntimeMode15: () => 7,
      queryPrimaryRuntimeMode17: value => value === 0x4f4d4f4a ? 1 : 0,
    }),
  });
  assert.equal((await execute(extendedAction(11))).result, -1);
  assert.equal((await execute(extendedAction(15))).result, 7);
  assert.equal((await execute(extendedAction(17, "JOMO"))).result, 1);
});

test("preserves exact primary-runtime actor routes and missing no-ops", async () => {
  const actor = {};
  const calls = [];
  const actors = new Map([["AKIR", actor], ["MISS", null]]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers({
      resolvePrimaryRuntimeActor: ({ actorTag }) => actors.get(actorTag),
      invokePrimaryRuntimeMode14: (resolved, value) => (
        calls.push([14, resolved, value])
      ),
      invokePrimaryRuntimeMode16: resolved => calls.push([16, resolved]),
    }),
  });
  assert.equal(
    (await execute(extendedAction(14, "AKIR", 1))).status,
    "continued",
  );
  assert.equal(
    (await execute(extendedAction(16, "AKIR"))).status,
    "continued",
  );
  assert.equal(
    (await execute(extendedAction(16, "MISS"))).status,
    "continued",
  );
  assert.deepEqual(calls, [[14, actor, 1], [16, actor]]);
  assert.equal(
    (await execute(extendedAction(16, "NONE"))).reason,
    "primary-runtime-actor-resolution-unavailable",
  );
});

test("retains authored mode 12 as an exact no-op", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  assert.deepEqual(await execute(extendedAction(12, 0)), {
    status: "continued",
    mutation: { mode: 12, route: "native-no-op" },
  });
  assert.equal(
    (await execute(extendedAction(12, 1))).reason,
    "primary-runtime-mode-12-value-unproved",
  );
});

test("extended primary-runtime modes preflight exact adapters", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers(),
  });
  assert.equal(
    (await execute(extendedAction(7, 0))).reason,
    "primary-runtime-invokePrimaryRuntimeMode7-missing",
  );
  assert.equal(
    (await execute(extendedAction(14, "AKIR", 0))).reason,
    "primary-runtime-resolvePrimaryRuntimeActor-missing",
  );

  const resolverOnly = createNativeEventOperationExecutor({
    handlers: createNativePrimaryRuntimeSemanticHandlers({
      resolvePrimaryRuntimeActor: () => null,
    }),
  });
  assert.equal(
    (await resolverOnly(extendedAction(16, "AKIR"))).reason,
    "primary-runtime-invokePrimaryRuntimeMode16-missing",
  );
});
