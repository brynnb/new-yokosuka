import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeGlobalControllerSemanticHandlers,
} from "../play/events/NativeGlobalControllerRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(semanticId, selector, secondArgument) {
  const arguments_ = [{ kind: "constant", value: selector >>> 0 }];
  if (secondArgument !== undefined) {
    arguments_.push({ kind: "constant", value: secondArgument });
  }
  return {
    kind: "engineOperation",
    semanticId,
    callFileOffset: "0x1234",
    arguments: arguments_,
  };
}

function controllerRuntime({
  initializeGlobalControllerRange,
  cleanupGlobalControllerRange,
} = {}) {
  const state = createNativeSceneGameplayState();
  const context = {
    ...createNativeSceneFieldRuntimeContext(state),
    location: { functionId: "0x1000" },
  };
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGlobalControllerSemanticHandlers({
      initializeGlobalControllerRange,
      cleanupGlobalControllerRange,
    }),
  });
  return { state, context, execute };
}

test("selector -1 consumes exact queued event codes and otherwise returns -1", async () => {
  const { state, context, execute } = controllerRuntime();
  state.enqueueGlobalControllerEvent(0x314b4254);
  assert.deepEqual(await execute(action(
    "global-runtime-controller-event-poll",
    -1,
  ), context), { result: 0x314b4254 });
  assert.deepEqual(await execute(action(
    "global-runtime-controller-event-poll",
    -1,
  ), context), { result: -1 });
});

test("initializes the exact operation-0x0116 controller fields", async () => {
  const rangeCalls = [];
  const { state, context, execute } = controllerRuntime({
    initializeGlobalControllerRange: detail => rangeCalls.push(detail),
  });
  state.writeNativeField({
    offset: 0x0c22476b,
    width: 1,
    value: 0xed,
  });

  assert.deepEqual(await execute(action(
    "global-runtime-controller-initialize",
    0,
    0x0c345678,
  ), context), { result: -1 });
  assert.deepEqual(rangeCalls, [{
    argument0: 15,
    argument1: 7,
    argument2: 0,
    source: {
      functionFileOffset: "0x1000",
      callFileOffset: "0x1234",
    },
  }]);
  const expected = new Map([
    [0x0c22476b, [1, 0x0d]],
    [0x0c224788, [4, 0x0c345678]],
    [0x0c22478c, [4, 0xffffffff]],
    [0x0c224770, [4, 0xffffffff]],
    [0x0c29b138, [4, 0xffffffff]],
    [0x0c29b134, [4, 0xffffffff]],
    [0x0c224758, [4, 0x00006aaa]],
    [0x0c22475c, [4, 0x40200000]],
    [0x0c224760, [4, 0x40200000]],
    [0x0c224764, [4, 0x3f199999]],
    [0x0c2247cc, [4, 0]],
    [0x0c2247c8, [4, 0]],
    [0x0c29b130, [4, 0]],
    [0x0c22483c, [4, 0]],
    [0x0c224840, [4, 0]],
    [0x0c224844, [4, 0]],
    [0x0c224848, [4, 0]],
    [0x0c22484c, [4, 0]],
    [0x0c29b13c, [4, 0]],
  ]);
  for (const [offset, [width, value]] of expected) {
    assert.equal(state.readNativeField({ offset, width }), value);
  }
});

test("initialization stops before mutation when prerequisites are absent", async () => {
  const withMissingFlag = controllerRuntime({
    initializeGlobalControllerRange: () => {},
  });
  assert.match(
    (await withMissingFlag.execute(action(
      "global-runtime-controller-initialize",
      0,
      0x1234,
    ), withMissingFlag.context)).reason,
    /flag byte is unavailable/,
  );
  assert.equal(withMissingFlag.state.nativeFields.size, 0);

  const withMissingAdapter = controllerRuntime();
  delete withMissingAdapter.context.initializeGlobalControllerRange;
  withMissingAdapter.state.writeNativeField({
    offset: 0x0c22476b,
    width: 1,
    value: 0xe7,
  });
  assert.deepEqual(await withMissingAdapter.execute(action(
    "global-runtime-controller-initialize",
    0,
    0x1234,
  ), withMissingAdapter.context), {
    status: "stopped",
    reason: "global-runtime-controller-range-adapter-missing",
  });
  assert.equal(withMissingAdapter.state.nativeFields.size, 1);
});

