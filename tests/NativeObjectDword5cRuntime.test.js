import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeObjectDword5cSemanticHandlers,
  createNativeObjectDword5cState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";

function fourccWord(value) {
  return value.split("").reduce(
    (word, character, index) => (
      word | character.charCodeAt(0) << (index * 8)
    ),
    0,
  ) >>> 0;
}

function action(objectTag, command) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-dword-5c-bit-6-control",
    arguments: [
      {
        kind: "constant",
        value: fourccWord(objectTag),
        ascii: objectTag,
      },
      { kind: "constant", value: command >>> 0 },
    ],
  };
}

function lowFlagAction(objectTag, command) {
  const value = action(objectTag, command);
  value.semanticId = "resolved-object-dword-5c-low-flags-control";
  return value;
}

function executor() {
  return createNativeEventOperationExecutor({
    handlers: createNativeObjectDword5cSemanticHandlers(),
  });
}

test("operation 0x00f7 returns the old bit before setting it", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0x80000005 });
  const result = await executor()(action("AKIR", 1), {
    nativeObjectDword5cState: state,
  });
  assert.equal(result.result, 0);
  assert.deepEqual(result.mutation, {
    objectTag: "AKIR",
    command: 1,
    objectPresent: true,
    writeRoute: "set",
    changed: true,
  });
  assert.equal(
    state.readObject("AKIR").dword5c,
    0x80000045,
  );
});

test("operation 0x00f7 returns the old bit before clearing it", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0xffffffc0 });
  const result = await executor()(action("AKIR", 0), {
    nativeObjectDword5cState: state,
  });
  assert.equal(result.result, 1);
  assert.equal(result.mutation.writeRoute, "clear");
  assert.equal(state.readObject("AKIR").dword5c, 0xffffff80);
});

test("operation 0x00f7 preserves native missing-object behavior", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "NONE", dword5c: null });
  const result = await executor()(action("NONE", 1), {
    nativeObjectDword5cState: state,
  });
  assert.equal(result.result, 0);
  assert.equal(result.mutation.objectPresent, false);
  assert.equal(result.mutation.changed, false);
  assert.deepEqual(state.readObject("NONE"), {
    objectPresent: false,
    dword5c: null,
    revision: 1,
  });
});

test("operation 0x00f7 leaves the field unchanged for other commands", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0x12345678 });
  const result = await executor()(action("AKIR", 2), {
    nativeObjectDword5cState: state,
  });
  assert.equal(result.result, 1);
  assert.equal(result.mutation.writeRoute, null);
  assert.equal(result.mutation.changed, false);
  assert.equal(state.readObject("AKIR").dword5c, 0x12345678);
});

test("operation 0x00f7 stops on unavailable authoritative state", async () => {
  const state = createNativeObjectDword5cState();
  assert.equal(
    (await executor()(action("AKIR", 1), {})).reason,
    "native-object-dword-5c-runtime-state-missing",
  );
  assert.equal(
    (await executor()(action("AKIR", 1), {
      nativeObjectDword5cState: state,
    })).reason,
    "native-object-dword-5c-state-unavailable",
  );
});

test("operation 0x00f7 plans are revision checked", () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0 });
  const plan = state.planControl({ objectTag: "AKIR", command: 1 });
  state.configureObject({ objectTag: "AKIR", dword5c: 0 });
  assert.throws(() => state.commitControl(plan), /plan is stale/);
});

test("operation 0x00f7 state is exposed through the scene context", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureNativeObjectDword5c({
    objectTag: "GROM",
    dword5c: 0,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);
  const result = await executor()(action("GROM", 1), context);
  assert.equal(result.result, 0);
  assert.equal(scene.readNativeObjectDword5c("GROM").dword5c, 0x40);
});

test("operation 0x004d clears bit zero and advances invalidation state", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0x80000003 });
  const result = await executor()(lowFlagAction("AKIR", 1), {
    nativeObjectDword5cState: state,
  });
  assert.equal(result.status, "continued");
  assert.equal(state.readObject("AKIR").dword5c, 0x80000002);
  assert.equal(state.readInvalidationGeneration(), 1);
  assert.deepEqual(result.mutation, {
    objectTag: "AKIR",
    command: 1,
    objectPresent: true,
    previousDword5c: 0x80000003,
    nextDword5c: 0x80000002,
    invalidationGeneration: 1,
  });
});

test("operation 0x004d preserves command-zero and missing-object routes", async () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 0 });
  state.configureObject({ objectTag: "NONE", dword5c: null });
  await executor()(lowFlagAction("AKIR", 0), {
    nativeObjectDword5cState: state,
  });
  assert.equal(state.readObject("AKIR").dword5c, 2);
  assert.equal(state.readInvalidationGeneration(), 1);
  await executor()(lowFlagAction("NONE", 1), {
    nativeObjectDword5cState: state,
  });
  assert.equal(state.readInvalidationGeneration(), 1);
});

test("operation 0x004d low-flag plans include shared generation ownership", () => {
  const state = createNativeObjectDword5cState();
  state.configureObject({ objectTag: "AKIR", dword5c: 1 });
  state.configureObject({ objectTag: "FUKU", dword5c: 1 });
  const stale = state.planLowFlagControl({ objectTag: "AKIR", command: 1 });
  state.commitLowFlagControl(
    state.planLowFlagControl({ objectTag: "FUKU", command: 1 }),
  );
  assert.throws(
    () => state.commitLowFlagControl(stale),
    /plan is stale/,
  );
});
