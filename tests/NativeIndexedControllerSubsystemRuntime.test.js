import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeIndexedRecordSemanticHandlers,
  createNativeIndexedRecordState,
  createNativeIndexedControllerPresentationAdapter,
} from "../play/events/NativeIndexedRecordRuntime.js";

const semantics = JSON.parse(readFileSync(new URL(
  "../tools/evidence/native-operation-semantics.json",
  import.meta.url,
)));


function action(operationId, semanticId, values) {
  return {
    kind: "engineOperation",
    operationId,
    semanticId,
    arguments: values.map(value => ({ kind: "constant", value })),
  };
}

function contextFor(state, sources, present) {
  return {
    planIndexedControllerReset: mode => state.planControllerReset(mode),
    commitIndexedControllerReset: plan => state.commitControllerReset(plan),
    planIndexedControllerFloat4Write: words => (
      state.planControllerFloat4Write(words)
    ),
    commitIndexedControllerFloat4Write: plan => (
      state.commitControllerFloat4Write(plan)
    ),
    planIndexedControllerInitialize: detail => (
      state.planControllerInitialize(detail)
    ),
    commitIndexedControllerInitialize: plan => (
      state.commitControllerInitialize(plan)
    ),
    readNativeWords: (pointer, count) => sources.get(pointer)?.slice(0, count),
    ...(present ? { presentIndexedControllerMutation: present } : {}),
  };
}

test("indexed controller family retains only exact authored shapes", () => {
  const entries = semantics.operations.filter(entry => (
    [0x0062, 0x0064, 0x0068, 0x0069, 0x006a]
      .includes(entry.operationId)
  ));
  assert.deepEqual(entries.map(entry => entry.operationId).sort((a, b) => a - b), [
    0x0062, 0x0064, 0x0068, 0x0069, 0x006a,
  ]);
  assert.equal(
    entries.find(entry => entry.operationId === 0x0064)
      .staticPointerWordCount,
    4,
  );
  assert.equal(
    entries.find(entry => entry.operationId === 0x006a)
      .staticPointerWordCount,
    3,
  );
});

test("indexed controller reset is transactional and initializes 128 records", async () => {
  const state = createNativeIndexedRecordState();
  const presentations = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const result = await execute(
    action(0x0062, "indexed-controller-subsystem-reset", [1]),
    contextFor(state, new Map(), plan => presentations.push(plan)),
  );

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.initializedRecordCount, 128);
  assert.equal(presentations[0].callbackArgument, 0);
  assert.deepEqual(state.readControllerSubsystem(), {
    mode: 1,
    float4Words: undefined,
    generation: 1,
    recordCount: 128,
  });
  assert.deepEqual(
    {
      controlWord: state.readControllerRecord(0).controlWord,
      word40: state.readControllerRecord(0).word40,
      floatWord18: state.readControllerRecord(0).floatWord18,
      floatWord1c: state.readControllerRecord(0).floatWord1c,
      floatWord20: state.readControllerRecord(0).floatWord20,
      active: state.readControllerRecord(0).active,
    },
    {
      controlWord: 0,
      word40: 1820,
      floatWord18: 0x3f800000,
      floatWord1c: 0x40000000,
      floatWord20: 0x3e800000,
      active: true,
    },
  );
  assert.equal(state.readControllerRecord(1).active, false);
});

test("indexed controller float4 presentation failure leaves state unchanged", async () => {
  const state = createNativeIndexedRecordState();
  const sources = new Map([[0x1000, [1, 0x80000000, 3, 4]]]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  await assert.rejects(
    execute(
      action(0x0064, "indexed-controller-float4-write", [0x1000]),
      contextFor(state, sources, () => {
        throw new Error("presentation rejected");
      }),
    ),
    /presentation rejected/,
  );
  assert.equal(state.readControllerSubsystem().generation, 0);
  assert.equal(state.readControllerSubsystem().float4Words, undefined);

  const missing = await execute(
    action(0x0064, "indexed-controller-float4-write", [0x1000]),
    contextFor(state, sources),
  );
  assert.deepEqual(missing, {
    status: "stopped",
    reason: "indexed-controller-presentation-adapter-missing",
  });
});

test("operations 0068, 0069, and 006a route exact vectors by native mode", async () => {
  const state = createNativeIndexedRecordState();
  const sources = new Map([
    [0x1000, [0x3f800000, 0x40000000, 0x40400000]],
    [0x2000, [0xbf800000, 0xc0000000, 0xc0400000]],
  ]);
  const presentations = [];
  const context = contextFor(
    state,
    sources,
    plan => presentations.push(plan),
  );
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });

  await execute(action(
    0x0068,
    "indexed-controller-mode-initialize",
    [5, 0x1000],
  ), context);
  assert.equal(state.readControllerRecord(5).controlWord, 2);
  assert.deepEqual(
    state.readControllerRecord(5).vector52Words,
    sources.get(0x1000),
  );

  await execute(action(
    0x0069,
    "indexed-controller-mode-initialize",
    [6, 0x2000],
  ), context);
  assert.equal(state.readControllerRecord(6).controlWord, 3);
  assert.deepEqual(
    state.readControllerRecord(6).vector40Words,
    sources.get(0x2000),
  );

  await execute(action(
    0x006a,
    "indexed-controller-mode-initialize",
    [28, 0x1000, 0x2000],
  ), context);
  const modeFour = state.readControllerRecord(28);
  assert.equal(modeFour.controlWord, 4);
  assert.deepEqual(modeFour.vector40Words, sources.get(0x1000));
  assert.deepEqual(modeFour.vector52Words, sources.get(0x2000));
  assert.equal(modeFour.active, true);
  assert.equal(presentations.length, 3);
});

test("high indexed controller initializers do not invent presentation work", async () => {
  const state = createNativeIndexedRecordState();
  const sources = new Map([[0x1000, [1, 2, 3]]]);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeIndexedRecordSemanticHandlers(),
  });
  const result = await execute(action(
    0x0069,
    "indexed-controller-mode-initialize",
    [40, 0x1000],
  ), contextFor(state, sources));
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.mirrored, false);
  assert.deepEqual(state.readControllerRecord(40).vector40Words, [1, 2, 3]);
});

test("presentation adapter preserves the proven negated +0x34 callback words", async () => {
  let detail;
  const present = createNativeIndexedControllerPresentationAdapter({
    presentLowIndexInitialize(value) {
      detail = value;
    },
  });
  await present({
    kind: "indexed-controller-initialize",
    presentationRequired: true,
    vector52Words: [0, 0x3f800000, 0xbf800000],
  });
  assert.deepEqual(detail.vector52CallbackWords, [
    0x80000000, 0xbf800000, 0x3f800000,
  ]);
});
