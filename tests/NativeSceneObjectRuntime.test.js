import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeSceneObjectSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function indexedQueryAction({
  selector,
  flags,
  destination = 0x3000,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-indexed-vector-query",
    callFileOffset: "0x104",
    arguments: [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: "AKIR",
      },
      { kind: "constant", value: selector },
      { kind: "static-pointer", value: destination },
      { kind: "constant", value: flags },
    ],
  };
}

function executor() {
  return createNativeEventOperationExecutor({
    handlers: createNativeSceneObjectSemanticHandlers(),
  });
}

test("writes the exact native direct scale vector from operation 0x0027", async () => {
  const state = createNativeSceneGameplayState();
  const words = [0x3fb33333, 0x3f800000, 0x3f000000];
  const result = await executor()({
    kind: "engineOperation",
    semanticId: "resolved-object-scale-vector-write",
    callFileOffset: "0x43d2",
    arguments: [
      { kind: "constant", value: 0x30494f4b, ascii: "KOI0" },
      { kind: "frame-address", offset: 28 },
    ],
  }, {
    ...createNativeSceneFieldRuntimeContext(state),
    readFrameField: offset => words[(offset - 28) / 4],
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(state.readObjectScaleVector("KOI0"), words);
  assert.deepEqual(result.mutation, {
    kind: "object-scale-vector",
    objectTag: "KOI0",
    words,
    source: { functionFileOffset: undefined, callFileOffset: "0x43d2" },
  });
});

test("replaces the exact selected associated secondary-vector components", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector(
    "AKIR",
    [0x3f800000, 0x40000000, 0x40400000],
    { associated: true },
  );
  state.writeObjectSecondaryVector(
    "AKIR",
    [1, 2, 3],
    { associated: true },
  );
  const source = new Map([
    [0xec, 0x40800000],
    [0xf0, 0x40a00000],
    [0xf4, 0x40c00000],
  ]);
  const result = await executor()({
    kind: "engineOperation",
    semanticId: "resolved-object-vector-operation",
    callFileOffset: "0x7fc18",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: 0x78000000 },
      { kind: "scene-address", offset: 0xec },
      { kind: "constant", value: 0 },
    ],
  }, {
    ...createNativeSceneFieldRuntimeContext(state),
    readSceneField: offset => source.get(offset),
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(
    state.readObjectSecondaryVector("AKIR", { associated: true }),
    [0x40800000, 0x40a00000, 0x40c00000],
  );
  assert.deepEqual(
    state.readObjectVector("AKIR", { associated: true }),
    [0x3f800000, 0x40000000, 0x40400000],
  );
  assert.deepEqual(result.mutation.next, [
    0x40800000,
    0x40a00000,
    0x40c00000,
  ]);
});

test("keeps integer secondary vectors separate from float position vectors", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector(
    "AKIR",
    [0x3f800000, 0x40000000, 0x40400000],
  );
  state.writeObjectSecondaryVector("AKIR", [0xffffffff, 2, 3]);
  assert.deepEqual(state.applyObjectVectorOperation({
    objectTag: "AKIR",
    flags: 0xa0000000,
    vector: [2, 0x40a00000, 0x40c00000],
  }), [1, 2, 3]);
  assert.deepEqual(state.readObjectVector("AKIR"), [
    0x3f800000,
    0x40000000,
    0x40400000,
  ]);
  assert.deepEqual(state.readObjectSecondaryVector("AKIR"), [1, 2, 3]);
  assert.throws(() => state.applyObjectVectorOperation({
    objectTag: "AKIR",
    flags: 0x04200000,
    vector: [0, 0, 0],
  }), /angular-vector operation/);
});

test("fully replaced secondary vectors do not require an invented initial pose", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(state.applyObjectVectorOperation({
    objectTag: "CATM",
    flags: 0x38000000,
    vector: [0, 0x00004000, 0],
  }), [0, 0x00004000, 0]);
  assert.throws(() => state.applyObjectVectorOperation({
    objectTag: "MISS",
    flags: 0x20000000,
    vector: [1, 0, 0],
  }), /secondary vector.*unavailable/);
});

test("copies an exact associated MOTM component matrix translation", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: true,
    componentVectors: [{
      selector: 4,
      vector: [0x3f800000, 0x40000000, 0x40400000],
    }],
  });
  const result = await executor()(
    indexedQueryAction({ selector: 4, flags: 0x40000000 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    objectTag: "AKIR",
    selector: 4,
    associated: true,
    vectorSource: "motm-component",
    destination: 0x3000,
    vector: [0x3f800000, 0x40000000, 0x40400000],
  });
  assert.deepEqual(
    state.readNativeVector(0x3000),
    [0x3f800000, 0x40000000, 0x40400000],
  );
});

