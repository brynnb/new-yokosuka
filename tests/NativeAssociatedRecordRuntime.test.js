import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeAssociatedRecordSemanticHandlers,
} from "../play/events/NativeAssociatedRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(
  arguments_,
  semanticId = "resolved-object-face-record-request",
) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId,
    callFileOffset: "0x204",
    arguments: arguments_,
  };
}

function floatWord(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, Math.fround(value), true);
  return view.getUint32(0, true);
}

test("sets and clears exact MOMT flags-word bit zero", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtFlagState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    flagsWord: 0x20,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const actor = {
    kind: "constant",
    value: 0x52494b41,
    ascii: "AKIR",
  };
  assert.equal((await execute(action([
    actor,
    { kind: "constant", value: 1 },
  ], "actor-momt-flag-bit-0"), context)).status, "continued");
  assert.equal(state.readActorMomtFlagState("AKIR").flagsWord, 0x21);
  assert.equal((await execute(action([
    actor,
    { kind: "constant", value: 0 },
  ], "actor-momt-flag-bit-0"), context)).status, "continued");
  assert.equal(state.readActorMomtFlagState("AKIR").flagsWord, 0x20);
  assert.equal((await execute(action([
    actor,
    { kind: "constant", value: 1 },
    { kind: "constant", value: 0x80 },
  ], "actor-momt-mask-control"), context)).status, "continued");
  assert.equal(state.readActorMomtFlagState("AKIR").flagsWord, 0xa0);
  assert.equal((await execute(action([
    actor,
    { kind: "constant", value: 2 },
    { kind: "constant", value: 0x80 },
  ], "actor-momt-mask-control"), context)).status, "continued");
  assert.equal(state.readActorMomtFlagState("AKIR").flagsWord, 0x20);
});

test("MOMT flag writes fail closed without an exact actor record", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const state = createNativeSceneGameplayState();
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 1 },
  ], "actor-momt-flag-bit-0"), (
    createNativeSceneFieldRuntimeContext(state)
  )), {
    status: "stopped",
    reason: "actor-momt-flag-state-unavailable",
  });
});

test("writes and queries the exact signed MOMT byte at +0x6f", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtByte6fState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    value: 0,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const actor = {
    kind: "constant",
    value: 0x52494b41,
    ascii: "AKIR",
  };
  assert.equal((await execute(action([
    actor,
    { kind: "constant", value: 0xfe },
    { kind: "constant", value: 0 },
  ], "actor-momt-byte-6f-control"), context)).status, "continued");
  const query = await execute(action([
    actor,
    { kind: "constant", value: 0 },
    { kind: "constant", value: 1 },
  ], "actor-momt-byte-6f-control"), context);
  assert.equal(query.status, "continued");
  assert.equal(query.result, -2);
  assert.deepEqual(state.readActorMomtByte6fState("AKIR"), {
    actorAvailable: true,
    momtAvailable: true,
    value: 0xfe,
  });
});

test("MOMT byte writes may resolve exact actor presence on demand", async () => {
  const state = createNativeSceneGameplayState();
  const resolutions = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers({
      resolveActorMomtByte6fState(detail) {
        resolutions.push(detail);
        return { actorAvailable: true, momtAvailable: true };
      },
    }),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const result = await execute(action([
    { kind: "constant", value: 0x594e4f54, ascii: "TONY" },
    { kind: "constant", value: 3 },
    { kind: "constant", value: 0 },
  ], "actor-momt-byte-6f-control"), context);

  assert.equal(result.status, "continued");
  assert.deepEqual(resolutions, [{ objectTag: "TONY", query: false }]);
  assert.deepEqual(state.readActorMomtByte6fState("TONY"), {
    actorAvailable: true,
    momtAvailable: true,
    value: 3,
  });
});

