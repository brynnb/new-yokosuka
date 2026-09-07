import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
  createNativeOperation013cSemanticHandlers,
} from "../play/events/NativeOperation013cRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(majorRoute, selector, ...values) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-operation-013c-container-control",
    arguments: [majorRoute, selector, ...values].map(value => ({
      kind: "constant",
      value,
    })),
  };
}

function runtime(state, adapters = {}) {
  const context = createNativeSceneFieldRuntimeContext(state);
  Object.assign(context, adapters);
  return {
    context,
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation013cSemanticHandlers(),
    }),
  };
}

test("operation 0x013c writes exact fixed-container dword +0x08", async () => {
  const state = createNativeSceneGameplayState();
  const { execute, context } = runtime(state);
  assert.equal(
    (await execute(action(2, 1, 0x12345678), context)).status,
    "continued",
  );
  assert.equal(
    state.readNativeOperation013cContainer().word08,
    0x12345678,
  );
});

test("operation 0x013c selector ten writes the native platform default", async () => {
  const state = createNativeSceneGameplayState();
  const { execute, context } = runtime(state);

  assert.equal(
    (await execute(action(0, 10, -1), context)).mutation.value,
    -1,
  );
  assert.equal(
    state.readNativeOperation013cContainer().platformWord72,
    -1,
  );
  assert.equal(
    (await execute(action(0, 10, 0), context)).mutation.value,
    3000,
  );
  assert.equal(
    state.readNativeOperation013cContainer().platformWord72,
    3000,
  );
});

test("operation 0x013c resolves and installs only eligible records", async () => {
  const state = createNativeSceneGameplayState();
  const eligible = { record: "eligible" };
  const zeroWord = { record: "zero-word" };
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x1000,
    record: eligible,
    word04: 1,
    eligibleForOffset52: true,
  });
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x2000,
    record: zeroWord,
    word04: 0,
    eligibleForOffset52: true,
  });
  const { execute, context } = runtime(state);

  assert.equal(
    (await execute(action(0, 5, 0x1000), context)).result,
    1,
  );
  assert.equal(
    (await execute(action(0, 5, 0x3000), context)).result,
    0,
  );
  assert.equal(
    (await execute(action(2, 2, 0x1000), context)).mutation.applied,
    true,
  );
  assert.equal(
    state.readNativeOperation013cContainer().record52,
    eligible,
  );
  assert.equal(
    (await execute(action(2, 2, 0x2000), context)).mutation.applied,
    false,
  );
  assert.equal(
    state.readNativeOperation013cContainer().record52,
    eligible,
  );
});

test("operation 0x013c route 2 selector 3 compares the resolved record to +0x34", async () => {
  const state = createNativeSceneGameplayState();
  const selected = { record: "selected" };
  const other = { record: "other" };
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x1000,
    record: selected,
    word04: 1,
    eligibleForOffset52: true,
  });
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x2000,
    record: other,
    word04: 1,
    eligibleForOffset52: true,
  });
  state.configureNativeOperation013cContainer({ record52: selected });
  const { execute, context } = runtime(state);

  assert.equal((await execute(action(2, 3, 0x1000), context)).result, 1);
  assert.equal((await execute(action(2, 3, 0x2000), context)).result, 0);
  assert.equal((await execute(action(2, 3, 0x3000), context)).result, 0);
});

test("operation 0x013c activity query preserves platform fallback", async () => {
  const state = createNativeSceneGameplayState();
  let platformQueries = 0;
  const { execute, context } = runtime(state, {
    queryNativeOperation013cActivity() {
      platformQueries += 1;
      return true;
    },
  });
  assert.equal((await execute(action(0, 2), context)).result, 1);
  assert.equal(platformQueries, 1);

  state.configureNativeOperation013cContainer({ record60: { active: true } });
  assert.equal((await execute(action(0, 2), context)).result, 1);
  assert.equal(platformQueries, 1);
});

test("operation 0x013c creates only when argument three is unresolved", async () => {
  const state = createNativeSceneGameplayState();
  const existing = { record: "existing" };
  const created = { record: "created" };
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x3000,
    record: existing,
  });
  state.configureNativeOperation013cContainer({ word68: 9 });
  const createdRequests = [];
  const { execute, context } = runtime(state, {
    createNativeOperation013cRecord(detail) {
      createdRequests.push(detail);
      return created;
    },
  });

  assert.equal(
    (await execute(action(0, 0, 0x2000, 0x3000), context)).result,
    0,
  );
  assert.equal(createdRequests.length, 0);
  assert.equal(state.readNativeOperation013cContainer().word68, 9);

  assert.equal(
    (await execute(action(0, 0, 0x2000, 0x4000), context)).result,
    1,
  );
  assert.deepEqual(createdRequests, [{
    argument2: 0x2000,
    argument3: 0x4000,
  }]);
  assert.equal(state.readNativeOperation013cContainer().word68, 0);
  assert.equal(
    state.readNativeOperation013cContainer().record56,
    created,
  );
  assert.equal(
    (await execute(action(0, 5, 0x4000), context)).result,
    1,
  );
});

