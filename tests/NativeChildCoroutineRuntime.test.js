import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeChildCoroutineRuntime,
} from "../play/events/NativeChildCoroutineRuntime.js";
import {
  createNativeEventInterpreter,
} from "../play/events/NativeEventInterpreter.js";

function program() {
  return {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      frameArgumentBase: 20,
      blocks: [{
        id: "0x100",
        actions: [],
        successors: [],
      }],
    }],
  };
}

test("launches an exact child frame and completes it on a scheduler update", async () => {
  const definition = program();
  let observedState;
  const interpreter = createNativeEventInterpreter({
    program: definition,
    executeOperation() {
      throw new Error("child has no operations");
    },
  });
  const originalRun = interpreter.run.bind(interpreter);
  interpreter.run = (state, context) => {
    observedState = structuredClone(state);
    assert.equal(context.coroutineHandle, 1);
    return originalRun(state, context);
  };
  const runtime = createNativeChildCoroutineRuntime({
    program: definition,
    interpreter,
  });
  assert.deepEqual(runtime.launch({
    targetFileOffset: "0x100",
    callFileOffset: "0x80",
    arguments: [{ kind: "constant", value: 7 }],
  }, {
    readArgument: () => 7,
  }), {
    status: "launched",
    handle: 1,
  });

  assert.deepEqual(await runtime.update(), {
    status: "continued",
    activeCount: 0,
  });
  assert.equal(observedState.frames[0].fields[4], 1);
  assert.equal(observedState.frames[0].fields[20], 7);
});

test("retains exact child continuation ticks and supports handle deactivation", async () => {
  const definition = program();
  const states = [];
  const interpreter = {
    initialState(_target, fields) {
      return { fields };
    },
    async run(state) {
      states.push(state);
      return {
        status: "yielded",
        state,
        request: {
          kind: "native-coroutine-continuation",
          scheduler: {
            kind: "native-scheduler-countdown",
            ticks: 2,
          },
        },
      };
    },
  };
  const runtime = createNativeChildCoroutineRuntime({
    program: definition,
    interpreter,
  });
  runtime.launch({
    targetFileOffset: "0x100",
    callFileOffset: "0x80",
    arguments: [],
  }, {
    readArgument() {
      throw new Error("no arguments expected");
    },
  });
  assert.equal((await runtime.update()).activeCount, 1);
  assert.equal((await runtime.update()).activeCount, 1);
  assert.equal(states.length, 1);
  assert.equal(runtime.deactivate({
    handle: 1,
    current: false,
    currentHandle: null,
  }), true);
  assert.equal((await runtime.update()).activeCount, 0);
});
