import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation0166SemanticHandlers,
  createNativeOperation0166State,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(mode, ...values) {
  return {
    semanticId: "native-operation-0166-control",
    arguments: [mode, ...values].map(value => (
      typeof value === "string"
        ? {
            kind: "constant",
            value: (
              value.charCodeAt(0)
              | value.charCodeAt(1) << 8
              | value.charCodeAt(2) << 16
              | value.charCodeAt(3) << 24
            ) >>> 0,
            ascii: value,
          }
        : { kind: "constant", value }
    )),
  };
}

function executor(handlers = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation0166SemanticHandlers(handlers),
  });
}

test("operation 0x0166 mode two stores Boolean control and gates cleanup", async () => {
  const state = createNativeOperation0166State();
  state.configureControl({
    modeTwoControlDword: 0,
    modeEightControlDword: 0,
    modeTwoCleanupRequired: true,
  });
  const cleanups = [];
  const context = {
    nativeOperation0166State: state,
    clearNativeOperation0166ModeTwoLinkedRecords() {
      cleanups.push("cleanup");
    },
  };
  assert.equal((await executor()(action(2, 9), context)).result, 1);
  assert.equal(state.readControl().modeTwoControlDword, 1);
  assert.deepEqual(cleanups, []);
  assert.equal((await executor()(action(2, 0), context)).result, 1);
  assert.equal(state.readControl().modeTwoControlDword, 0);
  assert.deepEqual(cleanups, ["cleanup"]);
});

test("operation 0x0166 mode zero initializes the exact scene scheduler resources", async () => {
  const state = createNativeOperation0166State();
  const requests = [];
  const modeZero = action(0, 0x1000, 0x1010, "DGCT");
  modeZero.arguments[1].kind = "static-pointer";
  modeZero.arguments[2].kind = "static-pointer";
  const strings = new Map([
    [0x1000, "scene/01/D000"],
    [0x1010, "CYCLEMAN.BIN"],
  ]);
  const result = await executor({
    initializeSceneScheduler(request) {
      requests.push(request);
      return { accepted: true };
    },
  })(modeZero, {
    nativeOperation0166State: state,
    resolveNativeStaticString: pointer => strings.get(pointer),
  });
  assert.equal(result.result, 1);
  assert.deepEqual(requests, [{
    path: "scene/01/D000",
    name: "CYCLEMAN.BIN",
    areaTag: "DGCT",
    nativeOwnerTagGlobal: 0x0c21bcb0,
    nativeStreamDirectoryTemplate: "scene/%02d/stream",
    nativeIndexName: "HUMANS.idx",
    nativeIndexType: "MOBJ",
  }]);
  assert.deepEqual(state.readSceneSchedulerBootstrap(), requests[0]);
});

test("operation 0x0166 mode zero fails before committing incomplete resources", async () => {
  const state = createNativeOperation0166State();
  const modeZero = action(0, 0x1000, 0x1010, "DGCT");
  modeZero.arguments[1].kind = "static-pointer";
  modeZero.arguments[2].kind = "static-pointer";
  const result = await executor()(modeZero, {
    nativeOperation0166State: state,
    resolveNativeStaticString: pointer => (
      pointer === 0x1000 ? "scene/01/D000" : "CYCLEMAN.BIN"
    ),
  });
  assert.equal(
    result.reason,
    "native-operation-0166-scene-scheduler-initializer-missing",
  );
  assert.equal(state.readSceneSchedulerBootstrap(), undefined);
});

test("operation 0x0166 mode eight only notifies on a zero-to-one edge", async () => {
  const state = createNativeOperation0166State();
  state.configureControl({
    modeTwoControlDword: 0,
    modeEightControlDword: 0,
    modeTwoCleanupRequired: false,
  });
  const notifications = [];
  const context = {
    nativeOperation0166State: state,
    notifyNativeOperation0166ModeEightEnabled(value) {
      notifications.push(value);
    },
  };
  await executor()(action(8, 1), context);
  await executor()(action(8, 7), context);
  await executor()(action(8, 0), context);
  await executor()(action(8, 0), context);
  assert.deepEqual(notifications, [1]);
  assert.equal(state.readControl().modeEightControlDword, 0);
});

