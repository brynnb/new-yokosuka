import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0120SemanticHandlers,
  createNativeOperation0120State,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(...values) {
  return {
    semanticId: "native-operation-0120-record-field-control",
    arguments: values.map(word => ({
      kind: "constant",
      value: word,
    })),
  };
}

function modeTwoRecords() {
  return Array.from({ length: 32 }, (_, index) => ({
    word34: 0x4000 + index,
  }));
}

function records(...activeIndices) {
  const active = new Set(activeIndices);
  return Array.from({ length: 32 }, (_, index) => ({
    word00: active.has(index) ? 0x1000 + index * 4 : 0,
    word08: 0x8000 + index,
  }));
}

function execute() {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation0120SemanticHandlers(),
  });
}

function executeWithAdapter(applyRecordState) {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation0120SemanticHandlers({ applyRecordState }),
  });
}

test("operation 0x0120 mode zero writes all active fixed records", async () => {
  const state = createNativeOperation0120State();
  state.configureRecords(records(0, 7, 31));
  const result = await execute()(action(0, 1), {
    nativeOperation0120State: state,
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    mode: 0,
    value: 1,
    recordCount: 32,
  });
  assert.equal(result.result, 0);
  const current = state.readRecords();
  assert.equal(current[0].word08, 1);
  assert.equal(current[7].word08, 1);
  assert.equal(current[31].word08, 1);
});

test("operation 0x0120 mode zero clears inactive record dword +0x08", async () => {
  const state = createNativeOperation0120State();
  state.configureRecords(records(4));
  await execute()(action(0, 0xffffffff), {
    nativeOperation0120State: state,
  });
  const current = state.readRecords();
  assert.equal(current[4].word08, 0xffffffff);
  assert.equal(current[0].word08, 0);
  assert.equal(current[31].word08, 0);
});

test("operation 0x0120 mode one returns old +0x08 and conditionally writes", async () => {
  const state = createNativeOperation0120State();
  state.configureRecords(records(6));
  let result = await execute()(action(1, 6, 1), {
    nativeOperation0120State: state,
  });
  assert.equal(result.result, 0x8006);
  assert.equal(state.readRecords()[6].word08, 1);

  result = await execute()(action(1, 5, 1), {
    nativeOperation0120State: state,
  });
  assert.equal(result.result, 0x8005);
  assert.equal(state.readRecords()[5].word08, 0);
});

test("operation 0x0120 mode two returns and replaces exact dword +0x34", async () => {
  const state = createNativeOperation0120State();
  state.configureModeTwoRecords(modeTwoRecords());
  const result = await execute()(action(2, 19, 0xffffffff), {
    nativeOperation0120State: state,
  });
  assert.equal(result.result, 0x4013);
  assert.equal(state.readModeTwoRecords()[19].word34, 0xffffffff);
});

test("operation 0x0120 state requires the exact 32-record shape", () => {
  const state = createNativeOperation0120State();
  assert.throws(
    () => state.configureRecords(records().slice(1)),
    /exactly 32 fixed records/,
  );
  assert.throws(
    () => state.configureRecords([
      ...records().slice(0, 31),
      { word00: 0x100000000 },
    ]),
    /32-bit word/,
  );
  assert.throws(
    () => state.configureModeTwoRecords(modeTwoRecords().slice(1)),
    /exactly 32 fixed records/,
  );
});

test("operation 0x0120 stops before unavailable or unproved state", async () => {
  assert.equal(
    (await execute()(action(0, 1))).reason,
    "native-operation-0120-record-table-unavailable",
  );
  const state = createNativeOperation0120State();
  state.configureRecords(records());
  assert.equal(
    (await execute()(action(3, 1), {
      nativeOperation0120State: state,
    })).reason,
    "native-operation-0120-mode-unproved",
  );
  assert.equal(
    (await execute()(action(2, 2, 1), {
      nativeOperation0120State: state,
    })).reason,
    "native-operation-0120-mode-two-table-unavailable",
  );
});

test("operation 0x0120 integrates with scene state and rejects stale plans", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureNativeOperation0120Records(records(2));
  const context = createNativeSceneFieldRuntimeContext(scene);
  await execute()(action(0, 0), context);
  assert.equal(scene.readNativeOperation0120Records()[2].word08, 0);

  const state = createNativeOperation0120State();
  state.configureRecords(records(1));
  const plan = state.planModeZero(1);
  state.configureRecords(records(2));
  assert.throws(() => state.commit(plan), /changed before commit/);
});

test("operation 0x0120 applies the exact planned records through its adapter", async () => {
  const state = createNativeOperation0120State();
  state.configureRecords(records(4));
  const applied = [];
  const result = await executeWithAdapter(detail => {
    applied.push(detail);
    return true;
  })(action(1, 4, 0), { nativeOperation0120State: state });

  assert.equal(result.status, "continued");
  assert.equal(applied.length, 1);
  assert.equal(applied[0].mode, 1);
  assert.equal(applied[0].records[4].word08, 0);
  assert.equal(applied[0].records[3].word08, 0x8003);
});

test("operation 0x0120 fails closed before committing rejected adapters", async () => {
  const state = createNativeOperation0120State();
  state.configureRecords(records(4));
  const before = state.readRecords();

  let result = await executeWithAdapter(() => false)(
    action(0, 0),
    { nativeOperation0120State: state },
  );
  assert.equal(result.status, "stopped");
  assert.match(result.reason, /rejected the mutation/);
  assert.deepEqual(state.readRecords(), before);

  result = await executeWithAdapter(() => Promise.resolve(true))(
    action(0, 0),
    { nativeOperation0120State: state },
  );
  assert.equal(result.status, "stopped");
  assert.match(result.reason, /must be synchronous/);
  assert.deepEqual(state.readRecords(), before);
});
