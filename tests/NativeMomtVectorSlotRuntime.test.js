import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeMomtVectorSlotSemanticHandlers,
  createNativeMomtVectorSlotState,
} from "../play/events/NativeMomtVectorSlotRuntime.js";

const words = [0x3f800000, 0x40000000, 0x40400000];

function action(selector, flags, operand = { kind: "frame-address", offset: 20 }) {
  return {
    semanticId: "resolved-object-momt-vector-slot-write",
    callFileOffset: "0x9d28",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: selector },
      operand,
      { kind: "constant", value: flags },
    ],
  };
}

async function execute({
  selector = 17,
  flags = 0x78000000,
  state,
  context = {},
  options = {},
  operand,
} = {}) {
  const handler = createNativeMomtVectorSlotSemanticHandlers(options)[
    "resolved-object-momt-vector-slot-write"
  ];
  return handler({
    action: action(selector, flags, operand),
    context: {
      nativeMomtVectorSlotState: state,
      location: { functionId: "0x9930" },
      readFrameField: offset => words[(offset - 20) / 4],
      ...context,
    },
    readArgument: index => [0x52494b41, selector, 0x1234, flags][index],
  });
}

function configured(objectTransformPresent = false) {
  const state = createNativeMomtVectorSlotState();
  state.configureObject({
    objectTag: "AKIR",
    objectAvailable: true,
    momtAvailable: true,
    objectTransformPresent,
  });
  return state;
}

test("operation 0x0070 maps selectors and honors flag precedence", async () => {
  const state = configured();
  let result = await execute({ selector: 17, flags: 0x78000000, state });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readSlot("AKIR", 4), {
    selector: 17,
    slot: 4,
    flags: 0x78000000,
    route: "secondary-direct",
    pointerTableOffset: 0x44,
    otherPointerTableCleared: 0x1c,
    objectTransformed: false,
    sourceWords: words,
    words,
  });

  result = await execute({ selector: 11, flags: 0x39000000, state });
  assert.equal(result.mutation.route, "primary-direct");
  assert.equal(result.mutation.pointerTableOffset, 0x1c);

  result = await execute({ selector: 6, flags: 0x41000000, state });
  assert.equal(
    result.mutation.route,
    "secondary-direct",
    "0x40000000 must take precedence over 0x01000000",
  );
});

test("default route applies the exact object point-transform boundary", async () => {
  const state = configured(true);
  const calls = [];
  const transformed = [0x40800000, 0x40a00000, 0x40c00000];
  const result = await execute({
    selector: 17,
    flags: 0x38000000,
    state,
    options: {
      transformNativeObjectPointWords(detail) {
        calls.push(detail);
        return transformed;
      },
    },
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(calls, [{
    objectTag: "AKIR",
    words,
    source: { functionFileOffset: "0x9930", callFileOffset: "0x9d28" },
  }]);
  assert.deepEqual(state.readSlot("AKIR", 4).words, transformed);
  assert.equal(state.readSlot("AKIR", 4).objectTransformed, true);
});

test("default route leaves the point unchanged without an object transform", async () => {
  const state = configured(false);
  const result = await execute({ selector: 33, flags: 0x38000000, state });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readSlot("AKIR", 7).words, words);
  assert.equal(state.readSlot("AKIR", 7).objectTransformed, false);
});

test("invalid selector exits before reading its vector source", async () => {
  const state = configured();
  const result = await execute({
    selector: 7,
    flags: 0x78000000,
    state,
    operand: { kind: "static-pointer", value: 0x1234 },
    options: {
      readNativeVector() {
        throw new Error("must not read invalid-selector vector");
      },
    },
  });
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.nativeNoOp, true);
});

test("operation 0x0070 fails closed on unproven native prerequisites", async () => {
  assert.equal((await execute()).reason, "momt-vector-slot-state-unavailable");

  const absent = createNativeMomtVectorSlotState();
  absent.configureObject({
    objectTag: "AKIR",
    objectAvailable: false,
    momtAvailable: false,
  });
  assert.equal(
    (await execute({ state: absent })).reason,
    "momt-vector-slot-object-unavailable",
  );

  const noTransform = configured(true);
  assert.equal(
    (await execute({ flags: 0x38000000, state: noTransform })).reason,
    "native-object-point-transform-missing",
  );
});

test("operation 0x0070 reads exact static vectors and rejects stale plans", async () => {
  const state = configured();
  const result = await execute({
    selector: 26,
    flags: 0x78000000,
    state,
    operand: { kind: "static-pointer", value: 0x1234 },
    options: { readNativeVector: pointer => pointer === 0x1234 ? words : null },
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readSlot("AKIR", 6).words, words);

  const plan = state.planWrite({ objectTag: "AKIR", selector: 11, flags: 0x39000000 });
  state.configureObject({
    objectTag: "SYZU",
    objectAvailable: true,
    momtAvailable: true,
  });
  assert.throws(() => state.commit(plan, words), /changed before commit/);
});
