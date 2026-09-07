import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeOperation014bSemanticHandlers,
  createNativeOperation014bState,
} from "../play/events/NativeOperation014bRuntime.js";

function invocation(value, context = {}) {
  return { context, readArgument: () => value };
}

test("operation 0x014b writes the exact low byte", async () => {
  const state = createNativeOperation014bState({ dependent: 9 });
  const handler = createNativeOperation014bSemanticHandlers({ state })[
    "native-operation-014b-mode-byte-control"
  ];

  const result = await handler(invocation(0x107));

  assert.deepEqual(result, {
    status: "continued",
    mutation: {
      requested: 7,
      mode: 7,
      dependent: 9,
      writeAccepted: true,
    },
  });
  assert.deepEqual(state.snapshot(), { mode: 7, dependent: 9 });
});

test("operation 0x014b preserves native mode-four ownership", async () => {
  const state = createNativeOperation014bState({ mode: 4, dependent: 9 });
  const handler = createNativeOperation014bSemanticHandlers({ state })[
    "native-operation-014b-mode-byte-control"
  ];

  const result = await handler(invocation(7));

  assert.deepEqual(result.mutation, {
    requested: 7,
    mode: 4,
    dependent: 0,
    writeAccepted: false,
  });
});

test("operation 0x014b mode five resets its dependent byte", async () => {
  const state = createNativeOperation014bState({ mode: 1, dependent: 6 });
  state.apply(5);
  assert.deepEqual(state.snapshot(), { mode: 5, dependent: 0 });
});

test("operation 0x014b delegates its generic state mutation", async () => {
  const calls = [];
  const handler = createNativeOperation014bSemanticHandlers({
    applyNativeOperation014b: value => {
      calls.push(value);
      return { delegated: true };
    },
  })["native-operation-014b-mode-byte-control"];

  assert.deepEqual(await handler(invocation(1)), {
    status: "continued",
    mutation: { delegated: true },
  });
  assert.deepEqual(calls, [1]);
});

test("operation 0x014b fails closed when its operand is unavailable", async () => {
  const handler = createNativeOperation014bSemanticHandlers()[
    "native-operation-014b-mode-byte-control"
  ];
  assert.equal(
    (await handler(invocation(undefined))).reason,
    "native-operation-014b-value-unavailable",
  );
});