test("scene state retains the exact initialized controller range", async () => {
  const { state, context, execute } = controllerRuntime();
  state.writeNativeField({
    offset: 0x0c22476b,
    width: 1,
    value: 0,
  });
  assert.deepEqual(await execute(action(
    "global-runtime-controller-initialize",
    0,
    0x0c345678,
  ), context), { result: -1 });
  assert.deepEqual(state.globalController.initializedRange, {
    argument0: 15,
    argument1: 7,
    argument2: 0,
  });
});

test("resets exact controller fields without an inactive cleanup", async () => {
  const cleanupCalls = [];
  const { state, context, execute } = controllerRuntime({
    cleanupGlobalControllerRange: detail => cleanupCalls.push(detail),
  });
  for (const [offset, value] of [
    [0x0c29b130, 1],
    [0x0c29b134, 12],
    [0x0c224848, 13],
    [0x0c2247cc, 14],
    [0x0c2247c8, 15],
  ]) {
    state.writeNativeField({ offset, width: 4, value });
  }
  assert.deepEqual(await execute(action(
    "global-runtime-controller-reset",
    2,
  ), context), { result: 0 });
  assert.deepEqual(cleanupCalls, []);
  assert.equal(state.readNativeField({ offset: 0x0c29b130, width: 4 }), 0);
  assert.equal(
    state.readNativeField({ offset: 0x0c29b134, width: 4 }),
    0xffffffff,
  );
  for (const offset of [0x0c224848, 0x0c2247cc, 0x0c2247c8]) {
    assert.equal(state.readNativeField({ offset, width: 4 }), 0);
  }
});

test("performs the exact active-mode cleanup before reset writes", async () => {
  const observations = [];
  const runtime = controllerRuntime({
    cleanupGlobalControllerRange: (detail) => {
      observations.push({
        detail,
        mode: runtime.state.readNativeField({
          offset: 0x0c29b130,
          width: 4,
        }),
      });
    },
  });
  runtime.state.writeNativeField({
    offset: 0x0c29b130,
    width: 4,
    value: 5,
  });
  runtime.state.writeNativeField({
    offset: 0x0c2247d0,
    width: 1,
    value: 0x12,
  });
  runtime.state.writeNativeField({
    offset: 0x0c2247d1,
    width: 1,
    value: 0x34,
  });
  for (const offset of [0x0c29b134, 0x0c224848, 0x0c2247cc, 0x0c2247c8]) {
    runtime.state.writeNativeField({ offset, width: 4, value: 7 });
  }
  assert.deepEqual(await runtime.execute(action(
    "global-runtime-controller-reset",
    2,
  ), runtime.context), { result: 0 });
  assert.deepEqual(observations, [{
    detail: {
      argument0: 0x12,
      argument1: 0x34,
      source: {
        functionFileOffset: "0x1000",
        callFileOffset: "0x1234",
      },
    },
    mode: 5,
  }]);
  assert.equal(
    runtime.state.readNativeField({ offset: 0x0c29b130, width: 4 }),
    0,
  );
});