test("operation 0x0166 mode thirteen writes the first matching record", async () => {
  const state = createNativeOperation0166State();
  state.configureModeThirteenRecords([
    { objectTag: "FUKU", field90: 3 },
    { objectTag: "AKIR", field90: 4 },
    { objectTag: "AKIR", field90: 5 },
  ]);
  const context = { nativeOperation0166State: state };
  assert.equal(
    (await executor()(action(13, "AKIR", 0xffffffff), context)).result,
    1,
  );
  assert.deepEqual(state.readModeThirteenRecords(), [
    { objectTag: "FUKU", field90: 3 },
    { objectTag: "AKIR", field90: 0xffffffff },
    { objectTag: "AKIR", field90: 5 },
  ]);
  assert.equal(
    (await executor()(action(13, "MISS", 8), context)).result,
    0,
  );
});

test("operation 0x0166 modes three and eighteen preserve cleanup order", async () => {
  const calls = [];
  const execute = executor({
    releaseModeThreeLists() {
      calls.push("three");
    },
    releaseModeEighteenLists() {
      calls.push("eighteen");
    },
  });
  assert.equal((await execute(action(3))).result, 1);
  assert.equal((await execute(action(18))).result, 1);
  assert.deepEqual(calls, ["three", "three", "eighteen"]);
});

test("operation 0x0166 shared state owns exact empty-list cleanup", async () => {
  const state = createNativeOperation0166State();
  state.configureControl({
    modeTwoControlDword: 1,
    modeEightControlDword: 1,
    modeTwoCleanupRequired: false,
  });
  state.configureCleanupLists({
    modeThreeFirstListCount: 2,
    modeThreeSecondListCount: 3,
    modeEighteenFirstListCount: 4,
    modeEighteenSecondListCount: 5,
  });
  const context = {
    nativeOperation0166State: state,
    releaseNativeOperation0166ModeThreeLists: () => (
      state.releaseModeThreeLists()
    ),
    releaseNativeOperation0166ModeEighteenLists: () => (
      state.releaseModeEighteenLists()
    ),
  };
  assert.equal((await executor()(action(18), context)).result, 1);
  assert.deepEqual(state.readCleanupLists(), {
    modeTwoLinkedRecordCount: 0,
    modeThreeFirstListCount: 0,
    modeThreeSecondListCount: 0,
    modeEighteenFirstListCount: 0,
    modeEighteenSecondListCount: 0,
  });
});

test("operation 0x0166 stops before missing state or subordinate adapters", async () => {
  const state = createNativeOperation0166State();
  state.configureControl({
    modeTwoControlDword: 1,
    modeEightControlDword: 0,
    modeTwoCleanupRequired: true,
  });
  let result = await executor()(action(2, 0), {
    nativeOperation0166State: state,
  });
  assert.equal(result.reason, "native-operation-0166-mode-two-cleanup-missing");
  assert.equal(state.readControl().modeTwoControlDword, 1);

  result = await executor()(action(8, 1), {
    nativeOperation0166State: state,
  });
  assert.equal(result.reason, "native-operation-0166-mode-eight-callback-missing");
  assert.equal(state.readControl().modeEightControlDword, 0);
  assert.equal(
    (await executor()(action(13, "AKIR", 1), {
      nativeOperation0166State: state,
    })).reason,
    "native-operation-0166-record-state-unavailable",
  );
  assert.equal(
    (await executor()(action(3))).reason,
    "native-operation-0166-mode-three-adapter-missing",
  );
  assert.equal(
    (await executor()(action(18))).reason,
    "native-operation-0166-mode-eighteen-adapter-missing",
  );
  assert.equal(
    (await executor()(action(4, "AKIR", 1))).reason,
    "native-operation-0166-actor-record-state-unavailable",
  );
});