test("MOMT byte writes resolve a field missing from an existing MOMT state", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtFlagState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    flagsWord: 0,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers({
      resolveActorMomtByte6fState: () => ({
        actorAvailable: true,
        momtAvailable: true,
      }),
    }),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 7 },
    { kind: "constant", value: 0 },
  ], "actor-momt-byte-6f-control"), createNativeSceneFieldRuntimeContext(state));
  assert.equal(result.status, "continued");
  assert.equal(state.readActorMomtByte6fState("AKIR").value, 7);
});

test("MOMT byte queries still fail closed without an exact initial byte", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers({
      resolveActorMomtByte6fState: () => ({
        actorAvailable: true,
        momtAvailable: true,
      }),
    }),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x594e4f54, ascii: "TONY" },
    { kind: "constant", value: 0 },
    { kind: "constant", value: 1 },
  ], "actor-momt-byte-6f-control"), context), {
    status: "stopped",
    reason: "actor-momt-byte-6f-state-unavailable",
  });
});

test("writes exact FACE request fields for modes zero and one", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers({
      writeResolvedObjectFaceRecord: detail => writes.push(detail),
    }),
  });
  const target = {
    kind: "constant",
    value: 0x52494b41,
    ascii: "AKIR",
  };
  assert.deepEqual(await execute(action([
    target,
    { kind: "constant", value: 0 },
  ])), { status: "continued" });
  assert.deepEqual(await execute(action([
    target,
    { kind: "constant", value: 1 },
    { kind: "constant", value: 0x12345 },
  ])), { status: "continued" });
  assert.deepEqual(writes.map(({
    objectTag,
    recordTag,
    mode,
    modeByte,
    controlWord,
    secondaryWord,
    vector,
    vectorPointer,
    clearsResetDwords,
  }) => ({
    objectTag,
    recordTag,
    mode,
    modeByte,
    controlWord,
    secondaryWord,
    vector,
    vectorPointer,
    clearsResetDwords,
  })), [
    {
      objectTag: "AKIR",
      recordTag: "FACE",
      mode: 0,
      modeByte: 0x80,
      controlWord: 16,
      secondaryWord: 0,
      vector: [0, 0, 0],
      vectorPointer: null,
      clearsResetDwords: true,
    },
    {
      objectTag: "AKIR",
      recordTag: "FACE",
      mode: 1,
      modeByte: 0x81,
      controlWord: 0x2345,
      secondaryWord: 0,
      vector: [0, 0, 0],
      vectorPointer: null,
      clearsResetDwords: false,
    },
  ]);
});

test("reads mode-two FACE vectors and stops on unproved modes", async () => {
  const writes = [];
  const handlers = createNativeAssociatedRecordSemanticHandlers({
    readNativeVector: pointer => (
      pointer === 0x3000 ? [0x3f800000, 0x40000000, 0x40400000] : undefined
    ),
    writeResolvedObjectFaceRecord: detail => writes.push(detail),
  });
  const execute = createNativeEventOperationExecutor({ handlers });
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 2 },
    { kind: "static-pointer", value: 0x3000 },
    { kind: "constant", value: 30 },
  ]), {
    location: { functionId: "0x200" },
  }), { status: "continued" });
  assert.equal(writes[0].modeByte, 0x82);
  assert.equal(writes[0].controlWord, 30);
  assert.deepEqual(
    writes[0].vector,
    [0x3f800000, 0x40000000, 0x40400000],
  );
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 3 },
  ])), {
    status: "stopped",
    reason: "resolved-object-face-record-mode-unproven",
  });
});

test("reads a mode-two FACE vector from the current native frame", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers({
      writeResolvedObjectFaceRecord: detail => writes.push(detail),
    }),
  });
  const frame = new Map([
    [8, 0x3f800000],
    [12, 0x40000000],
    [16, 0x40400000],
  ]);
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 2 },
    { kind: "frame-address", offset: 8 },
    { kind: "constant", value: 60 },
  ]), {
    readFrameField: offset => frame.get(offset),
  }), { status: "continued" });
  assert.deepEqual(writes[0].vector, [
    0x3f800000,
    0x40000000,
    0x40400000,
  ]);
  assert.equal(writes[0].vectorPointer, null);
});

