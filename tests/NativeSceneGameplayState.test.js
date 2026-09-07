import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeSceneGameplayState,
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeIndexedRecordSemanticHandlers,
} from "../play/events/NativeIndexedRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "../play/events/NativeEventNumericRuntime.js";

function indexedWriteAction(index, value) {
  return {
    kind: "engineOperation",
    semanticId: "indexed-binary-record-write",
    arguments: [
      { kind: "constant", value: index },
      { kind: "constant", value },
    ],
  };
}

function indexedControllerAction(index, selector, value) {
  return {
    kind: "engineOperation",
    semanticId: "indexed-record-controller-write",
    arguments: [
      { kind: "constant", value: index },
      { kind: "constant", value: selector },
      { kind: "constant", value },
    ],
  };
}

test("scene gameplay state preserves exact native bytes and object flags", () => {
  const state = createNativeSceneGameplayState();
  state.writeGlobalByte(0xac);
  state.writeObjectRuntimeFlag("dor0", true);
  state.writeObjectPresentationFlag("dor0", true);
  assert.equal(state.readGlobalByte(), 0xac);
  assert.equal(state.readObjectRuntimeFlag("dor0"), true);
  assert.equal(state.readObjectPresentationFlag("dor0"), true);

  state.clear();
  assert.equal(state.readGlobalByte(), 0);
  assert.equal(state.readObjectRuntimeFlag("dor0"), false);
  assert.equal(state.readObjectPresentationFlag("dor0"), false);
});

test("scene gameplay state rejects invented native values", () => {
  const state = createNativeSceneGameplayState();
  assert.throws(() => state.writeGlobalByte(256), /must be a byte/);
  assert.throws(
    () => state.writeObjectRuntimeFlag("door0", true),
    /four-character/,
  );
  assert.throws(
    () => state.writeObjectPresentationFlag("dor0", 1),
    /must be boolean/,
  );
});

test("scene gameplay state retains exact sparse native fields", () => {
  const state = createNativeSceneGameplayState();
  const handle = { channel: 1 };
  state.writeNativeField({ offset: 0x310, width: 4, value: handle });
  assert.equal(
    state.readNativeField({ offset: 0x310, width: 4 }),
    handle,
  );
  assert.equal(
    state.readNativeField({ offset: 0x314, width: 4 }),
    undefined,
  );
  assert.throws(
    () => state.readNativeField({ offset: 0x310, width: 2 }),
    /width changed/,
  );
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.equal(
    context.readSceneField({ offset: 0x310, width: 4 }),
    handle,
  );
});

test("scene gameplay state stores exact interaction-record field writes", () => {
  const state = createNativeSceneGameplayState();
  state.writeInteractionRecordFields(3, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(
    state.readInteractionRecordFields(3),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(state.readInteractionRecordFields(4), undefined);
});

test("scene gameplay state preserves raw interaction context word 56", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.readInteractionContextWord56(), undefined);
  state.writeInteractionContextWord56(1);
  assert.equal(state.readInteractionContextWord56(), 1);
  state.writeInteractionContextWord56(0);
  assert.equal(state.readInteractionContextWord56(), 0);
});

test("scene gameplay state owns operation-0x0199 globals transactionally", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.readNativeOperation0199StatusByte(), undefined);
  assert.equal(state.writeNativeOperation0199ControlDword(12), undefined);
  assert.equal(state.writeNativeOperation0199ControlDword(15), 12);
  state.configureNativeOperation0199StatusByte(0xfe);
  assert.equal(state.readNativeOperation0199StatusByte(), 0xfe);
  const snapshot = state.snapshot();
  state.writeNativeOperation0199ControlDword(99);
  state.configureNativeOperation0199StatusByte(0);
  state.restore(snapshot);
  assert.equal(state.nativeOperation0199ControlDword, 15);
  assert.equal(state.readNativeOperation0199StatusByte(), 0xfe);
});

test("scene gameplay state owns operation-0x0166 mode-28 global transactionally", () => {
  const state = createNativeSceneGameplayState();
  const snapshot = state.snapshot();
  assert.equal(state.writeNativeOperation0166Mode28GlobalDword(0), undefined);
  assert.equal(state.nativeOperation0166Mode28GlobalDword, 0);
  assert.throws(
    () => state.writeNativeOperation0166Mode28GlobalDword(1),
    /only writes zero/,
  );
  state.restore(snapshot);
  assert.equal(state.nativeOperation0166Mode28GlobalDword, undefined);
});

