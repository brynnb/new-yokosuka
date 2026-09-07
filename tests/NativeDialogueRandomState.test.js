import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueRandomState,
  NativeDialogueRandomState,
} from "../play/dialogue/NativeDialogueRandomState.js";

test("native E0 history avoids the matching prior construction slot", () => {
  const state = createNativeDialogueRandomState({
    history: [0, 2, 1],
  });
  state.beginMessageConstruction();
  assert.equal(state.choose(4, () => 0), 3);
  assert.equal(state.choose(4, () => 0.7), 1);
  assert.equal(state.choose(4, () => 0.3), 0);
  assert.deepEqual(state.history, [3, 1, 0]);
});

test("native E0 history only records the first three construction choices", () => {
  const state = createNativeDialogueRandomState();
  state.beginMessageConstruction();
  assert.equal(state.choose(5, () => 0.1), 0);
  assert.equal(state.choose(5, () => 0.3), 1);
  assert.equal(state.choose(5, () => 0.5), 2);
  assert.equal(state.choose(5, () => 0.9), 4);
  assert.deepEqual(state.history, [0, 1, 2]);
});

test("native E0 history persists without serializing its transient cursor", () => {
  const first = createNativeDialogueRandomState();
  first.beginMessageConstruction();
  first.choose(3, () => 0.5);
  const second = new NativeDialogueRandomState(first.toJSON());
  second.beginMessageConstruction();
  assert.equal(second.choose(3, () => 0.5), 0);
});
