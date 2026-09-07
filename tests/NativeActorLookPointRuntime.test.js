import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorLookPointSemanticHandlers,
} from "../play/events/NativeActorLookPointRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function updateAction({
  actorTag = "AKIR",
  selector = 16,
  targetPointer = 0x3000,
  mode = 0,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "actor-look-point-update-control",
    arguments: [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: actorTag,
      },
      { kind: "constant", value: selector },
      { kind: "static-pointer", value: targetPointer },
      { kind: "constant", value: mode },
    ],
  };
}

function executor() {
  return createNativeEventOperationExecutor({
    handlers: createNativeActorLookPointSemanticHandlers(),
  });
}

function activeState(overrides = {}) {
  return {
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    terminalStateDword: 0,
    controllerFlagsDword: 0,
    selectorWord: 0x8068,
    defaultVector: [7, 8, 9],
    record: {
      available: true,
      vector: [1, 2, 3],
      selectorWord12: 0x1111,
      selectorWord14: 0x8065,
      activeDword: 1,
      auxiliaryDword: 55,
    },
    ...overrides,
  };
}

test("executes the exact active LKPT target-vector update", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState(activeState());
  state.writeNativeVector(0x3000, [
    0x3f800000,
    0x40000000,
    0x40400000,
  ]);
  const result = await executor()(
    updateAction({ selector: 16, mode: 2 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.path, "optimized-active-lkpt-update");
  assert.equal(result.mutation.recordTag, "LKPT");
  assert.deepEqual(result.mutation.state.record, {
    available: true,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    selectorWord12: 0x8068,
    selectorWord14: 0x8068,
    activeDword: 1,
    auxiliaryDword: 0,
  });
});

test("uses the controller default vector for a null target pointer", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState(activeState());
  const result = await executor()(
    updateAction({ targetPointer: 0, mode: 1 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.usedDefaultVector, true);
  assert.deepEqual(result.mutation.state.record, {
    available: true,
    vector: [7, 8, 9],
    selectorWord12: 0x1111,
    selectorWord14: 0x8065,
    activeDword: 1,
    auxiliaryDword: 0,
  });
});

test("preserves native no-ops for missing and terminal controllers", async () => {
  const state = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(state);
  state.configureActorLookPointState({
    actorTag: "AKIR",
    actorAvailable: false,
  });
  const missing = await executor()(updateAction({ targetPointer: 0 }), context);
  assert.equal(missing.status, "continued");
  assert.equal(missing.mutation.reason, "actor-missing");

  state.configureActorLookPointState(activeState({
    terminalStateDword: 1,
  }));
  const terminal = await executor()(
    updateAction({ targetPointer: 0 }),
    context,
  );
  assert.equal(terminal.status, "continued");
  assert.equal(
    terminal.mutation.reason,
    "actor-look-point-controller-terminal",
  );
});

test("stops before the still-explicit full-controller fallback", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState(activeState({
    controllerFlagsDword: 0x40,
  }));
  const before = state.readActorLookPointState("AKIR");
  const result = await executor()(
    updateAction({ targetPointer: 0 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.deepEqual(result, {
    status: "stopped",
    reason: "actor-look-point-full-control-required",
  });
  assert.deepEqual(state.readActorLookPointState("AKIR"), before);
});

test("stops before mutation when the supplied target vector is unavailable", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState(activeState());
  const before = state.readActorLookPointState("AKIR");
  const result = await executor()(
    updateAction({ targetPointer: 0x9999 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.deepEqual(result, {
    status: "stopped",
    reason: "actor-look-point-target-vector-unavailable",
  });
  assert.deepEqual(state.readActorLookPointState("AKIR"), before);
});

test("installs and releases a full LKPT record through the exact selector map", () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState({
    actorTag: "HATO",
    actorAvailable: true,
    controllerAvailable: true,
    actorFlagsDword: 0x08c00000,
    controllerFlagsDword: 0x00020040,
    controlWord80: 0x1234,
    defaultVector: [7, 8, 9],
  });

  const installed = state.applyActorLookPointControl({
    actorTag: "HATO",
    selector: 15,
    targetVector: [0x42f20000, 0x3fcccccd, 0xc2a00000],
    mode: 0,
  });
  assert.equal(installed.path, "full-lkpt-install");
  assert.equal(installed.mappedSelectorWord, 0x8066);
  assert.equal(installed.state.actorFlagsDword, 0x4000);
  assert.equal(installed.state.controllerFlagsDword, 0x00200000);
  assert.equal(installed.state.controlWord80, 0);
  assert.deepEqual(installed.state.record, {
    available: true,
    vector: [0x42f20000, 0x3fcccccd, 0xc2a00000],
    selectorWord12: 0,
    selectorWord14: 0,
    activeDword: 1,
    auxiliaryDword: 0,
  });

  const released = state.applyActorLookPointControl({
    actorTag: "HATO",
    selector: -16,
    targetVector: null,
    mode: 0,
  });
  assert.equal(released.path, "full-lkpt-release");
  assert.equal(released.mappedSelectorWord, 0x8068);
  assert.equal(released.state.selectorWord, 0x8068);
  assert.equal(released.state.controllerFlagsDword, 0x00200040);
  assert.equal(released.state.record.activeDword, 0);
  assert.deepEqual(released.state.record.vector, [7, 8, 9]);
});

test("retains exact active mode flag mutations and fails closed off-map", () => {
  const state = createNativeSceneGameplayState();
  state.configureActorLookPointState({
    actorTag: "HATO",
    actorAvailable: true,
    controllerAvailable: true,
  });
  const offMap = state.applyActorLookPointControl({
    actorTag: "HATO",
    selector: 22,
    targetVector: null,
    mode: 0,
  });
  assert.equal(offMap.reason, "actor-look-point-selector-map-unavailable");

  const modeThree = state.applyActorLookPointControl({
    actorTag: "HATO",
    selector: 15,
    targetVector: null,
    mode: 3,
  });
  assert.equal(modeThree.state.actorFlagsDword, 0x00c04000);
  assert.equal(modeThree.state.controllerFlagsDword, 0x00220000);
});
