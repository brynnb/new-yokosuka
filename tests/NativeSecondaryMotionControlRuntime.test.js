import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSecondaryMotionControlSemanticHandlers,
} from "../play/events/NativeSecondaryMotionControlRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(semanticId, ...arguments_) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    arguments: arguments_.map(value => (
      typeof value === "object"
        ? value
        : { kind: "constant", value }
    )),
  };
}

function actor(value = "SINF") {
  return {
    kind: "constant",
    value: 0x464e4953,
    ascii: value,
  };
}

function runtime(state) {
  return {
    context: createNativeSceneFieldRuntimeContext(state),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeSecondaryMotionControlSemanticHandlers(),
    }),
  };
}

test("native secondary motion retains every exact global float channel", async () => {
  const state = createNativeSceneGameplayState();
  const { execute, context } = runtime(state);
  for (const [mode, word] of [
    [0, 0x3f800000],
    [1, 0x3f666666],
    [2, 0x3d99999a],
    [10, 0],
    [11, 0x40600000],
    [20, 0x3c23d70a],
    [21, 0],
    [30, 0x3a4ccccd],
    [31, 0],
  ]) {
    const result = await execute(action(
      "native-secondary-motion-global-float-write",
      mode,
      word,
    ), context);
    assert.equal(result.status, "continued");
    assert.equal(state.readNativeSecondaryMotionGlobalFloat(mode), word);
  }
});

test("native secondary-motion actor mode and flags share exact record state", async () => {
  const state = createNativeSceneGameplayState();
  state.configureNativeSecondaryMotionActor({
    actorTag: "SINF",
    actorAvailable: true,
    recordAvailable: true,
  });
  const { execute, context } = runtime(state);

  assert.equal((await execute(action(
    "resolved-secondary-motion-mode-write",
    actor(),
    4,
  ), context)).status, "continued");
  assert.equal((await execute(action(
    "resolved-secondary-motion-flag-write",
    actor(),
    8,
    1,
  ), context)).status, "continued");
  assert.deepEqual(state.readNativeSecondaryMotionActor("SINF"), {
    actorAvailable: true,
    recordAvailable: true,
    modeByte06: 4,
    flagsByte00: 8,
    initialized: true,
  });

  await execute(action(
    "resolved-secondary-motion-flag-write",
    actor(),
    8,
    0,
  ), context);
  assert.equal(
    state.readNativeSecondaryMotionActor("SINF").flagsByte00,
    0,
  );
});

test("native secondary-motion actor writes preserve missing-record no-ops", async () => {
  const state = createNativeSceneGameplayState();
  state.configureNativeSecondaryMotionActor({
    actorTag: "SINF",
    actorAvailable: true,
    recordAvailable: false,
  });
  const { execute, context } = runtime(state);
  const result = await execute(action(
    "resolved-secondary-motion-mode-write",
    actor(),
    4,
  ), context);
  assert.deepEqual(result.mutation, {
    applied: false,
    nativeNoOp: true,
    reason: "secondary-motion-record-missing",
  });
  assert.deepEqual(await execute(action(
    "resolved-secondary-motion-mode-write",
    {
      kind: "constant",
      value: 0x52494b41,
      ascii: "AKIR",
    },
    4,
  ), context), {
    status: "stopped",
    reason: "secondary-motion-actor-state-unavailable",
  });
});