test("active reset executes the shared selector-zero byte writer", async () => {
  const runtime = controllerRuntime();
  for (const [offset, width, value] of [
    [0x0c29b130, 4, 2],
    [0x0c2247d0, 1, 37],
    [0x0c2247d1, 1, 9],
    [0x0c29b134, 4, 1],
    [0x0c224848, 4, 1],
    [0x0c2247cc, 4, 1],
    [0x0c2247c8, 4, 1],
  ]) {
    runtime.state.writeNativeField({ offset, width, value });
  }
  assert.deepEqual(await runtime.execute(action(
    "global-runtime-controller-reset",
    2,
  ), runtime.context), { result: 0 });
  assert.equal(
    runtime.state.readNativeField({ offset: 0x0c216cf4, width: 1 }),
    37,
  );
  assert.equal(
    runtime.state.readNativeField({ offset: 0x0c216cf3, width: 1 }),
    37,
  );
  assert.equal(
    runtime.state.readNativeField({ offset: 0x0c216cf6, width: 1 }),
    9,
  );
  assert.equal(
    runtime.state.readNativeField({ offset: 0x0c216d24, width: 2 }),
    0,
  );
});

test("active reset stops without mutation when cleanup is unavailable", async () => {
  for (const missingAdapter of [false, true]) {
    const runtime = controllerRuntime(
      missingAdapter
        ? {}
        : { cleanupGlobalControllerRange: () => {} },
    );
    runtime.state.writeNativeField({
      offset: 0x0c29b130,
      width: 4,
      value: 3,
    });
    runtime.state.writeNativeField({
      offset: 0x0c2247d0,
      width: 1,
      value: 0x12,
    });
    if (missingAdapter) {
      delete runtime.context.cleanupGlobalControllerRange;
      runtime.state.writeNativeField({
        offset: 0x0c2247d1,
        width: 1,
        value: 0x34,
      });
    }
    const result = await runtime.execute(action(
      "global-runtime-controller-reset",
      2,
    ), runtime.context);
    assert.equal(result.status, "stopped");
    assert.equal(
      runtime.state.readNativeField({ offset: 0x0c29b130, width: 4 }),
      3,
    );
  }
});

test("writes exact selector-zero controller bytes and range clamp", async () => {
  const { state, context, execute } = controllerRuntime();
  const selectionAction = (primary, secondary) => ({
    kind: "engineOperation",
    semanticId: "global-runtime-controller-byte-selection",
    arguments: [
      { kind: "constant", value: 0 },
      { kind: "constant", value: primary },
      { kind: "constant", value: secondary },
    ],
  });

  assert.equal(
    (await execute(selectionAction(63, 9), context)).status,
    "continued",
  );
  assert.equal(
    state.readNativeField({ offset: 0x0c216cf4, width: 1 }),
    63,
  );
  assert.equal(
    state.readNativeField({ offset: 0x0c216cf3, width: 1 }),
    63,
  );
  assert.equal(
    state.readNativeField({ offset: 0x0c216cf6, width: 1 }),
    9,
  );
  assert.equal(
    state.readNativeField({ offset: 0x0c216d24, width: 2 }),
    0,
  );

  await execute(selectionAction(65, 0x123), context);
  assert.equal(
    state.readNativeField({ offset: 0x0c216cf4, width: 1 }),
    0,
  );
  assert.equal(
    state.readNativeField({ offset: 0x0c216cf6, width: 1 }),
    0x23,
  );
});

test("queries the exact secondary-index status branches", async () => {
  const { state, context, execute } = controllerRuntime();
  const query = () => execute(action(
    "global-runtime-controller-status-query",
    3,
  ), context);

  state.writeNativeField({
    offset: 0x0c29b134,
    width: 4,
    value: 17,
  });
  assert.deepEqual(await query(), { result: 17 });

  for (const [mode, secondaryIndex, result] of [
    [2, -1, 0],
    [3, -4, 3],
    [5, -2, 1],
    [4, -2, -1],
    [6, -8, -1],
  ]) {
    state.writeNativeField({
      offset: 0x0c29b130,
      width: 4,
      value: mode,
    });
    state.writeNativeField({
      offset: 0x0c29b134,
      width: 4,
      value: secondaryIndex >>> 0,
    });
    assert.deepEqual(await query(), { result });
  }
});
