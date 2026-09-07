import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeFixedFloatExchangeSemanticHandlers,
  createNativeFixedFloatExchangeState,
} from "../play/events/NativeFixedFloatExchangeRuntime.js";

const constant = value => ({ kind: "constant", value });

function invocation(values, context = {}) {
  const arguments_ = values.map(constant);
  return {
    action: { arguments: arguments_ },
    context,
    readArgument: index => arguments_[index]?.value,
  };
}

test("operation 0x006e exchanges all three fixed float channels", async () => {
  const state = createNativeFixedFloatExchangeState();
  const handler = createNativeFixedFloatExchangeSemanticHandlers({ state })[
    "native-fixed-float-exchange-control"
  ];

  const first = await handler(invocation([0, 0x40466666]));
  const second = await handler(invocation([0, 0x40000000]));

  assert.equal(first.result, 0);
  assert.equal(second.result, 0x40466666);
  assert.equal(state.channelWords[0], 0x40000000);
});

test("operation 0x006e negative float words query without mutation", async () => {
  const state = createNativeFixedFloatExchangeState();
  state.exchange(2, 0x3f800000);
  const handler = createNativeFixedFloatExchangeSemanticHandlers({ state })[
    "native-fixed-float-exchange-control"
  ];

  const result = await handler(invocation([2, 0xbf800000]));

  assert.equal(result.result, 0x3f800000);
  assert.equal(result.mutation.query, true);
  assert.equal(state.channelWords[2], 0x3f800000);
});

test("operation 0x006e mirrors exact channel-one writes", async () => {
  const state = createNativeFixedFloatExchangeState();
  const handler = createNativeFixedFloatExchangeSemanticHandlers({ state })[
    "native-fixed-float-exchange-control"
  ];

  await handler(invocation([1, 0x40000000]));
  assert.equal(state.channelWords[1], 0x40000000);
  assert.equal(state.channelOneMirrorWord, 0x40000000);

  await handler(invocation([1, 0xbf800000]));
  assert.equal(state.channelOneMirrorWord, 0x40000000);
});

test("operation 0x006e delegates exchange ownership through one adapter", async () => {
  const routes = [];
  const handler = createNativeFixedFloatExchangeSemanticHandlers({
    applyNativeFixedFloatExchange: route => {
      routes.push(route);
      return { previousWord: 0x3f800000, delegated: true };
    },
  })["native-fixed-float-exchange-control"];

  const result = await handler(invocation([1, 0x40000000]));

  assert.deepEqual(routes, [{ mode: 1, suppliedWord: 0x40000000 }]);
  assert.equal(result.result, 0x3f800000);
  assert.equal(result.mutation.delegated, true);
});

test("operation 0x006e preserves exact inert selector routes", async () => {
  const handler = createNativeFixedFloatExchangeSemanticHandlers()[
    "native-fixed-float-exchange-control"
  ];

  const five = await handler(invocation([5, 6, 1, 0]));
  const six = await handler(invocation([6, 7]));

  assert.deepEqual(five.mutation, {
    mode: 5,
    arguments: [6, 1, 0],
    applied: false,
    nativeReason: "unmatched-selector-default",
  });
  assert.deepEqual(six.mutation, {
    mode: 6,
    arguments: [7],
    applied: false,
    nativeReason: "exact-empty-helper",
  });
  assert.equal(five.result, 0);
  assert.equal(six.result, 0);
});

test("operation 0x006e rejects unauthored route cross-products", async () => {
  const handler = createNativeFixedFloatExchangeSemanticHandlers()[
    "native-fixed-float-exchange-control"
  ];

  assert.equal(
    (await handler(invocation([5, 4, 1, 0]))).reason,
    "native-fixed-float-mode-five-route-unproved",
  );
  assert.equal(
    (await handler(invocation([6, 6]))).reason,
    "native-fixed-float-exchange-route-unproved",
  );
  assert.equal(
    (await handler(invocation([3, 1]))).reason,
    "native-fixed-float-exchange-route-unproved",
  );
});
