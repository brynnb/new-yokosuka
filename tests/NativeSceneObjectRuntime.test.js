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

function createObjectAction(selector, nameWord, motionWord = 0) {
  return { kind: "engineOperation", semanticId: "native-named-scene-object-create", callFileOffset: "0x15852",
    arguments: [selector, motionWord, nameWord].map(value => ({ kind: "constant", value })) };
}

test("named-object creation returns its case-preserved name and exact direct constructor state", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const result = await executor()(createObjectAction(1, 0x30726f64), context);
  assert.equal(result.status, "continued");
  assert.equal(result.result, 0x30726f64);
  assert.equal(result.mutation.objectTag, "dor0");
  assert.equal(result.mutation.taskKind, 6, "selector one is constructor category six, not asset/mesh index one");
  assert.deepEqual(scene.readObjectVector("dor0"), [0, 0, 0]);
  assert.deepEqual(scene.objectVectorState.readObjectSecondaryVector("dor0"), [0, 0, 0]);
  assert.deepEqual(scene.objectVectorState.readObjectScaleVector("dor0"), Array(3).fill(0x3f800000));
  assert.equal(scene.readNativeObjectDword5c("dor0").dword5c, 0x85);
  assert.equal(scene.readActorFieldState("dor0").dword7c, 0);
  assert.equal(scene.objectVectorState.readCreatedObject("dor0").modelAttached, false,
    "this state check does not claim that a door model has been installed or rendered");
  assert.equal(scene.readObjectVector("DOR0"), undefined);
});

test("zero names use the native shared counter, collision retry, wrap and transactional ownership", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  scene.configureActorFieldState({ actorTag: " 000", actorAvailable: true });
  const first = await executor()(createObjectAction(0, 0), context);
  assert.equal(first.mutation.objectTag, " 001");
  assert.equal(first.result, 0x31303020);
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 2);
  const saved = scene.snapshot();
  scene.objectVectorState.nativeObjectNameCounter = 999;
  const last = await executor()(createObjectAction(3, 0), context);
  assert.equal(last.mutation.objectTag, " 999");
  assert.equal(last.mutation.taskKind, 8);
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 0);
  scene.restore(saved);
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 2);
  assert.equal(scene.objectVectorState.readCreatedObject(" 999"), null);
  scene.clear();
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 2, "travel clears bindings but not the source-global counter");
  assert.equal(scene.objectVectorState.createdObjects.size, 0);
});

test("literal names shadow rather than rename an existing binding and do not inherit its vectors", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  await executor()(createObjectAction(1, 0x30726f64), context);
  scene.writeObjectVector("dor0", [1, 2, 3]);
  scene.writeObjectVector("dor0", [4, 5, 6], { associated: true });
  scene.configureActorFieldState({ actorTag: "dor0", actorAvailable: true, dwordB8: 123 });
  const repeated = await executor()(createObjectAction(2, 0x30726f64), context);
  assert.equal(repeated.result, 0x30726f64);
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 0);
  assert.equal(scene.objectVectorState.readCreatedObject("dor0").previousBinding.taskKind, 6);
  assert.equal(scene.objectVectorState.readCreatedObject("dor0").taskKind, 7);
  assert.deepEqual(scene.readObjectVector("dor0"), [0, 0, 0]);
  assert.equal(scene.readObjectVector("dor0", { associated: true }), undefined);
  assert.equal(scene.readActorFieldState("dor0").dwordB8, undefined);
});

test("invalid creation and native-name exhaustion cannot leak state or invent a fallback name", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  for (const action of [createObjectAction(4, 0), createObjectAction(1, 0, 1), createObjectAction(1, NaN)]) {
    assert.equal((await executor()(action, context)).status, "stopped");
    assert.equal(scene.objectVectorState.createdObjects.size, 0);
    assert.equal(scene.objectVectorState.nativeObjectNameCounter, 0);
  }
  let queries = 0;
  assert.throws(() => scene.objectVectorState.createNamedSceneObject({ selector: 1, motionWord: 0, nameWord: 0,
    isNameInUse: () => { queries += 1; return true; } }), /namespace is exhausted/);
  assert.equal(queries, 1000);
  assert.equal(scene.objectVectorState.nativeObjectNameCounter, 0);
  assert.equal(scene.objectVectorState.createdObjects.size, 0);
});

test("secondary CPAM installation targets the exact name and publishes the dispatcher's zero result", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  await executor()(createObjectAction(1, 0x30726f64), context);
  const cpam = { kind: "secondaryEngineOperation", semanticId: "native-object-cpam-install", callFileOffset: "0x15882",
    arguments: [{ kind: "constant", value: 0x30726f64 }] };
  const result = await executor()(cpam, context);
  assert.equal(result.status, "continued");
  assert.equal(result.result, 0, "do not leak the C helper's record allocation pointer into the VM");
  assert.equal(result.mutation.objectTag, "dor0");
  assert.equal(result.mutation.recordTag, "CPAM");
  assert.equal(result.mutation.recordBytes, 4);
  assert.equal(result.mutation.floatWord48, 0);
  assert.equal(result.mutation.payloadWord, 0, "the original c0aac90/c1dc970 allocator zero-fills the payload");
  assert.equal(scene.objectVectorState.objectFloat48Words.get("dor0"), 0);
  assert.equal(Object.hasOwn(scene.objectVectorState.cameraParameterRecords.get("dor0")[0], "floatWord48"), false,
    "object +0x48 is shared object state, not a per-record field");
  assert.equal((await executor()(cpam, context)).status, "continued");
  assert.equal(scene.objectVectorState.cameraParameterRecords.get("dor0").length, 2,
    "repeat installation allocates a second source record");
  scene.installCurrentPresentationOwner("dor0");
  assert.equal((await executor()({ ...cpam, arguments: [{ kind: "constant", value: 0 }] }, context)).status, "stopped",
    "zero is a null name, not a fallback to the current owner");
  const saved = scene.snapshot();
  await executor()(createObjectAction(2, 0x30726f64), context);
  assert.equal(scene.objectVectorState.cameraParameterRecords.has("dor0"), false, "new bindings cannot inherit old CPAM ownership");
  assert.equal(scene.objectVectorState.objectFloat48Words.has("dor0"), false);
  scene.restore(saved);
  assert.equal(scene.objectVectorState.cameraParameterRecords.has("dor0"), true);
});

test("missing CPAM targets stop without fabricating a record or null-object no-op", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  for (const word of [0, 0x30726f64, NaN]) {
    const result = await executor()({ kind: "secondaryEngineOperation", semanticId: "native-object-cpam-install",
      arguments: [{ kind: "constant", value: word }] }, context);
    assert.equal(result.status, "stopped");
    assert.equal(scene.objectVectorState.cameraParameterRecords.size, 0);
  }
});

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
