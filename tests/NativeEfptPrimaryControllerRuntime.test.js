import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEfptPrimaryControllerSemanticHandlers,
  createNativeEfptPrimaryControllerState,
} from "../play/events/NativeEfptPrimaryControllerRuntime.js";

const constant = value => ({ kind: "constant", value });
const field = (offset, value) => ({ kind: "frame-field", offset, value });
const staticPointer = (value, staticWords) => ({
  kind: "static-pointer",
  value,
  staticWords,
});

function invocation(arguments_, context = {}) {
  return {
    action: { arguments: arguments_ },
    context,
    readArgument: index => arguments_[index]?.value,
  };
}

test("operation 0x0100 creates exact selector-zero EFPT records", async () => {
  const state = createNativeEfptPrimaryControllerState();
  const handler = createNativeEfptPrimaryControllerSemanticHandlers({ state })[
    "native-efpt-primary-controller"
  ];
  const result = await handler(invocation([
    constant(0),
    staticPointer(0x2de0, [1, 2, 3]),
    staticPointer(0x2dec, [4, 5, 6]),
    constant(60),
    constant(0x3ccccccd),
    constant(0),
    constant(0),
  ]));

  assert.equal(result.status, "continued");
  assert.equal(result.result, 0);
  assert.deepEqual(result.mutation.record, {
    handle: 0,
    controllerSelector: 0,
    firstVectorWords: [1, 2, 3],
    secondVectorWords: [4, 5, 6],
    countWord: 60,
    scalarWord: 0x3ccccccd,
    controlWord: 0,
    variantWord: 0,
    active: false,
    commands: [],
  });
});

test("operation 0x0100 preserves its exact sixteen-slot capacity", () => {
  const state = createNativeEfptPrimaryControllerState();
  const configuration = {
    firstVectorWords: [0, 0, 0],
    secondVectorWords: [0, 0, 0],
    countWord: 0,
    scalarWord: 0,
    controlWord: 0,
    variantWord: 0,
  };
  assert.deepEqual(
    Array.from({ length: 16 }, () => state.create(configuration).handle),
    Array.from({ length: 16 }, (_, index) => index),
  );
  assert.equal(state.create(configuration).handle, -1);
});

test("operation 0x0100 retains exact YD01 controller mutations", async () => {
  const state = createNativeEfptPrimaryControllerState();
  state.create({
    firstVectorWords: [0, 0, 0],
    secondVectorWords: [0, 0, 0],
    countWord: 60,
    scalarWord: 0,
    controlWord: 0,
    variantWord: 0,
  });
  const handler = createNativeEfptPrimaryControllerSemanticHandlers({ state })[
    "native-efpt-primary-controller"
  ];
  const handle = field(0, 0);

  await handler(invocation([constant(9), handle, constant(91), constant(72), constant(25)]));
  await handler(invocation([constant(8), handle, constant(0x3f800000), constant(0x3f800000)]));
  await handler(invocation([constant(11), handle, constant(114)]));
  await handler(invocation([constant(12), handle, constant(17)]));
  await handler(invocation([constant(1), handle]));
  await handler(invocation([constant(7), handle, constant(0)]));

  assert.equal(state.slots[0].active, true);
  assert.deepEqual(state.slots[0].packedFieldWords, [91, 72, 25]);
  assert.equal(state.slots[0].field64Word, 0x3f800000);
  assert.equal(state.slots[0].field68Word, 0x3f800000);
  assert.equal(state.slots[0].field72Word, 0);
  assert.equal(state.slots[0].mode11Word, 114);
  assert.equal(state.slots[0].mode12Word, 17);

  await handler(invocation([constant(2), handle]));
  assert.equal(state.slots[0].active, false);
  const released = await handler(invocation([constant(3), handle]));
  assert.equal(released.mutation.applied, true);
  assert.equal(state.slots[0], null);
});

test("operation 0x0100 delegates through the generic EFPT adapter", async () => {
  const routes = [];
  const handler = createNativeEfptPrimaryControllerSemanticHandlers({
    applyNativeEfptController: route => {
      routes.push(route);
      return { delegated: true };
    },
  })["native-efpt-primary-controller"];

  const result = await handler(invocation([
    constant(11), field(0, 3), constant(114),
  ]));

  assert.deepEqual(routes, [{
    mode: 11,
    controllerSelector: 0,
    handle: 3,
    arguments: [114],
  }]);
  assert.deepEqual(result.mutation, { delegated: true });
});

test("operation 0x0100 rejects unproved selectors and argument shapes", async () => {
  const handler = createNativeEfptPrimaryControllerSemanticHandlers()[
    "native-efpt-primary-controller"
  ];

  assert.equal(
    (await handler(invocation([constant(10), constant(0), constant(0)]))).reason,
    "native-efpt-primary-controller-mode-unproved",
  );
  assert.equal(
    (await handler(invocation([constant(8), constant(0), constant(0)]))).reason,
    "native-efpt-primary-controller-argument-shape-unproved",
  );
});