test("integrates FACE request writes with exact scene state", async () => {
  const state = createNativeSceneGameplayState();
  state.writeNativeVector(
    0x3000,
    [0x3f800000, 0x40000000, 0x40400000],
  );
  const context = createNativeSceneFieldRuntimeContext(state);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 2 },
    { kind: "static-pointer", value: 0x3000 },
    { kind: "constant", value: 30 },
  ]), context), { status: "continued" });
  assert.deepEqual(state.readObjectFaceRecordRequest("AKIR"), {
    recordTag: "FACE",
    mode: 2,
    modeByte: 0x82,
    controlWord: 30,
    secondaryWord: 0,
    vector: [0x3f800000, 0x40000000, 0x40400000],
    resetDwords: undefined,
  });
});

test("applies guarded FACE parameter fields with native word arithmetic", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFaceParameterGuards({
    objectTag: "AKIR",
    hasMomtRecord: true,
    stateByte: 3,
    activeEntryPointer: 0x1200,
    activeEntryAux: 0x3400,
    expectedEntryPointer: 0x1200,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0x101 },
    { kind: "constant", value: 7 },
    { kind: "constant", value: 0xffff },
  ], "resolved-object-face-record-parameter-write"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      applied: true,
      state: {
        stateByte: 3,
        activeEntryPointer: 0x1200,
        activeEntryAux: 0x3400,
        expectedEntryPointer: 0x1200,
        parameterByte: 1,
        scaledParameterWord: 42,
        minimumOneWord: 1,
        controllerByte: 0,
      },
    },
  });
});

test("preserves the native FACE table-mismatch clear and no-op", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFaceParameterGuards({
    objectTag: "AKIR",
    hasMomtRecord: true,
    stateByte: 2,
    activeEntryPointer: 0x1200,
    activeEntryAux: 0x3400,
    expectedEntryPointer: 0x5600,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 1 },
    { kind: "constant", value: 2 },
    { kind: "constant", value: 4 },
  ], "resolved-object-face-record-parameter-write"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.deepEqual(result.mutation, {
    applied: false,
    reason: "face-state-table-mismatch",
  });
  assert.deepEqual(state.readObjectFaceParameterState("AKIR"), {
    stateByte: 2,
    activeEntryPointer: 0,
    activeEntryAux: 0,
    expectedEntryPointer: 0x5600,
    parameterByte: 0,
    scaledParameterWord: undefined,
    minimumOneWord: undefined,
    controllerByte: undefined,
  });
});

test("sets, clears, and queries exact CCOW masks", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectCcowRecord({
    objectTag: "AKIR",
    available: true,
    flagsWord: 0x80,
    stateByte: 9,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const ccowAction = mode => action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: mode },
  ], "resolved-object-ccow-mask-control");
  assert.equal((await execute(ccowAction(1), context)).result, 0);
  assert.deepEqual(state.readObjectCcowRecord("AKIR"), {
    flagsWord: 0x87,
    stateByte: 0,
  });
  assert.equal((await execute(ccowAction(7), context)).result, 1);
  assert.equal((await execute(ccowAction(8), context)).result, 1);
  assert.equal((await execute(ccowAction(2), context)).result, 0);
  assert.deepEqual(state.readObjectCcowRecord("AKIR"), {
    flagsWord: 0x80,
    stateByte: 0,
  });
});

test("treats a missing native CCOW record as no-op and false query", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(
    createNativeSceneGameplayState(),
  );
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 7 },
  ], "resolved-object-ccow-mask-control"), context);
  assert.equal(result.result, 0);
  assert.deepEqual(result.mutation, {
    applied: false,
    result: 0,
    reason: "ccow-record-missing",
  });
});

