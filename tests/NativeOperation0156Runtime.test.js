import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeOperation0156SemanticHandlers,
  createNativeOperation0156State,
} from "../play/events/NativeOperation0156Runtime.js";

function invocation(values, context = {}) {
  return {
    context,
    readArgument: index => values[index],
  };
}

test("operation 0x0156 begins the exact rising FENS envelope", async () => {
  const state = createNativeOperation0156State();
  const handler = createNativeOperation0156SemanticHandlers({ state })[
    "native-operation-0156-fens-envelope-control"
  ];

  const result = await handler(invocation([0, 5, 60]));

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    mode: 0,
    selector: 5,
    durationFrames: 60,
    step: 4,
    direction: "rising",
    initialLevel: 0,
    created: true,
  });
  assert.deepEqual(state.envelope, {
    mode: 0,
    selector: 5,
    durationFrames: 60,
    step: 4,
    direction: "rising",
    initialLevel: 0,
  });
});

test("operation 0x0156 mode zero preserves native singleton ownership", async () => {
  const state = createNativeOperation0156State();
  const handler = createNativeOperation0156SemanticHandlers({ state })[
    "native-operation-0156-fens-envelope-control"
  ];
  await handler(invocation([0, 5, 60]));

  const result = await handler(invocation([0, 9, 1]));

  assert.equal(result.mutation.created, false);
  assert.equal(result.mutation.selector, 5);
  assert.equal(result.mutation.durationFrames, 60);
});

test("operation 0x0156 reverses from the native full-scale level", async () => {
  const state = createNativeOperation0156State();
  const handler = createNativeOperation0156SemanticHandlers({ state })[
    "native-operation-0156-fens-envelope-control"
  ];
  await handler(invocation([0, 5, 80]));

  const result = await handler(invocation([1, 0, 50]));

  assert.deepEqual(result.mutation, {
    mode: 1,
    selector: 5,
    durationFrames: 50,
    step: 5,
    direction: "falling",
    initialLevel: 255,
    created: false,
  });
});

test("operation 0x0156 delegates the generic native envelope contract", async () => {
  const calls = [];
  const handler = createNativeOperation0156SemanticHandlers({
    applyNativeFensEnvelope: async (...args) => {
      calls.push(args);
      return { delegated: true };
    },
  })["native-operation-0156-fens-envelope-control"];

  const result = await handler(invocation([0, 9, 1]));

  assert.deepEqual(calls, [[0, 9, 1]]);
  assert.deepEqual(result, {
    status: "continued",
    mutation: { delegated: true },
  });
});

test("operation 0x0156 rejects unproved routes and durations", async () => {
  const handler = createNativeOperation0156SemanticHandlers()[
    "native-operation-0156-fens-envelope-control"
  ];

  assert.equal(
    (await handler(invocation([2, 0, 60]))).reason,
    "native-operation-0156-mode-unproved",
  );
  assert.equal(
    (await handler(invocation([0, 5, 0]))).reason,
    "native-operation-0156-duration-unproved",
  );
});