test("scene gameplay state owns operation-0x0174's dword transactionally", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.nativeOperation0174GlobalDword, undefined);
  assert.equal(state.writeNativeOperation0174GlobalDword(1), undefined);
  const snapshot = state.snapshot();
  assert.equal(state.writeNativeOperation0174GlobalDword(0), 1);
  state.restore(snapshot);
  assert.equal(state.nativeOperation0174GlobalDword, 1);
  assert.throws(
    () => state.writeNativeOperation0174GlobalDword(2),
    /must be zero or one/,
  );
});

test("scene gameplay state consumes operation-0x01bd's dword exactly once", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.consumeNativeOperation01bdGlobalDword(), undefined);
  state.configureNativeOperation01bdGlobalDword(27);
  const snapshot = state.snapshot();
  assert.equal(state.consumeNativeOperation01bdGlobalDword(), 27);
  assert.equal(state.consumeNativeOperation01bdGlobalDword(), -1);
  state.restore(snapshot);
  assert.equal(state.consumeNativeOperation01bdGlobalDword(), 27);
  assert.throws(
    () => state.configureNativeOperation01bdGlobalDword(1.5),
    /must be an integer/,
  );
});

test("scene gameplay state owns operation-0x014f's raw float word transactionally", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.writeNativeOperation014fGlobalFloatWord(0x3ecccccd), undefined);
  const snapshot = state.snapshot();
  state.writeNativeOperation014fGlobalFloatWord(0);
  state.restore(snapshot);
  assert.equal(state.nativeOperation014fGlobalFloatWord, 0x3ecccccd);
});

test("scene gameplay state owns operation-0x0052's indexed table transactionally", () => {
  const state = createNativeSceneGameplayState();
  assert.equal(state.writeNativeOperation0052TableEntry({ index: 32, value: 89 }), undefined);
  const snapshot = state.snapshot();
  assert.equal(state.writeNativeOperation0052TableEntry({ index: 32, value: 7 }), 89);
  state.restore(snapshot);
  assert.equal(state.nativeOperation0052Table.get(32), 89);
});

test("scene gameplay state applies exact object-vector component flags", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("AKIR", [
    0x3f800000,
    0x40000000,
    0x40400000,
  ]);
  assert.deepEqual(state.initializeObjectVector({
    objectTag: "AKIR",
    flags: 0x28000000,
    vector: [0x40800000, 0x40a00000, 0x40c00000],
  }), [
    0x40a00000,
    0x40000000,
    0x41100000,
  ]);
  assert.equal(state.readObjectActivationWord("AKIR"), 1);
  assert.deepEqual(state.readObjectVector("AKIR"), [
    0x40a00000,
    0x40000000,
    0x41100000,
  ]);
});

test("scene gameplay state writes one exact direct-vector component", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector("LIG7", [1, 2, 3]);
  assert.deepEqual(state.writeNativeObjectVectorComponent({
    objectTag: "LIG7", componentIndex: 2, value: 0x3f800000,
  }), { previous: 3, value: 0x3f800000, vector: [1, 2, 0x3f800000] });
  assert.deepEqual(state.readObjectVector("LIG7"), [1, 2, 0x3f800000]);
  assert.equal(state.writeNativeObjectVectorComponent({
    objectTag: "NONE", componentIndex: 2, value: 0,
  }), undefined);
});

test("scene gameplay state keeps associated vectors and pointer storage separate", () => {
  const state = createNativeSceneGameplayState();
  state.writeObjectVector(
    "AKIR",
    [0x3f800000, 0x40000000, 0x40400000],
  );
  state.writeObjectVector(
    "AKIR",
    [0x40800000, 0x40a00000, 0x40c00000],
    { associated: true },
  );
  state.writeNativeVector(0x2000, [1, 2, 3]);
  assert.deepEqual(state.readObjectBaseVector({
    objectTag: "AKIR",
    associated: true,
  }), [0x40800000, 0x40a00000, 0x40c00000]);
  assert.deepEqual(state.readNativeVector(0x2000), [1, 2, 3]);
  assert.throws(() => state.initializeObjectVector({
    objectTag: "MISS",
    flags: 0x38000000,
    vector: [0, 0, 0],
  }), /is unavailable/);
});