test("operation 0x005d controls only exact CCOW bit seven", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectCcowRecord({
    objectTag: "AKIR",
    available: true,
    flagsWord: 0x21,
    stateByte: 9,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const fixedBitAction = mode => action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: mode },
  ], "resolved-object-ccow-bit-7-control");
  assert.equal((await execute(fixedBitAction(0), context)).status, "continued");
  assert.deepEqual(state.readObjectCcowRecord("AKIR"), {
    flagsWord: 0x21,
    stateByte: 9,
  });
  assert.equal((await execute(fixedBitAction(1), context)).status, "continued");
  assert.deepEqual(state.readObjectCcowRecord("AKIR"), {
    flagsWord: 0xa1,
    stateByte: 0,
  });
  assert.equal((await execute(fixedBitAction(2), context)).status, "continued");
  assert.deepEqual(state.readObjectCcowRecord("AKIR"), {
    flagsWord: 0x21,
    stateByte: 0,
  });
});

test("writes exact REFB dwords and preserves the conditional clear", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectRefbRecord({
    objectTag: "AKIR",
    available: true,
    valueDword: 8,
    secondaryDword: 9,
    stateDword: 10,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const refbAction = value => action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value },
  ], "resolved-object-refb-value-write");

  assert.deepEqual((await execute(refbAction(2), context)).mutation, {
    applied: true,
    state: {
      valueDword: 2,
      secondaryDword: 9,
      stateDword: 1,
    },
  });
  assert.deepEqual((await execute(refbAction(0), context)).mutation, {
    applied: true,
    state: {
      valueDword: 0,
      secondaryDword: 0,
      stateDword: 1,
    },
  });
});

test("installs exact REFB control fields only once while updating values", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectRefbRecord({
    objectTag: "AKIR",
    available: true,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const actor = { kind: "constant", value: 0x52494b41, ascii: "AKIR" };
  const first = await execute(action([
    actor,
    { kind: "constant", value: 2 },
    { kind: "constant", value: 0 },
  ], "resolved-object-refb-control-install"), context);
  assert.equal(first.status, "continued");
  assert.equal(first.mutation.callbackInstalled, true);
  assert.deepEqual(state.readObjectRefbRecord("AKIR"), {
    valueDword: 0,
    secondaryDword: 0,
    stateDword: 1,
    controlModeDword: 2,
    controlValueDword: 0,
  });
  const second = await execute(action([
    actor,
    { kind: "constant", value: 5 },
    { kind: "constant", value: 9 },
  ], "resolved-object-refb-control-install"), context);
  assert.equal(second.mutation.callbackInstalled, false);
  assert.equal(state.readObjectRefbRecord("AKIR").controlModeDword, 5);
  assert.equal(state.readObjectRefbRecord("AKIR").controlValueDword, 9);
});

test("treats missing REFB control records as exact no-ops", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0 },
    { kind: "constant", value: 0 },
  ], "resolved-object-refb-control-install"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.deepEqual(result, {
    status: "continued",
    mutation: { applied: false, reason: "refb-record-missing" },
  });
});

test("treats a missing native REFB record as an exact no-op", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 1 },
  ], "resolved-object-refb-value-write"), (
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState())
  ));
  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      applied: false,
      reason: "refb-record-missing",
    },
  });
});

test("writes exact REFB vector words only after record resolution", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectRefbRecord({
    objectTag: "AKIR",
    available: true,
    stateDword: 7,
  });
  state.writeNativeVector(0x2004, [0x3f800000, 0xc0200000, 0x40400000]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0x2000 },
  ], "resolved-object-refb-vector-write"), context);
  assert.deepEqual(result.mutation, {
    applied: true,
    state: {
      valueDword: 0,
      secondaryDword: 0,
      stateDword: 1,
      vectorWords: [0x3f800000, 0xc0200000, 0x40400000],
    },
    sourcePointer: 0x2000,
    vectorPointer: 0x2004,
  });

  const absent = await execute(action([
    { kind: "constant", value: 0x304c4554, ascii: "TEL0" },
    { kind: "constant", value: 0x3000 },
  ], "resolved-object-refb-vector-write"), context);
  assert.deepEqual(absent.mutation, {
    available: false,
    applied: false,
    reason: "refb-record-missing",
  });
});

