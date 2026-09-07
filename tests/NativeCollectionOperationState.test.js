import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCollectionOperationSemanticHandlers,
  createNativeCollectionOperationState,
} from "../play/events/NativeCollectionOperationState.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(index, quantity, auxiliary) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-collection-byte-increment",
    arguments: [
      { kind: "constant", value: index },
      { kind: "constant", value: quantity },
      { kind: "constant", value: 0 },
      { kind: "constant", value: auxiliary ? 1 : 0 },
    ],
  };
}

function queryAction(index, auxiliary) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-collection-byte-query",
    arguments: [
      { kind: "constant", value: index },
      { kind: "constant", value: auxiliary ? 1 : 0 },
    ],
  };
}

function runtime(collectionState, callbacks = {}) {
  const context = createNativeSceneFieldRuntimeContext(
    createNativeSceneGameplayState(),
    { collectionState },
  );
  Object.assign(context, callbacks);
  return {
    context,
    execute: createNativeEventOperationExecutor({
      handlers: createNativeCollectionOperationSemanticHandlers(),
    }),
  };
}

test("primary collection increments retain exact saturation result", async () => {
  const collection = createNativeCollectionOperationState();
  const bytes = Array(256).fill(0);
  bytes[10] = 250;
  collection.configurePrimaryBytes(bytes);
  const prepared = [];
  const finalized = [];
  const { execute, context } = runtime(collection, {
    prepareLowCollectionIndex: index => prepared.push(index),
    finalizePrimaryCollectionMutation: detail => finalized.push(detail),
  });
  assert.equal((await execute(action(10, 5, false), context)).result, 1);
  assert.equal(collection.readPrimaryByte(10), 255);
  assert.equal((await execute(action(10, 1, false), context)).result, 0);
  assert.equal(collection.readPrimaryByte(10), 255);
  assert.deepEqual(prepared, [10, 10]);
  assert.equal(finalized.length, 2);
});

test("primary collection special callbacks remain exact adapter routes", async () => {
  const collection = createNativeCollectionOperationState();
  collection.configurePrimaryBytes(Array(256).fill(0));
  const special = [];
  const { execute, context } = runtime(collection, {
    prepareLowCollectionIndex() {},
    invokeCollectionSpecialCallback: detail => special.push(detail),
    finalizePrimaryCollectionMutation() {},
  });
  await execute(action(51, 1, false), context);
  await execute(action(85, 1, false), context);
  await execute(action(89, 1, false), context);
  assert.deepEqual(special, [
    { kind: "fixed-route", argument0: 0, argument1: 0x7080 },
    { kind: "registered-request", argument: 0x0321 },
    { kind: "registered-request", argument: 0x0320 },
  ]);
});

test("auxiliary collection allocates the exact fallback record", async () => {
  const collection = createNativeCollectionOperationState();
  const records = Array.from(
    { length: 32 },
    (_, index) => ({ valueByte: 0, selectorByte: index + 32 }),
  );
  records[7] = { valueByte: 250, selectorByte: 0xff };
  collection.configureAuxiliaryRecords(records);
  const { execute, context } = runtime(collection);
  assert.equal((await execute(action(3, 5, true), context)).result, 1);
  assert.deepEqual(collection.readAuxiliaryRecords()[0], {
    valueByte: 255,
    selectorByte: 3,
  });
  assert.deepEqual(collection.readAuxiliaryRecords()[31], {
    valueByte: 0,
    selectorByte: 0xff,
  });
});

test("invalid and unavailable collection routes fail closed", async () => {
  const collection = createNativeCollectionOperationState();
  collection.configurePrimaryBytes(Array(256).fill(0));
  const configured = runtime(collection);
  assert.equal(
    (await configured.execute(action(300, 1, false), configured.context)).result,
    0,
  );
  const unavailable = runtime(createNativeCollectionOperationState());
  assert.deepEqual(
    await unavailable.execute(action(1, 1, false), unavailable.context),
    {
      status: "stopped",
      reason: "native-collection-primary-state-unavailable",
    },
  );
});

test("collection queries preserve distinct primary and auxiliary bounds", async () => {
  const collection = createNativeCollectionOperationState();
  const bytes = Array(256).fill(0);
  bytes[234] = 0xfe;
  collection.configurePrimaryBytes(bytes);
  const records = Array.from(
    { length: 32 },
    () => ({ valueByte: 0, selectorByte: 0xff }),
  );
  records[0] = { valueByte: 0x81, selectorByte: 28 };
  collection.configureAuxiliaryRecords(records);
  const { execute, context } = runtime(collection);
  assert.equal((await execute(queryAction(234, false), context)).result, 0xfe);
  assert.equal((await execute(queryAction(235, false), context)).result, 0);
  assert.equal((await execute(queryAction(28, true), context)).result, 0x81);
  assert.equal((await execute(queryAction(29, true), context)).result, 0);
});
