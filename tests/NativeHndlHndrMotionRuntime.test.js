import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeHndlHndrRecordSemanticHandlers,
  createNativeHndlHndrRecordState,
} from "../play/events/NativeHndlHndrRecordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";

function actor(value = "SORY") {
  return {
    kind: "constant",
    value: 0x59524f53,
    ascii: value,
  };
}

function word(value) {
  return { kind: "constant", value };
}

function requestAction(arguments_) {
  return {
    kind: "engineOperation",
    operationId: 0x00e7,
    operationHex: "0x00e7",
    semanticId: "resolved-object-hndl-hndr-motion-request",
    adapterStatus: "proven",
    arguments: arguments_,
  };
}

function controlAction(arguments_) {
  return {
    kind: "engineOperation",
    operationId: 0x00e9,
    operationHex: "0x00e9",
    semanticId: "resolved-object-hndl-hndr-motion-control",
    adapterStatus: "proven",
    arguments: arguments_,
  };
}

function configuredState({ matched = true } = {}) {
  const state = createNativeHndlHndrRecordState();
  state.configureControllerRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
    available: true,
    primaryControllerAvailable: true,
    secondaryControllerAvailable: true,
    selectorResults: [{
      selector: 9504,
      matched,
      selectedConfigPointer: matched ? 0x10203040 : 0,
      lengthDword: matched ? 12 : 0,
      secondaryDword: matched ? 7 : 0,
    }],
  });
  return state;
}

function runtime(state) {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeHndlHndrRecordSemanticHandlers({
      applyResolvedObjectHndlHndrMotionRequest: detail => (
        state.applyMotionRequest(detail)
      ),
      applyResolvedObjectHndlHndrMotionControl: detail => (
        state.applyMotionControl(detail)
      ),
    }),
  });
  return { execute, context: {} };
}

test("0x00e7 initializes the exact selected HNDR motion interval", async () => {
  const state = configuredState();
  const { execute, context } = runtime(state);
  const result = await execute(requestAction([
    actor(), word(1), word(9504), word(0), word(0), word(0),
    word(8), word(0x3f800000), word(20),
  ]), context);
  assert.equal(result.status, "continued");
  const controller = state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.motionSelectorWord, 9504);
  assert.equal(controller.selectedConfigPointer, 0x10203040);
  assert.equal(controller.continuationPointer, 0x10203068);
  assert.equal(controller.startIndexWord, 0);
  assert.equal(controller.endIndexWord, 11);
  assert.equal(controller.currentIndexWord, 0);
  assert.equal(controller.previousIndexWord, 0);
  assert.equal(controller.currentIndexFloatWord, 0);
  assert.equal(controller.flagByte, 0);
  assert.equal(controller.stepFloatWord, 0x3f800000);
  assert.equal(controller.transitionStateByte, 2);
  assert.equal(controller.transitionDurationWord, 20);
});

test("0x00e7 retains the native zero-range result for an explicit miss", async () => {
  const state = configuredState({ matched: false });
  const { execute, context } = runtime(state);
  const result = await execute(requestAction([
    actor(), word(1), word(9504), word(0), word(0), word(0),
    word(0), word(0x3f800000), word(0),
  ]), context);
  assert.equal(result.status, "continued");
  const controller = state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.selectedConfigPointer, 0);
  assert.equal(controller.lengthDword, 0);
  assert.equal(controller.startIndexWord, 0);
  assert.equal(controller.endIndexWord, 0);
  assert.equal(controller.currentIndexWord, 0);
});

test("0x00e9 mode zero applies mask and direction endpoint transitions", async () => {
  const state = configuredState();
  state.applyMotionRequest({
    objectTag: "SORY",
    recordTag: "HNDR",
    motionSelector: 9504,
    startIndex: 2,
    endIndex: 5,
    currentIndex: 3,
    flags: 0,
    stepFloatWord: 0x3f800000,
    transitionDuration: 0,
  });
  const { execute, context } = runtime(state);
  const result = await execute(controlAction([
    actor(), word(1), word(0), word(1), word(2),
  ]), context);
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.rangeAdjusted, true);
  let controller = state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.flagByte, 2);
  assert.equal(controller.startIndexWord, 4);
  assert.equal(controller.endIndexWord, 4);
  assert.equal(controller.currentIndexWord, 2);

  state.applyMotionRequest({
    objectTag: "SORY",
    recordTag: "HNDR",
    motionSelector: 9504,
    startIndex: 2,
    endIndex: 9,
    currentIndex: 3,
    flags: 2,
    stepFloatWord: 0x3f800000,
    transitionDuration: 0,
  });
  const cleared = await execute(controlAction([
    actor(), word(1), word(0), word(0), word(2),
  ]), context);
  assert.equal(cleared.mutation.rangeAdjusted, true);
  controller = state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller;
  assert.equal(controller.flagByte, 0);
  assert.equal(controller.startIndexWord, 1);
  assert.equal(controller.endIndexWord, 1);
  assert.equal(controller.previousIndexWord, 2);
  assert.equal(controller.currentIndexFloatWord, 0x40000000);
});

test("0x00e9 mode one accepts only a positive raw float step", async () => {
  const state = configuredState();
  state.applyMotionRequest({
    objectTag: "SORY",
    recordTag: "HNDR",
    motionSelector: 9504,
    startIndex: 0,
    endIndex: 0,
    currentIndex: 0,
    flags: 0,
    stepFloatWord: 0x3f800000,
    transitionDuration: 0,
  });
  const { execute, context } = runtime(state);
  await execute(controlAction([
    actor(), word(1), word(1), word(0x41a00000),
  ]), context);
  assert.equal(state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller.stepFloatWord, 0x41a00000);
  await execute(controlAction([
    actor(), word(1), word(1), word(0xbf800000),
  ]), context);
  assert.equal(state.readRecord({
    objectTag: "SORY",
    recordTag: "HNDR",
  }).controller.stepFloatWord, 0x41a00000);
});

test("motion handlers preserve native no-ops and fail closed on unknown state", async () => {
  const state = configuredState();
  const { execute, context } = runtime(state);
  const ignored = await execute(controlAction([
    actor(), word(1), word(7), word(0),
  ]), context);
  assert.equal(ignored.status, "continued");
  assert.equal(ignored.mutation.nativeNoOp, true);
  const unavailable = await execute(requestAction([
    actor(), word(1), word(9503), word(0), word(0), word(0),
    word(0), word(0x3f800000), word(0),
  ]), context);
  assert.deepEqual(unavailable, {
    status: "stopped",
    reason: "hndl-hndr-motion-selector-unavailable",
  });
});
