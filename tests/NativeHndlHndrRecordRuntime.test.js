import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeHndlHndrRecordSemanticHandlers,
} from "../play/events/NativeHndlHndrRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

const SLOT_INDICES = [
  31, 30, 29, 35, 34, 33, 32, 39, 38, 37,
  36, 43, 42, 41, 40, 47, 46, 45, 44,
];

function sourceVectors(seed = 0) {
  return Array.from({ length: 19 }, (_, index) => [
    seed + index,
    seed + 100 + index,
    seed + 200 + index,
  ]);
}

function installAction({
  objectTag = "AKIR",
  sideSelector = 0,
  sourcePointer = 0x1234,
  duration = 0,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-hndl-hndr-vector-install",
    arguments: [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: objectTag,
      },
      { kind: "constant", value: sideSelector },
      { kind: "static-pointer", value: sourcePointer },
      { kind: "constant", value: duration },
    ],
  };
}

function controllerAction({
  objectTag = "AKIR",
  mode = 1,
  sideSelector = 0,
  selector = 411,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-hndl-hndr-controller-request",
    arguments: [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: objectTag,
      },
      { kind: "constant", value: mode >>> 0 },
      { kind: "constant", value: sideSelector },
      { kind: "constant", value: selector },
    ],
  };
}

function componentAction({
  objectTag = "AKIR",
  sideSelector = 0,
  componentMask = 0x15,
  sourcePointer = 0x9000,
} = {}) {
  return {
    kind: "engineOperation",
    semanticId: "resolved-object-hndl-hndr-component-write",
    arguments: [
      {
        kind: "constant",
        value: 0x52494b41,
        ascii: objectTag,
      },
      { kind: "constant", value: sideSelector },
      { kind: "constant", value: componentMask },
      { kind: "static-pointer", value: sourcePointer },
    ],
  };
}

test("installs the exact 19-vector HNDL slot map after clearing 71 slots", async () => {
  const state = createNativeSceneGameplayState();
  const vectors = sourceVectors(1000);
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
  });
  state.configureHndlHndrVectorTable({
    pointer: 0x1234,
    vectors,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    installAction(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  const record = state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  });
  assert.equal(record.activeByte, 1);
  assert.equal(record.durationWord, 1);
  assert.equal(record.sourcePointer, 0x1234);
  assert.equal(record.vectorSlots.length, 71);
  SLOT_INDICES.forEach((slotIndex, sourceIndex) => {
    assert.deepEqual(record.vectorSlots[slotIndex], vectors[sourceIndex]);
  });
  assert.equal(
    record.vectorSlots.filter(vector => vector !== null).length,
    19,
  );
});

test("selects HNDR for every nonzero side and preserves signed-word clamping", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
    available: true,
  });
  state.configureHndlHndrVectorTable({
    pointer: 0x5678,
    vectors: sourceVectors(),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  await execute(installAction({
    sideSelector: 7,
    sourcePointer: 0x5678,
    duration: 5,
  }), context);
  assert.equal(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
  }).durationWord, 5);

  await execute(installAction({
    sideSelector: 1,
    sourcePointer: 0x5678,
    duration: 0xffff,
  }), context);
  assert.equal(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
  }).durationWord, 1);
});

test("preserves missing-record no-op and stops on unavailable source data", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);

  const missingRecord = await execute(installAction(), context);
  assert.equal(missingRecord.status, "continued");
  assert.equal(
    missingRecord.mutation.reason,
    "hndl-hndr-record-missing",
  );

  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
  });
  assert.deepEqual(await execute(installAction(), context), {
    status: "stopped",
    reason: "hndl-hndr-vector-table-unavailable",
  });
  const record = state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  });
  assert.equal(record.activeByte, 0);
  assert.equal(
    record.vectorSlots.every(vector => vector === null),
    true,
  );
});

test("applies the exact primary-controller gate and range-selected fields", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrControllerRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    primaryControllerAvailable: true,
    secondaryControllerAvailable: false,
    primaryControlDwords: [11, 22, 33],
    selectorResults: [{
      selector: 411,
      matched: true,
      selectedConfigPointer: 0x3456,
      lengthDword: 5,
      secondaryDword: 0x12345678,
    }],
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    controllerAction(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.admitted, true);
  const record = state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  });
  assert.equal(record.activeByte, 0);
  assert.equal(record.durationWord, 0);
  assert.deepEqual(record.controller.primaryControlDwords, [0, 0, 0]);
  assert.deepEqual({
    modeByte: record.controller.modeByte,
    enabledByte: record.controller.enabledByte,
    selectedConfigPointer: record.controller.selectedConfigPointer,
    lengthDword: record.controller.lengthDword,
    continuationPointer: record.controller.continuationPointer,
    secondaryWord: record.controller.secondaryWord,
    startIndexWord: record.controller.startIndexWord,
    endIndexWord: record.controller.endIndexWord,
    currentIndexWord: record.controller.currentIndexWord,
    previousIndexWord: record.controller.previousIndexWord,
    currentIndexFloatWord: record.controller.currentIndexFloatWord,
    stepFloatWord: record.controller.stepFloatWord,
    terminalStateDword: record.controller.terminalStateDword,
  }, {
    modeByte: 1,
    enabledByte: 1,
    selectedConfigPointer: 0x3456,
    lengthDword: 5,
    continuationPointer: 0x347e,
    secondaryWord: 0x5678,
    startIndexWord: 0,
    endIndexWord: 4,
    currentIndexWord: 0,
    previousIndexWord: 0,
    currentIndexFloatWord: 0,
    stepFloatWord: 0x3f800000,
    terminalStateDword: 0,
  });
});

