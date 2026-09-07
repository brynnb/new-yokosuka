import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNativeDialoguePredicate,
  nativeDialoguePredicateMatches,
} from "../play/dialogue/NativeDialoguePredicate.js";

function runtime(value) {
  return { kind: "runtimeSelector", mode: value, nativeValueType: 1 };
}

function literal(value) {
  return { kind: "literal", value, nativeValueType: 1 };
}

function operator(operation, left, right = undefined) {
  return { kind: "operator", operation, left, right };
}

test("native calendar predicates use the exact UTC calendar layout", () => {
  const gameDate = new Date("1986-11-29T16:20:00Z");
  const expected = [86, 11, 29, 6, 16, 20];
  expected.forEach((value, mode) => {
    assert.deepEqual(
      evaluateNativeDialoguePredicate(runtime(mode), { gameDate }),
      { resolved: true, value, reasons: [] },
    );
  });
});

test("native runtime mode 6 reads the persistent yen balance", () => {
  assert.deepEqual(
    evaluateNativeDialoguePredicate(runtime(6), { yen: 42069 }),
    { resolved: true, value: 42069, reasons: [] },
  );
  assert.deepEqual(evaluateNativeDialoguePredicate(runtime(6)), {
    resolved: false,
    value: null,
    reasons: ["runtimeComponent:6:yen"],
  });
});

test("native spatial predicates use map identity and strict X/Z circles", () => {
  const predicate = {
    kind: "nativeSpatialResult",
    value: 1,
    nativeValueType: 6,
  };
  assert.equal(nativeDialoguePredicateMatches(predicate, {
    currentMapIdentity: "D000",
    playerPosition: [-6, 999, 84],
  }), true);
  assert.equal(nativeDialoguePredicateMatches(predicate, {
    currentMapIdentity: "D000",
    playerPosition: [9, 0, 84],
  }), false);
  assert.equal(nativeDialoguePredicateMatches(predicate, {
    currentMapIdentity: "MFSY",
    playerPosition: [-6, 0, 84],
  }), false);
});

test("unavailable state is explicit and false short-circuits AND", () => {
  const bank = {
    kind: "nativeValueType2",
    value: 100,
    nativeValueType: 2,
  };
  assert.deepEqual(evaluateNativeDialoguePredicate(bank), {
    resolved: false,
    value: null,
    reasons: ["stateBank:2:100"],
  });
  assert.deepEqual(
    evaluateNativeDialoguePredicate(
      operator("booleanAnd", bank, literal(0)),
    ),
    { resolved: true, value: 0, reasons: [] },
  );
});

test("ordered comparisons retain the native lower-stack-left direction", () => {
  assert.equal(
    nativeDialoguePredicateMatches(
      operator("greaterThan", literal(9), literal(4)),
    ),
    true,
  );
  assert.equal(
    nativeDialoguePredicateMatches(
      operator("lessThanOrEqual", literal(9), literal(4)),
    ),
    false,
  );
});

test("native unary is-zero uses its authored operand field", () => {
  assert.deepEqual(
    evaluateNativeDialoguePredicate({
      kind: "operator",
      opcode: 4,
      operation: "isZero",
      operand: literal(0),
    }),
    { resolved: true, value: 1, reasons: [] },
  );
});