test("operation 0x0166 preserves the staged actor attachment lifecycle", async () => {
  const state = createNativeOperation0166State();
  state.configureActorLifecycleRecords([
    { actorTag: "SERA", list: "inactive" },
    { actorTag: "HARY", list: "dynamic", attachment: 41, bound: true },
  ]);
  const execute = executor();
  const context = { nativeOperation0166State: state };

  assert.equal((await execute(action(27, "SERA"), context)).result, 0);
  assert.deepEqual(state.readActorLifecycleRecords()[0], {
    actorTag: "SERA",
    list: "active",
    enabled: true,
    attachment: 0,
    bound: false,
  });
  assert.equal((await execute(action(4, "SERA", 1), context)).result, 1);
  const token = (await execute(action(5, "SERA"), context)).result;
  assert.ok(token > 0);
  assert.equal((await execute(action(6, token), context)).result, 1);
  assert.equal(state.readActorLifecycleRecords()[0].attachment, token);
  assert.equal((await execute(action(7, token), context)).result, 1);
  assert.equal(state.readActorLifecycleRecords()[0].attachment, 0);

  assert.equal((await execute(action(27, "HARY"), context)).result, 41);
  assert.equal(
    state.readActorLifecycleRecords().some(record => record.actorTag === "HARY"),
    false,
  );
});

test("operation 0x0166 rejects stale state plans", () => {
  const state = createNativeOperation0166State();
  state.configureControl({
    modeTwoControlDword: 0,
    modeEightControlDword: 0,
    modeTwoCleanupRequired: false,
  });
  const plan = state.planModeTwo(1);
  state.configureModeThirteenRecords([]);
  assert.throws(() => state.commit(plan), /changed before commit/);
});

test("operation 0x0166 mode 28 clears its exact fixed global", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeOperation0166SemanticHandlers(),
  });
  const mode28 = action(28);
  mode28.semanticId = "native-operation-0166-mode-28-global-clear";
  const result = await execute(
    mode28,
    {
      writeNativeOperation0166Mode28GlobalDword(value) {
        writes.push(value);
        return 7;
      },
    },
  );
  assert.deepEqual(writes, [0]);
  assert.deepEqual(result, {
    status: "continued",
    result: 0,
    mutation: { mode: 28, previous: 7, value: 0 },
  });
});

test("operation 0x0166 mode 29 preserves its exact bounded poll", async () => {
  const state = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(state);
  const execute = executor();
  state.writeNativeOperation0166Mode28GlobalDword(0);
  const mode29 = action(29);
  mode29.semanticId = "native-operation-0166-mode-29-bounded-poll";
  for (let counter = 1; counter < 5; counter += 1) {
    assert.equal((await execute(mode29, context)).result, 1);
  }
  assert.equal((await execute(mode29, context)).reason, (
    "native-operation-0166-mode-29-active-dword-reader-missing"
  ));
  context.readNativeOperation0166Mode29ActiveDword = () => 1;
  assert.equal((await execute(mode29, context)).result, 1);
  context.readNativeOperation0166Mode29ActiveDword = () => 0;
  assert.equal((await execute(mode29, context)).result, 0);
  assert.equal(state.nativeOperation0166Mode28GlobalDword, 6);
});

test("operation 0x0166 mode 30 queries exact raw record state", async () => {
  const state = createNativeOperation0166State();
  const execute = executor();
  const mode30 = action(30, 0);
  mode30.semanticId = "native-operation-0166-mode-30-record-state-query";
  const context = { nativeOperation0166State: state };
  mode30.arguments[1].value = 0x524f4f44;
  assert.equal((await execute(mode30, context)).result, 1);
  mode30.arguments[1].value = 0x11111111;
  assert.match((await execute(mode30, context)).reason, /state-unavailable/);
  state.configureModeThirtyRecords([
    { key: 0x11111111, state: 2 },
    { key: 0x22222222, state: 1 },
  ]);
  assert.equal((await execute(mode30, context)).result, 1);
  mode30.arguments[1].value = 0x22222222;
  assert.equal((await execute(mode30, context)).result, 0);
  mode30.arguments[1].value = 0x33333333;
  assert.equal((await execute(mode30, context)).result, 0);
});
