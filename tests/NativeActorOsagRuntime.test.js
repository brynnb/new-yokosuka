import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorOsagSemanticHandlers,
} from "../play/events/NativeActorOsagRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(actorTag = "AKIR") {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "actor-osag-node-byte-and-flag-set",
    callFileOffset: "0x204",
    arguments: [{
      kind: "constant",
      value: (
        actorTag.charCodeAt(0)
        | (actorTag.charCodeAt(1) << 8)
        | (actorTag.charCodeAt(2) << 16)
        | (actorTag.charCodeAt(3) << 24)
      ) >>> 0,
      ascii: actorTag,
    }],
  };
}

test("updates every OSAG node byte and exact controller flag mask", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorOsagState({
    actorTag: "AKIR",
    available: true,
    osagNodeBytes: [0x00, 0x4a, 0xff],
    controllerFlagByte: 0x21,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorOsagSemanticHandlers(),
  });
  const result = await execute(
    action(),
    createNativeSceneFieldRuntimeContext(state),
  );
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readActorOsagState("AKIR"), {
    available: true,
    osagNodeBytes: [0x80, 0x8a, 0x8f],
    controllerFlagByte: 0x31,
  });
});

test("shares exact controller bit 3 with scripted actor control", () => {
  const state = createNativeSceneGameplayState();
  state.configureActorOsagState({
    actorTag: "AKIR",
    available: true,
    osagNodeBytes: null,
    controllerFlagByte: 0x18,
  });
  assert.equal(state.writeActorControllerFlagBit3({
    actorTag: "AKIR",
    enabled: false,
  }), true);
  assert.equal(state.readActorOsagState("AKIR").controllerFlagByte, 0x10);
  assert.equal(state.writeActorControllerFlagBit3({
    actorTag: "AKIR",
    enabled: true,
  }), true);
  assert.equal(state.readActorOsagState("AKIR").controllerFlagByte, 0x18);
});

test("preserves native no-op paths for missing actor substructures", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorOsagState({
    actorTag: "AKIR",
    available: false,
  });
  state.configureActorOsagState({
    actorTag: "INE_",
    available: true,
    osagNodeBytes: null,
    controllerFlagByte: null,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorOsagSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual((await execute(action("AKIR"), context)).mutation, {
    applied: false,
    reason: "actor-missing",
  });
  assert.deepEqual((await execute(action("INE_"), context)).mutation, {
    applied: false,
    state: {
      available: true,
      osagNodeBytes: null,
      controllerFlagByte: null,
    },
  });
});

test("stops when actor OSAG state has not been established", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorOsagSemanticHandlers(),
  });
  assert.deepEqual(await execute(
    action(),
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState()),
  ), {
    status: "stopped",
    reason: "actor-osag-state-missing",
  });
});