test("operation 0x013c completion clears activity but retains resolution", async () => {
  const state = createNativeSceneGameplayState();
  const created = { record: "resident" };
  const { execute, context } = runtime(state, {
    createNativeOperation013cRecord() {
      return {
        schema: NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
        record: created,
        activityComplete: true,
      };
    },
  });

  const result = await execute(action(0, 0, 0x2000, 0x4000), context);

  assert.equal(result.result, 1);
  assert.deepEqual(result.mutation, {
    recordCreated: true,
    activityCompleted: true,
  });
  assert.equal(state.readNativeOperation013cContainer().record56, null);
  assert.equal((await execute(action(0, 5, 0x4000), context)).result, 1);
  assert.equal((await execute(action(0, 2), context)).result, 0);
});

test("operation 0x013c release preserves native missing-record no-op", async () => {
  const state = createNativeSceneGameplayState();
  const record = { record: "release" };
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x5000,
    record,
    word04: 1,
    eligibleForOffset52: true,
  });
  state.configureNativeOperation013cContainer({ record52: record });
  const released = [];
  const { execute, context } = runtime(state, {
    releaseNativeOperation013cRecord(value) {
      released.push(value);
    },
  });

  assert.deepEqual(
    (await execute(action(0, 6, 0x6000), context)).mutation,
    { released: false },
  );
  assert.equal(
    (await execute(action(0, 6, 0x5000), context))
      .mutation.clearedRecord52,
    true,
  );
  assert.deepEqual(released, [record]);
  assert.equal(state.readNativeOperation013cContainer().record52, null);
  assert.equal((await execute(action(0, 5, 0x5000), context)).result, 0);
});

test("operation 0x013c state-owned activity and opaque mutations stay exact", async () => {
  const state = createNativeSceneGameplayState();
  const record = { record: "release" };
  state.configureNativeOperation013cRecord({
    sourcePointer: 0x5000,
    record,
  });
  const { execute, context } = runtime(state);
  assert.deepEqual(await execute(action(0, 2), context), { result: 0 });
  state.nativeOperation013cState.configurePlatformActivity(true);
  assert.deepEqual(await execute(action(0, 2), context), { result: 1 });
  assert.deepEqual(
    await execute(action(0, 0, 0x2000, 0x4000), context),
    {
      status: "stopped",
      reason: "native-operation-013c-record-creator-missing",
    },
  );
  assert.deepEqual(await execute(action(0, 6, 0x5000), context), {
    status: "stopped",
    reason: "native-operation-013c-record-releaser-missing",
  });
});

test("operation 0x013c reference-counts exact two-string archive records", async () => {
  const state = createNativeSceneGameplayState();
  const archiveResource = { archive: "OP02.afs" };
  const acquired = [];
  const released = [];
  const { execute, context } = runtime(state, {
    resolveNativeStaticString(pointer) {
      return new Map([
        [0x2748, "/scene/01/OP02/"],
        [0x2758, "OP02.afs"],
      ]).get(pointer);
    },
    acquireNativeOperation013cArchive(detail) {
      acquired.push(detail);
      return archiveResource;
    },
    releaseNativeOperation013cArchive(detail) {
      released.push(detail);
    },
  });

  const first = await execute(action(1, 0, 0x2748, 0x2758), context);
  const second = await execute(action(1, 0, 0x2748, 0x2758), context);
  assert.equal(first.result, second.result);
  assert.equal(first.result.kind, "native-operation-013c-archive-record");
  assert.deepEqual(acquired, [{
    path: "/scene/01/OP02/",
    name: "OP02.afs",
  }]);

  assert.equal((await execute(action(1, 1, first.result), context)).result, 1);
  assert.deepEqual(released, []);
  assert.equal((await execute(action(1, 1, first.result), context)).result, 0);
  assert.deepEqual(released, [{
    path: "/scene/01/OP02/",
    name: "OP02.afs",
    resource: archiveResource,
  }]);
  assert.equal((await execute(action(1, 1, first.result), context)).result, 0);
});

test("operation 0x013c starts one exact subordinate archive activity", async () => {
  const state = createNativeSceneGameplayState();
  const activity = { activity: "OP02:0:1" };
  let starts = 0;
  const { execute, context } = runtime(state, {
    resolveNativeStaticString(pointer) {
      return pointer === 1 ? "/scene/01/OP02/" : "OP02.afs";
    },
    acquireNativeOperation013cArchive() {
      return { loaded: true };
    },
    releaseNativeOperation013cArchive() {},
    startNativeOperation013cArchiveActivity(detail) {
      starts += 1;
      assert.equal(detail.archive.path, "/scene/01/OP02/");
      assert.equal(detail.firstIndex, 0);
      assert.equal(detail.secondIndex, 1);
      return {
        schema: NATIVE_OPERATION_013C_RECORD_LIFECYCLE,
        record: activity,
        activityComplete: false,
      };
    },
  });
  const archive = (await execute(action(1, 0, 1, 2), context)).result;

  assert.deepEqual(
    await execute(action(0, 8, archive, 0, 1), context),
    {
      result: 1,
      mutation: {
        archiveActivityStarted: true,
        activityCompleted: false,
      },
    },
  );
  assert.equal(starts, 1);
  assert.equal((await execute(action(0, 2), context)).result, 1);
  assert.equal(
    (await execute(action(0, 8, archive, 0, 1), context)).result,
    0,
  );
  assert.equal(starts, 1);

  assert.equal(
    state.nativeOperation013cState.completeCreatedRecordActivity(activity),
    true,
  );
  assert.equal((await execute(action(0, 2), context)).result, 0);
  assert.equal(
    (await execute(action(0, 8, archive, 0, 1), context)).result,
    0,
  );
});