test("applies the exact direct-object point transform after a MOTM match", async () => {
  const state = createNativeSceneGameplayState();
  const transformInputs = [];
  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: true,
    componentVectors: [{
      selector: 5,
      vector: [0x40800000, 0x40a00000, 0x40c00000],
    }],
  });
  state.configureObjectDirectPointTransform({
    objectTag: "AKIR",
    available: true,
    transformPoint: vector => {
      transformInputs.push(vector);
      return [0x3f800000, 0x40000000, 0x40400000];
    },
  });
  const result = await executor()(
    indexedQueryAction({ selector: 5, flags: 0 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(transformInputs, [[
    0x40800000,
    0x40a00000,
    0x40c00000,
  ]]);
  assert.deepEqual(
    state.readNativeVector(0x3000),
    [0x3f800000, 0x40000000, 0x40400000],
  );
});

test("uses the native base-vector fallback for a missing MOTM match", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector(
    "AKIR",
    [0x40800000, 0x40a00000, 0x40c00000],
    { associated: true },
  );
  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: true,
    componentVectors: [],
  });
  const result = await executor()(
    indexedQueryAction({ selector: 18, flags: 0x40000000 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.mutation.vectorSource, "base-fallback");
  assert.deepEqual(
    state.readNativeVector(0x3000),
    [0x40800000, 0x40a00000, 0x40c00000],
  );

  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: false,
  });
  const missingRecord = await executor()(
    indexedQueryAction({
      selector: 33,
      flags: 0x40000000,
      destination: 0x3010,
    }),
    createNativeSceneFieldRuntimeContext(state),
  );
  assert.equal(missingRecord.mutation.vectorSource, "base-fallback");
  assert.deepEqual(
    state.readNativeVector(0x3010),
    [0x40800000, 0x40a00000, 0x40c00000],
  );
});

test("a frame-sourced minus-one selector takes the native base path", async () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector(
    "AKIR",
    [0x3f800000, 0x40000000, 0x40400000],
    { associated: true },
  );
  const action = indexedQueryAction({ flags: 0x40000000 });
  action.arguments[1] = { kind: "frame-field", offset: 12 };
  const result = await executor()(action, {
    ...createNativeSceneFieldRuntimeContext(state),
    readFrameField: offset => offset === 12 ? 0xffffffff : undefined,
  });

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.selector, -1);
  assert.equal(result.mutation.vectorSource, "base");
  assert.deepEqual(
    state.readNativeVector(0x3000),
    [0x3f800000, 0x40000000, 0x40400000],
  );
});

test("the native direct-space query writes zero when MOTM is absent", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: false,
  });
  const result = await executor()(
    indexedQueryAction({ selector: 12, flags: 0x01000000 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.vectorSource, "zero-fallback");
  assert.equal(result.mutation.zeroFallback, true);
  assert.deepEqual(state.readNativeVector(0x3000), [0, 0, 0]);
});

test("preserves a matched vector when the native direct transform pointer is null", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: true,
    componentVectors: [{
      selector: 2,
      vector: [1, 2, 3],
    }],
  });
  state.configureObjectDirectPointTransform({
    objectTag: "AKIR",
    available: false,
  });
  const result = await executor()(
    indexedQueryAction({ selector: 2, flags: 0 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(state.readNativeVector(0x3000), [1, 2, 3]);
});

test("stops without a write when exact MOTM or transform state is unknown", async () => {
  const state = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(state);

  assert.deepEqual(await executor()(
    indexedQueryAction({ selector: 4, flags: 0x40000000 }),
    context,
  ), {
    status: "stopped",
    reason: "scene-object-motm-state-unavailable",
  });
  assert.equal(state.readNativeVector(0x3000), undefined);

  state.configureObjectMotmRecord({
    objectTag: "AKIR",
    available: true,
    componentVectors: [{
      selector: 4,
      vector: [1, 2, 3],
    }],
  });
  assert.deepEqual(await executor()(
    indexedQueryAction({ selector: 4, flags: 0 }),
    context,
  ), {
    status: "stopped",
    reason: "scene-object-direct-transform-unavailable",
  });
  assert.equal(state.readNativeVector(0x3000), undefined);
});