test("scene gameplay state preserves exact FACE request record writes", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(state.writeObjectFaceRecordRequest({
    objectTag: "AKIR",
    recordTag: "FACE",
    mode: 0,
    controlWord: 16,
    vector: [0, 0, 0],
    clearsResetDwords: true,
  }), {
    recordTag: "FACE",
    mode: 0,
    modeByte: 0x80,
    controlWord: 16,
    secondaryWord: 0,
    vector: [0, 0, 0],
    resetDwords: [0, 0, 0, 0],
  });
  state.writeObjectFaceRecordRequest({
    objectTag: "AKIR",
    recordTag: "FACE",
    mode: 2,
    controlWord: 30,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    clearsResetDwords: false,
  });
  assert.deepEqual(state.readObjectFaceRecordRequest("AKIR"), {
    recordTag: "FACE",
    mode: 2,
    modeByte: 0x82,
    controlWord: 30,
    secondaryWord: 0,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    resetDwords: [0, 0, 0, 0],
  });
});

test("scene gameplay state rejects invented FACE record modes", () => {
  const state = createNativeSceneGameplayState();
  assert.throws(() => state.writeObjectFaceRecordRequest({
    objectTag: "AKIR",
    recordTag: "FACE",
    mode: 3,
    controlWord: 0,
    vector: [0, 0, 0],
    clearsResetDwords: false,
  }), /must be 0, 1, or 2/);
});

test("scene gameplay state preserves unrelated bits in exact native words", () => {
  const state = createNativeSceneGameplayState();
  state.writeNativeField({
    offset: 0x0c20c3d4,
    width: 4,
    value: 0x81,
  });
  assert.equal(state.writeNativeWordBit({
    address: 0x0c20c3d4,
    mask: 0x20,
    enabled: true,
  }), 0xa1);
  assert.equal(state.writeNativeWordBit({
    address: 0x0c20c3d4,
    mask: 0x20,
    enabled: false,
  }), 0x81);
  assert.throws(() => state.writeNativeWordBit({
    address: 0x1000,
    mask: 0x20,
    enabled: true,
  }), /is unavailable/);
});

test("scene gameplay state tracks exact named-resource operands", () => {
  const state = createNativeSceneGameplayState();
  state.loadNamedResource(0x2000);
  assert.equal(state.hasNamedResource(0x2000), true);
  assert.equal(state.hasNamedResource(0x2004), false);
  state.releaseNamedResource(0x2000);
  assert.equal(state.hasNamedResource(0x2000), false);
});

test("scene gameplay state derives exact signed eight-channel deltas", () => {
  const state = createNativeSceneGameplayState();
  assert.deepEqual(state.writeSceneEightChannelTransition({
    duration: 2,
    endpoints: [[0, 1, 2, 3], [4, 5, 6, 7]],
  }), {
    duration: 2,
    endpoints: [[0, 1, 2, 3], [4, 5, 6, 7]],
    endpointWords: [
      [0, 0x10000, 0x20000, 0x30000],
      [0x40000, 0x50000, 0x60000, 0x70000],
    ],
    deltaWords: [0x20000, 0x20000, 0x20000, 0x20000],
    currentWords: [0, 0x10000, 0x20000, 0x30000],
    packedWord: undefined,
  });
  assert.equal(state.isSceneEightChannelTransitionActive(), true);
  assert.equal(state.advanceSceneEightChannelTransition(), true);
  assert.deepEqual(
    state.readSceneEightChannelTransition().currentWords,
    [0x20000, 0x30000, 0x40000, 0x50000],
  );
  assert.equal(
    state.readSceneEightChannelTransition().packedWord,
    0x02030405,
  );
  assert.equal(state.isSceneEightChannelTransitionActive(), true);
  assert.equal(state.advanceSceneEightChannelTransition(), true);
  assert.deepEqual(
    state.readSceneEightChannelTransition().currentWords,
    [0x40000, 0x50000, 0x60000, 0x70000],
  );
  assert.equal(state.isSceneEightChannelTransitionActive(), false);
  state.writeSceneEightChannelTransition({
    duration: 0,
    endpoints: [[7, 6, 5, 4], [3, 2, 1, 0]],
  });
  assert.equal(state.isSceneEightChannelTransitionActive(), false);
  assert.deepEqual(
    state.readSceneEightChannelTransition().deltaWords,
    [0, 0, 0, 0],
  );
  assert.equal(state.advanceSceneEightChannelTransition(), false);
});