test("clears all eight exact FIXO reset fields", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFixoRecord({
    objectTag: "AKIR",
    available: true,
    lowerVectorWords: [1, 2, 3],
    upperVectorWords: [4, 5, 6],
    word30: 7,
    word32: 8,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ], "resolved-object-fixo-reset"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      applied: true,
      state: {
        primaryVectorWords: [0, 0, 0],
        secondaryVectorWords: [0, 0, 0],
        lowerVectorWords: [0, 0, 0],
        upperVectorWords: [0, 0, 0],
        word30: 0,
        word32: 0,
        controlIdDword: 0,
        targetObjectTag: null,
      },
    },
  });
  assert.deepEqual(state.readObjectFixoRecord("AKIR"), {
    primaryVectorWords: [0, 0, 0],
    secondaryVectorWords: [0, 0, 0],
    lowerVectorWords: [0, 0, 0],
    upperVectorWords: [0, 0, 0],
    word30: 0,
    word32: 0,
    controlIdDword: 0,
    targetObjectTag: null,
  });
});

test("stops at the native FIXO record prerequisite", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ], "resolved-object-fixo-reset"), (
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState())
  )), {
    status: "stopped",
    reason: "fixo-record-missing",
  });
});

test("installs the exact duplicated FIXO vectors and matched control", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFixoRecord({
    objectTag: "CAN1",
    available: true,
    word32: 9,
    controlIdDword: 44,
  });
  state.configureFixoAttachmentTarget({
    objectTag: "AKIR",
    hasMomtRecord: true,
    controlIds: [12, 18],
  });
  state.writeNativeVector(0x100, [1, 2, 3]);
  state.writeNativeVector(0x200, [4, 5, 6]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x314e4143, ascii: "CAN1" },
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 18 },
    { kind: "static-pointer", value: 0x100 },
    { kind: "static-pointer", value: 0x200 },
  ], "resolved-object-fixo-attachment-install"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.controlMatched, true);
  assert.deepEqual(state.readObjectFixoRecord("CAN1"), {
    primaryVectorWords: [4, 5, 6],
    secondaryVectorWords: [1, 2, 3],
    lowerVectorWords: [4, 5, 6],
    upperVectorWords: [1, 2, 3],
    word30: 1,
    word32: 9,
    controlIdDword: 18,
    targetObjectTag: "AKIR",
  });
});

test("retains the FIXO control dword when target control lookup fails", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFixoRecord({
    objectTag: "DENW",
    available: true,
    controlIdDword: 77,
  });
  state.configureFixoAttachmentTarget({
    objectTag: "AKIR",
    hasMomtRecord: true,
    controlIds: [12],
  });
  state.writeNativeVector(0x100, [1, 2, 3]);
  state.writeNativeVector(0x200, [4, 5, 6]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x574e4544, ascii: "DENW" },
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 18 },
    { kind: "static-pointer", value: 0x100 },
    { kind: "static-pointer", value: 0x200 },
  ], "resolved-object-fixo-attachment-install"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.controlMatched, false);
  assert.equal(state.readObjectFixoRecord("DENW").word30, 3);
  assert.equal(state.readObjectFixoRecord("DENW").controlIdDword, 77);
});

test("stops before FIXO attachment when exact target state is unavailable", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectFixoRecord({ objectTag: "DENW", available: true });
  state.writeNativeVector(0x100, [1, 2, 3]);
  state.writeNativeVector(0x200, [4, 5, 6]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action([
    { kind: "constant", value: 0x574e4544, ascii: "DENW" },
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 18 },
    { kind: "static-pointer", value: 0x100 },
    { kind: "static-pointer", value: 0x200 },
  ], "resolved-object-fixo-attachment-install"), (
    createNativeSceneFieldRuntimeContext(state)
  )), {
    status: "stopped",
    reason: "fixo-target-state-missing",
  });
});

