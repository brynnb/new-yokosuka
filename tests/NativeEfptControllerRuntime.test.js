import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEfptControllerSemanticHandlers,
  createNativeEfptControllerState,
} from "../play/events/NativeEfptControllerRuntime.js";

const constant = value => ({ kind: "constant", value });
const address = offset => ({ kind: "frame-address", offset });

function invocation(arguments_, frame = new Map(), context = {}) {
  return {
    action: { arguments: arguments_ },
    context: {
      readFrameField: offset => frame.get(offset),
      ...context,
    },
    readArgument: index => arguments_[index]?.value,
  };
}

test("operation 0x0047 creates exact EFPT records and returns eight-slot handles", async () => {
  const state = createNativeEfptControllerState();
  const handler = createNativeEfptControllerSemanticHandlers({ state })[
    "native-efpt-controller"
  ];
  const frame = new Map([
    [0, 1], [4, 2], [8, 3],
    [12, 4], [16, 5], [20, 6],
  ]);
  const args = [
    constant(0), address(0), address(12),
    constant(9000), constant(0x3b23d70a), constant(0),
  ];

  const result = await handler(invocation(args, frame));

  assert.equal(result.status, "continued");
  assert.equal(result.result, 0);
  assert.deepEqual(result.mutation.record, {
    handle: 0,
    firstVectorWords: [1, 2, 3],
    secondVectorWords: [4, 5, 6],
    countWord: 9000,
    scalarWord: 0x3b23d70a,
    controlWord: 0,
    commands: [],
  });
});

test("operation 0x0047 retains exact handle routes and releases on mode three", async () => {
  const state = createNativeEfptControllerState();
  state.create({
    firstVectorWords: [0, 0, 0],
    secondVectorWords: [0, 0, 0],
    countWord: 1,
    scalarWord: 0,
    controlWord: 0,
  });
  const handler = createNativeEfptControllerSemanticHandlers({ state })[
    "native-efpt-controller"
  ];

  const scalar = await handler(invocation([
    constant(7), constant(0), constant(0x3a30d197),
  ]));
  const release = await handler(invocation([constant(3), constant(0)]));

  assert.deepEqual(scalar.mutation, {
    mode: 7,
    handle: 0,
    arguments: [0x3a30d197],
    applied: true,
  });
  assert.equal(release.mutation.applied, true);
  assert.equal(state.slots[0], null);
});

test("operation 0x0047 preserves native absent-handle no-ops", async () => {
  const handler = createNativeEfptControllerSemanticHandlers()[
    "native-efpt-controller"
  ];

  const result = await handler(invocation([constant(2), constant(7)]));

  assert.deepEqual(result.mutation, {
    mode: 2,
    handle: 7,
    arguments: [],
    applied: false,
  });
});

test("operation 0x0047 keeps global mode fifteen separate from slot ownership", async () => {
  const state = createNativeEfptControllerState();
  const handler = createNativeEfptControllerSemanticHandlers({ state })[
    "native-efpt-controller"
  ];

  const result = await handler(invocation([constant(15)]));

  assert.deepEqual(result.mutation, { mode: 15, globalResetCount: 1 });
  assert.equal(state.slots.every(slot => slot === null), true);
});

test("operation 0x0047 delegates every proven route through one adapter", async () => {
  const routes = [];
  const handler = createNativeEfptControllerSemanticHandlers({
    applyNativeEfptController: route => {
      routes.push(route);
      return { delegated: true };
    },
  })["native-efpt-controller"];

  const result = await handler(invocation([
    constant(13), constant(4), constant(0x3cc0c0c1), constant(0x3cc0c0c1),
  ]));

  assert.deepEqual(routes, [{
    mode: 13,
    arguments: [4, 0x3cc0c0c1, 0x3cc0c0c1],
  }]);
  assert.deepEqual(result.mutation, { delegated: true });
});

test("operation 0x0047 rejects unknown modes and wrong authored shapes", async () => {
  const handler = createNativeEfptControllerSemanticHandlers()[
    "native-efpt-controller"
  ];

  assert.equal(
    (await handler(invocation([constant(14)]))).reason,
    "native-efpt-controller-mode-unproved",
  );
  assert.equal(
    (await handler(invocation([constant(7), constant(0)]))).reason,
    "native-efpt-controller-argument-shape-unproved",
  );
});
