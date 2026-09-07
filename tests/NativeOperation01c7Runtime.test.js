import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation01c7SemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeOperation01c7State,
} from "../play/events/NativeOperation01c7Runtime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(...values) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-operation-01c7-control",
    arguments: values.map(value => ({ kind: "constant", value })),
  };
}

function runtime(state, handlers = {}) {
  return {
    context: createNativeSceneFieldRuntimeContext(
      createNativeSceneGameplayState(),
      { operation01c7State: state },
    ),
    execute: createNativeEventOperationExecutor({
      handlers: createNativeOperation01c7SemanticHandlers(handlers),
    }),
  };
}

test("operation 0x01c7 preserves its status and Boolean routes", async () => {
  const state = createNativeOperation01c7State();
  state.configureStatusByte(0);
  const { context, execute } = runtime(state);
  assert.equal((await execute(action(0), context)).result, 0);
  state.configureStatusByte(1);
  assert.equal((await execute(action(0), context)).result, -1);

  await execute(action(2, 0), context);
  assert.equal(state.readBooleanDword(), 0);
  await execute(action(2, 27), context);
  assert.equal(state.readBooleanDword(), 1);
});

test("operation 0x01c7 byte update returns the preceding byte", async () => {
  const state = createNativeOperation01c7State();
  const bytes = Array(32).fill(0);
  bytes[7] = 0xfe;
  state.configureParameterBytes(bytes);
  const { context, execute } = runtime(state);
  assert.equal((await execute(action(3, 0, 7), context)).result, 0xfe);
  assert.equal((await execute(action(3, 1, 7, 0x123), context)).result, 0xfe);
  assert.equal(state.readParameterByte(7), 0x23);
});

test("operation 0x01c7 float update uses exact little-endian float32", async () => {
  const state = createNativeOperation01c7State();
  state.configureParameterBytes(Array(32).fill(0));
  state.writeParameterFloat(4, 1.25);
  const { context, execute } = runtime(state);
  assert.equal((await execute(action(3, 2, 4), context)).result, 1.25);
  assert.equal((await execute(action(3, 3, 4, -2.5), context)).result, 1.25);
  assert.equal(state.readParameterFloat(4), -2.5);
});

test("operation 0x01c7 external apply and unavailable state fail closed", async () => {
  const state = createNativeOperation01c7State();
  const missing = runtime(state);
  assert.deepEqual(
    await missing.execute(action(1), missing.context),
    {
      status: "stopped",
      reason: "native-operation-01c7-record-apply-adapter-missing",
    },
  );
  assert.deepEqual(
    await missing.execute(action(3, 0, 0), missing.context),
    {
      status: "stopped",
      reason: "native-operation-01c7-parameter-state-unavailable",
    },
  );

  const applied = [];
  const configured = runtime(state, {
    applyNativeRecord01c7: detail => applied.push(detail),
  });
  assert.deepEqual(
    await configured.execute(action(1), configured.context),
    { status: "continued" },
  );
  assert.deepEqual(applied, [{
    recordAddress: 0x0c220370,
    parameterBufferAddress: 0x0c2203a3,
  }]);
});