test("queries and updates exact TELM primary-link controller fields", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectTelmRecord({
    objectTag: "TEL0",
    available: true,
    primaryLinkDword: 0x12345678,
    controllerStateDword: 7,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const telmAction = mode => action([
    { kind: "constant", value: mode },
    { kind: "constant", value: 0x304c4554, ascii: "TEL0" },
  ], "resolved-object-telm-control");

  const query = await execute(telmAction(4), context);
  assert.equal(query.result, 0x12345678);
  assert.equal(query.mutation.applied, true);
  assert.deepEqual(state.readObjectTelmRecord("TEL0"), {
    primaryLinkDword: 0x12345678,
    controllerStateDword: 7,
    resolvedObjectTag: "TEL0",
    operationContextBound: true,
  });

  const update = await execute(telmAction(10), context);
  assert.equal(update.status, "continued");
  assert.deepEqual(update.mutation, {
    applied: true,
    state: {
      primaryLinkDword: 0xffffffff,
      controllerStateDword: 21,
      resolvedObjectTag: "TEL0",
      operationContextBound: true,
    },
  });
});

test("stops when the native TELM record prerequisite is absent", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 4 },
    { kind: "constant", value: 0x304c4554, ascii: "TEL0" },
  ], "resolved-object-telm-control"), (
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState())
  ));
  assert.deepEqual(result, {
    status: "stopped",
    reason: "telm-record-missing",
  });
});

test("writes the same raw float word to both exact MOMT fields", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtFloatPairState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    floatWordF0: 0,
    floatWord128: 0x40000000,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0x3f800000 },
  ], "actor-momt-float-pair-write"), (
    createNativeSceneFieldRuntimeContext(state)
  ));
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readActorMomtFloatPairState("AKIR"), {
    actorAvailable: true,
    momtAvailable: true,
    floatWordF0: 0x3f800000,
    floatWord128: 0x3f800000,
  });
});

test("uses the exact scene-registry unlink branch when MOMT is absent", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtFloatPairState({
    objectTag: "FUKU",
    actorAvailable: true,
    momtAvailable: false,
  });
  const removals = [];
  const context = createNativeSceneFieldRuntimeContext(state);
  context.location = { functionId: "0x100" };
  context.removeActorFromSceneRegistry = detail => removals.push(detail);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x554b5546, ascii: "FUKU" },
    { kind: "constant", value: 0x3f800000 },
  ], "actor-momt-float-pair-write"), context);
  assert.equal(result.status, "continued");
  assert.deepEqual(removals, [{
    actorTag: "FUKU",
    source: {
      functionFileOffset: "0x100",
      callFileOffset: "0x204",
    },
  }]);
});

test("keeps unknown MOMT float-pair state as an explicit stop", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "constant", value: 0x3f800000 },
  ], "actor-momt-float-pair-write"), (
    createNativeSceneFieldRuntimeContext(createNativeSceneGameplayState())
  ));
  assert.deepEqual(result, {
    status: "stopped",
    reason: "actor-momt-float-pair-state-unavailable",
  });
});

test("executes every exact MOMT numeric-query arithmetic branch", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const query = () => execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
  ], "actor-momt-numeric-query"), context);
  const configure = ({ control, base, global }) => {
    state.configureActorMomtNumericQueryState({
      objectTag: "AKIR",
      actorAvailable: true,
      momtAvailable: true,
      floatWordF0: floatWord(base),
      floatWordDc: floatWord(control),
    });
    state.configureMomtNumericGlobalDword(global);
  };

  configure({ control: 1, base: 12.34, global: 2 });
  assert.equal((await query()).result, floatWord(12));
  configure({ control: 1, base: 12.44, global: 2 });
  assert.equal((await query()).result, floatWord(13));
  configure({ control: 2, base: 10, global: 3 });
  assert.equal((await query()).result, floatWord(9.25));
  configure({ control: 2, base: 10, global: 1 });
  assert.equal((await query()).result, floatWord(10));
  configure({ control: 2, base: 10, global: -1 });
  assert.equal((await query()).result, floatWord(10));
});