test("scene gameplay state applies exact low-index mirrored binary writes", async () => {
  const state = createNativeSceneGameplayState();
  state.configureIndexedCallbackRecord({ index: 3, classWord: 0 });
  state.configureIndexedCallbackRecord({ index: 5, classWord: 8 });
  const context = createNativeSceneFieldRuntimeContext(state);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });

  assert.equal(
    (await execute(indexedWriteAction(3, 1), context)).status,
    "continued",
  );
  assert.deepEqual(state.readIndexedRecord(3), {
    primaryValue: 1,
    mirrorValue: 1,
    callback: { valueWord: 1, classWord: 0 },
  });
  assert.deepEqual(state.readIndexedRecordBitfields(), {
    classZeroBits: 1 << 3,
    classOneBits: 0,
    combinedBits: 1 << 3,
  });

  await execute(indexedWriteAction(5, 1), context);
  assert.deepEqual(state.readIndexedRecordBitfields(), {
    classZeroBits: 1 << 3,
    classOneBits: 1 << 5,
    combinedBits: (1 << 3) | (1 << 5),
  });

  await execute(indexedWriteAction(3, 0), context);
  assert.deepEqual(state.readIndexedRecordBitfields(), {
    classZeroBits: 0,
    classOneBits: 1 << 5,
    combinedBits: 1 << 5,
  });
});

test("indexed binary writes preserve native bounds and callback prerequisites", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  const missingCallback = await execute(
    indexedWriteAction(3, 1),
    context,
  );
  assert.deepEqual(missingCallback, {
    status: "stopped",
    reason: "indexed-callback-record-unavailable",
  });
  assert.equal(state.readIndexedRecord(3).primaryValue, undefined);

  const primaryOnly = await execute(indexedWriteAction(40, 1), context);
  assert.equal(primaryOnly.status, "continued");
  assert.deepEqual(state.readIndexedRecord(40), {
    primaryValue: 1,
    mirrorValue: undefined,
    callback: undefined,
  });

  const outOfRange = await execute(indexedWriteAction(128, 1), context);
  assert.equal(outOfRange.status, "continued");
  assert.deepEqual(outOfRange.mutation, {
    applied: false,
    reason: "indexed-record-out-of-range",
  });
});

test("indexed controller writes preserve exact +0x04 and +0x40 routes", async () => {
  const callbacks = [];
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 15,
    controlWord: 0x18,
    word40: 0,
    controlWordCallback: detail => callbacks.push(detail),
    word40Callback: detail => callbacks.push(detail),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  assert.equal(
    (await execute(indexedControllerAction(15, 0, 4), context)).status,
    "continued",
  );
  assert.equal(state.readIndexedControllerRecord(15).controlWord, 0x0c);
  assert.equal(state.readIndexedControllerRecord(15).mirrorControlWord, 0x0c);
  await execute(indexedControllerAction(15, 11, 0), context);
  assert.equal(state.readIndexedControllerRecord(15).controlWord, 4);
  await execute(indexedControllerAction(15, 11, 1), context);
  assert.equal(state.readIndexedControllerRecord(15).controlWord, 0x0c);
  await execute(indexedControllerAction(15, 10, 0x12345678), context);
  assert.equal(
    state.readIndexedControllerRecord(15).word40,
    0x12345678,
  );
  assert.equal(
    state.readIndexedControllerRecord(15).mirrorWord40,
    0x12345678,
  );
  assert.deepEqual(callbacks.map(detail => detail.selector), [0, 11, 11, 10]);
});

test("indexed controller writes stop before missing low-index callbacks", async () => {
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 28,
    controlWord: 8,
    word40: 1,
  });
  state.configureIndexedControllerRecord({
    index: 40,
    word40: 1,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  assert.deepEqual(
    await execute(indexedControllerAction(28, 10, 2), context),
    {
      status: "stopped",
      reason: "indexed-controller-word40-callback-unavailable",
    },
  );
  assert.equal(state.readIndexedControllerRecord(28).word40, 1);
  assert.equal(
    (await execute(indexedControllerAction(40, 10, 2), context)).status,
    "continued",
  );
  assert.equal(state.readIndexedControllerRecord(40).word40, 2);
});

