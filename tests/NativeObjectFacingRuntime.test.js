import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeObjectFacingSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function fourcc(value) {
  return (
    value.charCodeAt(0)
    | value.charCodeAt(1) << 8
    | value.charCodeAt(2) << 16
    | value.charCodeAt(3) << 24
  ) >>> 0;
}

function words(values) {
  return values.map(nativeFloat32Word);
}

function action(target = {
  kind: "static-pointer",
  value: 0x5000,
  staticWords: words([11, 5, 20]),
}) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "resolved-object-world-point-heading-write",
    callFileOffset: "0x2bf3a",
    arguments: [
      { kind: "constant", value: fourcc("AKIR"), ascii: "AKIR" },
      { kind: "constant", value: 0x38000000 },
      target,
      { kind: "constant", value: 0 },
    ],
  };
}

function executor(adapters = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeObjectFacingSemanticHandlers(adapters),
  });
}

test("operation 0x001e replaces direct secondary orientation toward a world point", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("AKIR", words([10, 2, 20]));
  state.writeObjectSecondaryVector("AKIR", [1, 2, 3]);
  const result = await executor()(
    action(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.result, 0);
  assert.equal(result.mutation.heading, 0xc000);
  assert.deepEqual(result.mutation.vector, [0, 0xc000, 0]);
  assert.deepEqual(state.readObjectSecondaryVector("AKIR"), [0, 0xc000, 0]);
  assert.deepEqual(state.readObjectVector("AKIR"), words([10, 2, 20]));
  assert.deepEqual(
    state.readPresentationMutations(2).mutations.map(item => item.kind),
    ["object-secondary-vector"],
  );
});

test("operation 0x001e reads exact frame-address targets and dynamic tags", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("AKIR", words([0, 0, 0]));
  const frame = new Map([
    [0x08, fourcc("AKIR")],
    [0x20, nativeFloat32Word(0)],
    [0x24, nativeFloat32Word(7)],
    [0x28, nativeFloat32Word(1)],
  ]);
  const value = action({ kind: "frame-address", offset: 0x20 });
  value.arguments[0] = {
    kind: "frame-field",
    offset: 0x08,
    width: 4,
    signedLoad: false,
  };
  const result = await executor()(value, {
    ...createNativeSceneFieldRuntimeContext(state),
    location: { functionId: "0x2becc" },
    readFrameField: offset => frame.get(offset),
  });

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.heading, 0x8000);
  assert.deepEqual(state.readObjectSecondaryVector("AKIR"), [0, 0x8000, 0]);
});

test("operation 0x001e fails closed before unproved forms or missing state", async () => {
  const invalidFlags = action();
  invalidFlags.arguments[1].value = 0x78000000;
  assert.equal(
    (await executor()(invalidFlags, {})).reason,
    "resolved-object-heading-form-unproved",
  );

  assert.equal(
    (await executor()(action(), {})).reason,
    "scene-object-base-vector-reader-missing",
  );

  const state = createNativeSceneGameplayState();
  assert.match(
    (await executor()(
      action(),
      createNativeSceneFieldRuntimeContext(state),
    )).reason,
    /direct position for AKIR/,
  );

  state.writeObjectVector("AKIR", words([0, 0, 0]));
  assert.equal(
    (await executor({
      applySceneObjectVectorOperation: undefined,
    })(action(), {
      readSceneObjectBaseVector: detail => state.readObjectBaseVector(detail),
    })).reason,
    "scene-object-vector-operation-adapter-missing",
  );
});