test("MOMT numeric query preserves zero and registry-unlink branches", async () => {
  const state = createNativeSceneGameplayState();
  const removals = [];
  const context = createNativeSceneFieldRuntimeContext(state);
  context.removeActorFromSceneRegistry = detail => removals.push(detail);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const query = actor => execute(action([
    { kind: "constant", value: 0, ascii: actor },
  ], "actor-momt-numeric-query"), context);

  state.configureActorMomtNumericQueryState({
    objectTag: "AKIR",
    actorAvailable: false,
    momtAvailable: false,
  });
  assert.equal((await query("AKIR")).result, 0);
  state.configureActorMomtNumericQueryState({
    objectTag: "FUKU",
    actorAvailable: true,
    momtAvailable: false,
  });
  assert.equal((await query("FUKU")).result, 0);
  assert.equal(removals.length, 1);
  assert.equal(removals[0].actorTag, "FUKU");
});

test("applies the proven MOMT-scaled actor position offset", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtScaledOffsetState({
    objectTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    scaleVectorWords: [
      floatWord(2),
      floatWord(3),
      floatWord(4),
    ],
    positionWords: [
      floatWord(1),
      floatWord(2),
      floatWord(3),
    ],
    parentTransform: null,
  });
  state.writeNativeVector(0x2000, [
    floatWord(0.5),
    floatWord(-0.5),
    floatWord(0.25),
  ]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const result = await execute(action([
    { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
    { kind: "static-pointer", value: 0x2000 },
    { kind: "constant", value: 0 },
  ], "actor-momt-scaled-position-offset"), (
    createNativeSceneFieldRuntimeContext(state)
  ));

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.deltaWords, [
    floatWord(1),
    floatWord(-1.5),
    floatWord(1),
  ]);
  assert.deepEqual(state.readActorMomtScaledOffsetState("AKIR"), {
    actorAvailable: true,
    momtAvailable: true,
    scaleVectorWords: [
      floatWord(2),
      floatWord(3),
      floatWord(4),
    ],
    positionWords: [
      floatWord(2),
      floatWord(0.5),
      floatWord(4),
    ],
    parentTransform: null,
  });
});

test("MOMT-scaled offset preserves native early exits and parent transform", async () => {
  const state = createNativeSceneGameplayState();
  state.configureActorMomtScaledOffsetState({
    objectTag: "AKIR",
    actorAvailable: false,
    momtAvailable: false,
  });
  state.configureActorMomtScaledOffsetState({
    objectTag: "FUKU",
    actorAvailable: true,
    momtAvailable: false,
  });
  state.configureActorMomtScaledOffsetState({
    objectTag: "NOZO",
    actorAvailable: true,
    momtAvailable: true,
    scaleVectorWords: [
      floatWord(2),
      floatWord(3),
      floatWord(4),
    ],
    positionWords: [
      floatWord(1),
      floatWord(2),
      floatWord(3),
    ],
    parentTransform: words => [words[2], words[0], words[1]],
  });
  state.writeNativeVector(0x2000, [
    floatWord(0.5),
    floatWord(-0.5),
    floatWord(0.25),
  ]);
  const removals = [];
  const context = createNativeSceneFieldRuntimeContext(state);
  context.removeActorFromSceneRegistry = detail => removals.push(detail);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeAssociatedRecordSemanticHandlers(),
  });
  const invoke = (actor, pointer = 0x2000) => execute(action([
    { kind: "constant", value: 0, ascii: actor },
    { kind: "static-pointer", value: pointer },
    { kind: "constant", value: 0 },
  ], "actor-momt-scaled-position-offset"), context);

  assert.equal((await invoke("AKIR", 0xdeadbeef)).status, "continued");
  assert.equal((await invoke("FUKU", 0xdeadbeef)).status, "continued");
  assert.equal(removals.length, 1);
  assert.equal(removals[0].actorTag, "FUKU");
  assert.equal((await invoke("NOZO")).status, "continued");
  assert.deepEqual(
    state.readActorMomtScaledOffsetState("NOZO").positionWords,
    [floatWord(2), floatWord(3), floatWord(1.5)],
  );
});
