import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorFieldSemanticHandlers,
} from "../play/events/NativeActorFieldRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(actorTag, mode) {
  return {
    semanticId: "resolved-actor-dword-7c-access",
    callFileOffset: "0x100",
    arguments: [
      { kind: "constant", value: 0, ascii: actorTag },
      { kind: "constant", value: mode },
    ],
  };
}

function objectAction(actorTag, mode, value) {
  return {
    semanticId: "resolved-object-b8-bc-control",
    callFileOffset: "0x200",
    arguments: [
      actorTag === null
        ? { kind: "constant", value: 0 }
        : { kind: "constant", value: 0, ascii: actorTag },
      { kind: "constant", value: mode },
      { kind: "constant", value },
    ],
  };
}

test("operation 0x0121 writes and reads exact actor dword +0x7c", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorFieldState({
    actorTag: "AKIR",
    actorAvailable: true,
    dword7c: 9,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const written = await execute(action("AKIR", 4), context);
  assert.equal(written.result, 4);
  assert.equal(written.mutation.previous, 9);
  assert.equal((await execute(action("AKIR", 11), context)).result, 4);
});

test("operation 0x0121 resolves presence for writes without guessing old state", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers({
      resolveActorFieldState: () => ({ actorAvailable: true }),
    }),
  });
  const result = await execute(
    action("HARY", 2),
    createNativeSceneFieldRuntimeContext(state),
  );
  assert.equal(result.status, "continued");
  assert.equal(result.result, 2);
  assert.deepEqual(state.readActorFieldState("HARY"), {
    actorAvailable: true,
    dword7c: 2,
  });
});

test("operation 0x0121 keeps an unknown authored read result unavailable", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorFieldState({ actorTag: "AKIR", actorAvailable: true });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers(),
  });
  assert.deepEqual(await execute(
    action("AKIR", 11),
    createNativeSceneFieldRuntimeContext(state),
  ), {
    status: "continued",
    resultUnavailable: "actor-dword-7c-value-unavailable",
  });
});

test("operation 0x0118 preserves exact bit set, clear, and prior results", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorFieldState({
    actorTag: "AKIR",
    actorAvailable: true,
    dwordB8: 0b1010,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.equal((await execute(objectAction("AKIR", 1, 0), context)).result, 0);
  assert.equal((await execute(objectAction("AKIR", 0, 1), context)).result, 1);
  assert.equal(state.readActorFieldState("AKIR").dwordB8, 0b1001);
});

test("operation 0x0118 prefix mode replaces object or global flags exactly", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorFieldState({ actorTag: "AKIR", actorAvailable: true });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.equal(
    (await execute(objectAction("AKIR", 2, 4), context)).mutation.value,
    0x0f,
  );
  assert.equal(
    (await execute(objectAction(null, 2, 3), context)).mutation.value,
    0x07,
  );
  assert.equal(state.readObjectFieldGlobalFallback().dwordB8, 0x07);
});

test("operation 0x0118 routes missing objects to the exact global fallback", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers({
      resolveObjectFieldState: () => ({ actorAvailable: false }),
    }),
  });
  const result = await execute(
    objectAction("HRSK", 3, 0x41f00000),
    createNativeSceneFieldRuntimeContext(state),
  );
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.targetKind, "global");
  assert.equal(state.readObjectFieldGlobalFallback().floatWordBc, 0x41f00000);
});

test("operation 0x0118 refuses bit mutation without exact prior flags", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorFieldState({ actorTag: "AKIR", actorAvailable: true });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorFieldSemanticHandlers(),
  });
  assert.deepEqual(await execute(
    objectAction("AKIR", 1, 1),
    createNativeSceneFieldRuntimeContext(state),
  ), {
    status: "stopped",
    reason: "object-dword-b8-state-unavailable",
  });
});
