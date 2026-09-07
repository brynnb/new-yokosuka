import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCameraAuxiliarySemanticHandlers,
  createNativeEventOperationExecutor,
  createNativeFogTableSemanticHandlers,
  createNativeScrollSpriteSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(semanticId, arguments_) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    callFileOffset: "0x26c10",
    arguments: arguments_,
  };
}

function field(state, offset) {
  return state.readNativeField({ offset, width: 4 });
}

test("operation 0x0173 mode zero resets exact camera auxiliary globals", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeCameraAuxiliarySemanticHandlers(),
  });
  const result = await execute(action("camera-auxiliary-state-reset", [
    { kind: "constant", value: 0 },
  ]), createNativeSceneFieldRuntimeContext(state));

  assert.equal(result.status, "continued");
  assert.deepEqual(
    [0x0c201b20, 0x0c201b24, 0x0c201b28].map(offset => field(state, offset)),
    [0x3f800000, 0x3f800000, 0x3f800000],
  );
  assert.deepEqual(
    [0x0c201b2c, 0x0c201b30, 0x0c201b34].map(offset => field(state, offset)),
    [0x3f800000, 0x3f800000, 0x3f800000],
  );
  assert.equal(field(state, 0x0c201b38), 0);
  assert.deepEqual(
    [0x0c201b3c, 0x0c201b40, 0x0c201b44].map(offset => field(state, offset)),
    [0, 0, 0],
  );
});

test("operation 0x0173 mode zero rejects other modes and missing state", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeCameraAuxiliarySemanticHandlers(),
  });
  assert.equal((await execute(action("camera-auxiliary-state-reset", [
    { kind: "constant", value: 1 },
  ]), {})).reason, "camera-auxiliary-reset-form-unproved");
  assert.equal((await execute(action("camera-auxiliary-state-reset", [
    { kind: "constant", value: 0 },
  ]), {})).reason, "camera-auxiliary-state-writer-missing");
});

test("operation 0x0049 retains exact fog-table inputs and enable state", async () => {
  const state = createNativeSceneGameplayState();
  const words = [0x4161999a, 0x44480000, 0x3ef5c28f, 0x7f9fd1ff];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFogTableSemanticHandlers(),
  });
  const result = await execute(action(
    "native-fog-table-configuration-write",
    [{ kind: "static-pointer", value: 0x517dc, staticWords: words }],
  ), createNativeSceneFieldRuntimeContext(state));

  assert.equal(result.status, "continued");
  assert.deepEqual(
    [0x0c20bc44, 0x0c20bc48, 0x0c20bc4c, 0x0c20bc50]
      .map(offset => field(state, offset)),
    words,
  );
  assert.equal(field(state, 0x0c20bc54), 1);
  assert.deepEqual(result.mutation.floatInputWords, words.slice(0, 3));
  assert.equal(result.mutation.packedColorWord, words[3]);
});

test("operation 0x0049 accepts exact frame-backed words and fails closed", async () => {
  const state = createNativeSceneGameplayState();
  const words = [1, 2, 3, 4];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFogTableSemanticHandlers(),
  });
  const result = await execute(action(
    "native-fog-table-configuration-write",
    [{ kind: "frame-address", offset: 0x20 }],
  ), {
    ...createNativeSceneFieldRuntimeContext(state),
    readFrameField: offset => words[(offset - 0x20) / 4],
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(
    [0x0c20bc44, 0x0c20bc48, 0x0c20bc4c, 0x0c20bc50]
      .map(offset => field(state, offset)),
    words,
  );
  assert.equal((await execute(action(
    "native-fog-table-configuration-write",
    [{ kind: "static-pointer", value: 0x10 }],
  ), {})).reason, "native-fog-table-configuration-unavailable");
});

test("operation 0x006f mode zero writes exact SCRL packed-color slots", async () => {
  const state = createNativeSceneGameplayState();
  const words = [0, 0, 0xbb00663c, 0xbb00663c];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeScrollSpriteSemanticHandlers(),
  });
  const result = await execute(action(
    "scroll-sprite-packed-color-slots-write",
    [
      { kind: "constant", value: 0 },
      { kind: "static-pointer", value: 0x517ec, staticWords: words },
    ],
  ), createNativeSceneFieldRuntimeContext(state));

  assert.equal(result.status, "continued");
  assert.deepEqual(
    [0x0c1f7118, 0x0c1f711c, 0x0c1f7120, 0x0c1f7124]
      .map(offset => field(state, offset)),
    words,
  );
  assert.deepEqual(result.mutation.packedColorWords, words);
});

test("operation 0x006f keeps nonzero modes and missing sources unresolved", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeScrollSpriteSemanticHandlers(),
  });
  assert.equal((await execute(action(
    "scroll-sprite-packed-color-slots-write",
    [
      { kind: "constant", value: 2 },
      { kind: "constant", value: 0 },
    ],
  ), {})).reason, "scroll-sprite-color-write-form-unproved");
  assert.equal((await execute(action(
    "scroll-sprite-packed-color-slots-write",
    [
      { kind: "constant", value: 0 },
      { kind: "frame-address", offset: 0 },
    ],
  ), { readFrameField: () => undefined })).reason,
  "scroll-sprite-color-source-unavailable");
});
