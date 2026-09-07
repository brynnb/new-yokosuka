import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeOperation01a1SemanticHandlers,
  createNativeOperation01a1State,
} from "../play/events/NativeOperation01a1Runtime.js";

function invocation(values, context = {}) {
  return { context, readArgument: index => values[index] };
}

test("operation 0x01a1 configures the exact SAKR four-channel envelope", async () => {
  const state = createNativeOperation01a1State();
  const handler = createNativeOperation01a1SemanticHandlers({ state })[
    "native-four-channel-byte-envelope-control"
  ];
  const result = await handler(invocation([50, 1, 150, 68, 50, 0, 255, 255, 255, 255]));

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.currentFixed, [150 << 16, 68 << 16, 50 << 16, 0]);
  assert.deepEqual(result.mutation.targetFixed, Array(4).fill(255 << 16));
  assert.deepEqual(result.mutation.stepFixed, [137625, 245104, 268697, 334233]);
  assert.equal(result.mutation.remainingFrames, 50);
  assert.equal(result.mutation.cacheActive, true);
  assert.deepEqual(result.mutation.cachedTarget, [255, 255, 255, 255]);
});

test("operation 0x01a1 preserves the exact mode-two cached-channel route", async () => {
  const state = createNativeOperation01a1State();
  state.configure({
    durationFrames: 30,
    mode: 1,
    initialBytes: [0, 255, 255, 255],
    targetBytes: [10, 20, 30, 40],
  });
  const mutation = state.configure({
    durationFrames: 30,
    mode: 2,
    initialBytes: [255, 0, 0, 0],
    targetBytes: [0, 0, 0, 0],
  });
  assert.deepEqual(mutation.currentFixed, [10 << 16, 20 << 16, 30 << 16, 20 << 16]);
  assert.equal(mutation.cacheActive, false);
});

test("operation 0x01a1 active query follows the native duration field", async () => {
  const state = createNativeOperation01a1State();
  const handlers = createNativeOperation01a1SemanticHandlers({ state });
  await handlers["native-four-channel-byte-envelope-control"](
    invocation([30, 1, 0, 255, 255, 255, 255, 255, 255, 255]),
  );
  assert.deepEqual(
    await handlers["native-four-channel-byte-envelope-active-query"](
      invocation([0xffff_ffff]),
    ),
    { result: 1 },
  );
  state.advance(30);
  assert.deepEqual(
    await handlers["native-four-channel-byte-envelope-active-query"](
      invocation([0xffff_ffff]),
    ),
    { result: 0 },
  );
});

test("operation 0x01a1 rejects routes absent from the authored corpus", async () => {
  const handlers = createNativeOperation01a1SemanticHandlers();
  assert.equal(
    (await handlers["native-four-channel-byte-envelope-control"](
      invocation([30, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    )).reason,
    "native-operation-01a1-configuration-unproved",
  );
  assert.equal(
    (await handlers["native-four-channel-byte-envelope-active-query"](
      invocation([0]),
    )).reason,
    "native-operation-01a1-query-unproved",
  );
});