test("indexed controller float selectors preserve native word operations", async () => {
  const callbacks = [];
  const sources = new Map([
    [0x1000, [0x3f800000, 0x358637bd, 0xbf800000, 0x40000000]],
    [0x2000, [0x3c000000]],
    [0x3000, [0x3f800000, 0xbf000000, 0]],
  ]);
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 7,
    floatWord1c: 0x40000000,
    floatWord20: 0x3a83126f,
    floatWords08Callback: detail => callbacks.push(detail),
    floatWord18Callback: detail => callbacks.push(detail),
    floatWord1cCallback: detail => callbacks.push(detail),
    floatProductCallback: detail => callbacks.push(detail),
    vector52WordsCallback: detail => callbacks.push(detail),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers({
      readNativeWords(pointer, count) {
        return sources.get(pointer)?.slice(0, count);
      },
    }),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  await execute(indexedControllerAction(7, 2, 0x1000), context);
  assert.deepEqual(state.readIndexedControllerRecord(7).floatWords08, [
    0x3f800000,
    0,
    0,
    0x40000000,
  ]);
  assert.deepEqual(
    state.readIndexedControllerRecord(7).mirrorFloatWords08,
    [0x3f800000, 0, 0, 0x40000000],
  );

  await execute(indexedControllerAction(7, 4, 0x358637bd), context);
  assert.equal(
    state.readIndexedControllerRecord(7).floatWord18,
    0x358637bd,
  );
  assert.equal(callbacks.at(-1).value, 0);

  const selectorFive = await execute(
    indexedControllerAction(7, 5, 0x3a83126f),
    context,
  );
  assert.equal(
    state.readIndexedControllerRecord(7).floatWord1c,
    0x3c23d70b,
  );
  assert.equal(
    state.readIndexedControllerRecord(7).floatWord20,
    0x3c23d70b,
  );
  assert.equal(
    nativeFloat32FromWord(selectorFive.mutation.callbackValue),
    Math.fround(
      nativeFloat32FromWord(0x3c23d70b)
      * nativeFloat32FromWord(0x3c23d70b),
    ),
  );

  const selectorSix = await execute(
    indexedControllerAction(7, 6, 0x2000),
    context,
  );
  assert.equal(
    state.readIndexedControllerRecord(7).floatWord20,
    0x3c23d70b,
  );
  assert.equal(
    selectorSix.mutation.callbackValue,
    nativeFloat32Word(Math.fround(
      nativeFloat32FromWord(0x3c23d70b)
      * nativeFloat32FromWord(0x3c23d70b),
    )),
  );
  assert.deepEqual(
    callbacks.map(detail => detail.selector),
    [2, 4, 5, 5, 6],
  );

  const selectorEight = await execute(
    indexedControllerAction(7, 8, 0x3000),
    context,
  );
  assert.deepEqual(
    state.readIndexedControllerRecord(7).vector52Words,
    sources.get(0x3000),
  );
  assert.deepEqual(selectorEight.mutation.callbackValue, [
    0xbf800000,
    0x3f000000,
    0x80000000,
  ]);
  assert.equal(callbacks.at(-1).selector, 8);
});

test("indexed controller vector writes read exact frame-address words", async () => {
  const callbacks = [];
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 1,
    floatWords08Callback: detail => callbacks.push(detail),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const frame = new Map([
    [24, 0x3f800000],
    [28, 0x358637bd],
    [32, 0xbf800000],
    [36, 0x40000000],
  ]);
  const result = await execute({
    kind: "engineOperation",
    operationId: 0x0066,
    adapterStatus: "proven",
    semanticId: "indexed-record-controller-write",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 2 },
      { kind: "frame-address", offset: 24 },
    ],
  }, {
    ...createNativeSceneFieldRuntimeContext(state),
    readFrameField: offset => frame.get(offset),
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(state.readIndexedControllerRecord(1).floatWords08, [
    0x3f800000,
    0,
    0,
    0x40000000,
  ]);
  assert.equal(callbacks.length, 1);
});

test("indexed controller scalar writes resolve exact frame-field words", async () => {
  const callbacks = [];
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 1,
    floatWord18Callback: detail => callbacks.push(detail),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const result = await execute({
    kind: "engineOperation",
    operationId: 0x0066,
    adapterStatus: "proven",
    semanticId: "indexed-record-controller-write",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 4 },
      { kind: "frame-field", offset: 24 },
    ],
  }, {
    ...createNativeSceneFieldRuntimeContext(state),
    readFrameField: offset => (
      offset === 24 ? 0x3f400000 : undefined
    ),
  });

  assert.equal(result.status, "continued");
  assert.equal(
    state.readIndexedControllerRecord(1).floatWord18,
    0x3f400000,
  );
  assert.equal(callbacks.at(-1).value, 0x3f400000);
});

test("indexed controller pointer selectors fail closed without exact words", async () => {
  const state = createNativeSceneGameplayState();
  state.configureIndexedControllerRecord({
    index: 40,
    floatWord1c: 0x3f800000,
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const missingReader = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  assert.deepEqual(
    await missingReader(indexedControllerAction(40, 6, 0x2000), context),
    {
      status: "stopped",
      reason: "native-word-reader-missing",
    },
  );
  const missingWords = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers({
      readNativeWords() {},
    }),
  });
  assert.deepEqual(
    await missingWords(indexedControllerAction(40, 2, 0x1000), context),
    {
      status: "stopped",
      reason: "native-word-source-unavailable",
    },
  );
});