test("uses the secondary gate and preserves an exact no-match range result", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrControllerRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
    available: true,
    primaryControllerAvailable: false,
    secondaryControllerAvailable: true,
    selectorResults: [{
      selector: 851,
      matched: false,
    }],
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    controllerAction({
      mode: -1,
      sideSelector: 1,
      selector: 851,
    }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.mutation.admitted, true);
  const controller = state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.modeByte, 0xff);
  assert.equal(controller.selectedConfigPointer, 0);
  assert.equal(controller.lengthDword, 0);
  assert.equal(controller.startIndexWord, 0);
  assert.equal(controller.endIndexWord, 0);
});

test("clears a present primary controller even when its gate rejects the mode", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrControllerRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    primaryControllerAvailable: true,
    secondaryControllerAvailable: false,
    primaryControlDwords: [11, 22, 33],
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    controllerAction({ mode: -1 }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: true,
    admitted: false,
    primaryControllerCleared: true,
    recordTag: "HNDL",
    state: state.readObjectHndlHndrRecord({
      objectTag: "AKIR",
      recordTag: "HNDL",
    }),
  });
  const controller = result.mutation.state.controller;
  assert.deepEqual(controller.primaryControlDwords, [0, 0, 0]);
  assert.equal(controller.modeByte, undefined);
  assert.equal(controller.enabledByte, undefined);
});

test("preserves the native controller-request no-op for a missing record", async () => {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    controllerAction(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: false,
    reason: "hndl-hndr-record-missing",
  });
});

test("fails closed on unknown controller prerequisites without partial writes", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrControllerRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    primaryControllerAvailable: true,
    secondaryControllerAvailable: false,
    primaryControlDwords: [11, 22, 33],
    selectorResults: [],
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual(await execute(controllerAction(), context), {
    status: "stopped",
    reason: "hndl-hndr-controller-selector-unavailable",
  });
  assert.deepEqual(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  }).controller.primaryControlDwords, [11, 22, 33]);

  state.configureObjectHndlHndrRecord({
    objectTag: "NOZO",
    recordTag: "HNDL",
    available: true,
  });
  assert.deepEqual(await execute(controllerAction({
    objectTag: "NOZO",
  }), context), {
    status: "stopped",
    reason: "hndl-hndr-controller-state-unavailable",
  });
});

test("replaces all three exact HNDL +0x10 target words for mask 0x15", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    pointer10Present: true,
    pointer10Vector: [1, 2, 3],
  });
  state.writeNativeVector(0x9000, [
    0x11111111,
    0x22222222,
    0x33333333,
  ]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    componentAction(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.pointer10Vector, [
    0x11111111,
    0x22222222,
    0x33333333,
  ]);
  assert.deepEqual(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  }).pointer10Vector, [
    0x11111111,
    0x22222222,
    0x33333333,
  ]);
});

test("raw-adds all HNDR words modulo 32 bits for mask 0x2a", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDR",
    available: true,
    pointer10Present: true,
    pointer10Vector: [0xffffffff, 0x80000000, 3],
  });
  state.writeNativeVector(0x9000, [2, 0x80000000, 4]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    componentAction({ sideSelector: 7, componentMask: 0x2a }),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.pointer10Vector, [1, 0, 7]);
  assert.equal(result.mutation.recordTag, "HNDR");
});

test("missing HNDL/HNDR records no-op before reading argument three", async () => {
  let vectorReads = 0;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers({
      planResolvedObjectHndlHndrComponentWrite: () => ({
        applicable: false,
        nativeNoOp: true,
        reason: "hndl-hndr-record-missing",
      }),
      commitResolvedObjectHndlHndrComponentWrite() {
        throw new Error("missing records must not commit");
      },
      readNativeVector() {
        vectorReads += 1;
        return [1, 2, 3];
      },
    }),
  });
  const result = await execute(componentAction());

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.reason, "hndl-hndr-record-missing");
  assert.equal(vectorReads, 0);
});

test("a null record +0x10 pointer still reads the source then no-ops", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    pointer10Present: false,
  });
  state.writeNativeVector(0x9000, [1, 2, 3]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const result = await execute(
    componentAction(),
    createNativeSceneFieldRuntimeContext(state),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.nativeNoOp, true);
  assert.equal(result.mutation.reason, "hndl-hndr-pointer-10-null");
  assert.equal(result.mutation.sourcePointer, 0x9000);
});

test("unknown pointer state and missing source vectors stop without mutation", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers(),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.deepEqual(await execute(componentAction(), context), {
    status: "stopped",
    reason: "hndl-hndr-pointer-10-state-unavailable",
  });

  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    pointer10Present: true,
    pointer10Vector: [10, 20, 30],
  });
  assert.deepEqual(await execute(componentAction(), context), {
    status: "stopped",
    reason: "native-vector-source-unavailable",
  });
  assert.deepEqual(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  }).pointer10Vector, [10, 20, 30]);
});

test("component writes reject target changes across an asynchronous source read", async () => {
  const state = createNativeSceneGameplayState();
  state.configureObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
    available: true,
    pointer10Present: true,
    pointer10Vector: [1, 2, 3],
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers({
      readNativeVector() {
        state.configureObjectHndlHndrRecord({
          objectTag: "AKIR",
          recordTag: "HNDL",
          available: true,
          pointer10Present: true,
          pointer10Vector: [7, 8, 9],
        });
        return [10, 20, 30];
      },
    }),
  });

  assert.deepEqual(await execute(componentAction(), context), {
    status: "stopped",
    reason: "hndl-hndr-pointer-10-state-changed",
  });
  assert.deepEqual(state.readObjectHndlHndrRecord({
    objectTag: "AKIR",
    recordTag: "HNDL",
  }).pointer10Vector, [7, 8, 9]);
});
