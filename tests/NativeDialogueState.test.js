import assert from "node:assert/strict";
import test from "node:test";
import {
  NativeDialogueState,
  createNativeDialogueState,
} from "../play/dialogue/NativeDialogueState.js";
import {
  evaluateNativeDialoguePredicate,
} from "../play/dialogue/NativeDialoguePredicate.js";

test("native dialogue state starts at the executable's all-zero reset", () => {
  const state = createNativeDialogueState();
  assert.equal(state.read(2, 0), 0);
  assert.equal(state.read(2, 1023), 0);
  assert.equal(state.read(3, 63), 0);
  assert.equal(state.read(4, 31), 0);
});

test("native dialogue state preserves exact bit and byte bank behavior", () => {
  const state = createNativeDialogueState();
  assert.equal(state.write(2, 100, 1), true);
  assert.equal(state.write(3, 63, 1), true);
  assert.equal(state.write(4, 31, 0x1ff), true);
  assert.equal(state.read(2, 100), 1);
  assert.equal(state.read(3, 63), 1);
  assert.equal(state.read(4, 31), 0xff);
  assert.equal(state.write(2, 100, 0), true);
  assert.equal(state.read(2, 100), 0);
  assert.equal(state.write(2, 1024, 1), false);
  assert.equal(state.read(2, 1024), 0);
});

test("predicate evaluation reads the native state object without defaults", () => {
  const state = createNativeDialogueState();
  state.write(2, 100, 1);
  assert.deepEqual(
    evaluateNativeDialoguePredicate({
      kind: "nativeValueType2",
      nativeValueType: 2,
      value: 100,
    }, state.predicateContext()),
    { resolved: true, value: 1, reasons: [] },
  );
});

test("native save import and export use the recovered exact offsets", () => {
  const save = new Uint8Array(0x300);
  save[0x130 + 12] = 0x10;
  save[0x128 + 7] = 0x80;
  save[0x230 + 31] = 77;
  const state = NativeDialogueState.fromNativeSave(save);
  assert.equal(state.read(2, 100), 1);
  assert.equal(state.read(3, 63), 1);
  assert.equal(state.read(4, 31), 77);

  state.write(4, 31, 99);
  const exported = state.writeNativeSave(save);
  assert.equal(exported[0x230 + 31], 99);
  assert.equal(save[0x230 + 31], 77);
});

test("serialized dialogue state round-trips all three native banks", () => {
  const first = createNativeDialogueState();
  first.write(2, 999, 1);
  first.write(3, 12, 1);
  first.write(4, 7, 42);
  const second = createNativeDialogueState(first.toJSON());
  assert.equal(second.read(2, 999), 1);
  assert.equal(second.read(3, 12), 1);
  assert.equal(second.read(4, 7), 42);
});
