import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueProgressState,
  NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT,
  NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START,
  NATIVE_DIALOGUE_PROGRESS_RECORD_COUNT,
  nativeDialogueProgressIndexForIdentity,
  NativeDialogueProgressState,
} from "../play/dialogue/NativeDialogueProgressState.js";

test("native progress state has the exact 325-record layout", () => {
  const state = createNativeDialogueProgressState();
  assert.equal(NATIVE_DIALOGUE_PROGRESS_RECORD_COUNT, 325);
  assert.deepEqual(state.record(0), {
    selectedEntryOffset: 0,
    continuationOffset: 0,
    authoredBoundaryOffset: 0,
    latestResumeOffset: 0,
    auxiliaryState: 0x41100000,
    metricThreshold: 9,
  });
  assert.throws(() => state.record(325), RangeError);
});

test("actor identities resolve to their exact native fixed progress index", () => {
  assert.equal(nativeDialogueProgressIndexForIdentity("AKIR"), 0);
  assert.equal(nativeDialogueProgressIndexForIdentity("HATO"), 30);
  assert.equal(nativeDialogueProgressIndexForIdentity("NOPE"), null);
  assert.equal(nativeDialogueProgressIndexForIdentity("Hato"), null);
  assert.equal(nativeDialogueProgressIndexForIdentity("AKIRA"), null);
  assert.equal(NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START, 301);
  assert.equal(NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT, 24);
});

test("a changed native selection clears all four progress halfwords", () => {
  const state = createNativeDialogueProgressState();
  state.writeOffset(4, "continuation", 80);
  state.writeOffset(4, "boundary", 70);
  state.writeOffset(4, "latest", 60);
  assert.equal(state.beginSelection(4, 50), true);
  assert.deepEqual(state.record(4), {
    selectedEntryOffset: 50,
    continuationOffset: 0,
    authoredBoundaryOffset: 0,
    latestResumeOffset: 0,
    auxiliaryState: 0x41100000,
    metricThreshold: 9,
  });
  assert.equal(state.beginSelection(4, 50), false);
});

test("class 0x10 redirect ordering matches the native handler", () => {
  const state = createNativeDialogueProgressState();
  state.writeOffset(7, "selected", 100);
  state.writeOffset(7, "continuation", 150);
  state.writeOffset(7, "boundary", 120);
  state.writeOffset(7, "latest", 110);
  assert.deepEqual(
    state.resolveProgressRedirect(7, 100, false),
    { offset: 150, yieldState5: true },
  );
  assert.equal(state.record(7).continuationOffset, 0);

  assert.deepEqual(
    state.resolveProgressRedirect(7, 200, false),
    { offset: 200, yieldState5: false },
  );
  assert.equal(state.record(7).latestResumeOffset, 200);
  assert.equal(state.record(7).authoredBoundaryOffset, 0);
});

test("native progress serialization round-trips exact record bytes", () => {
  const first = createNativeDialogueProgressState();
  first.writeOffset(324, "selected", 0xabcd);
  const second = new NativeDialogueProgressState(first.toJSON());
  assert.equal(second.record(324).selectedEntryOffset, 0xabcd);
});

test("ordinary state-5 completion performs the deferred three-byte advance", () => {
  const progress = createNativeDialogueProgressState();
  const result = progress.completeState5(
    0,
    Uint8Array.of(0, 0, 0),
    {
      currentOffset: 17,
      continuation5cOffset: 9,
      flags1e: 0,
    },
  );
  assert.deepEqual(result, {
    currentOffset: 20,
    continuation5cOffset: 9,
    flags1e: 0,
    usedProgressContinuation: false,
  });
});

test("state-5 completion recovers the exact signed deferred branch", () => {
  const progress = createNativeDialogueProgressState();
  progress.writeOffset(7, "continuation", 2);
  const positive = progress.completeState5(
    7,
    Uint8Array.of(0, 0, 0, 0, 4),
    { currentOffset: 20, flags1e: 0x01 },
  );
  assert.deepEqual(positive, {
    currentOffset: 9,
    continuation5cOffset: 5,
    flags1e: 0x80,
    usedProgressContinuation: true,
    displacement: 4,
  });

  progress.writeOffset(7, "continuation", 0);
  const negative = progress.completeState5(
    7,
    Uint8Array.of(0xff, 0xff, 0xfd),
    { currentOffset: 20, flags1e: 0x01 },
  );
  assert.deepEqual(negative, {
    currentOffset: 0,
    continuation5cOffset: 3,
    flags1e: 0x80,
    usedProgressContinuation: true,
    displacement: -3,
  });
});

test("zero deferred displacement clears continuation 5c", () => {
  const progress = createNativeDialogueProgressState();
  progress.writeOffset(2, "continuation", 1);
  const result = progress.completeState5(
    2,
    Uint8Array.of(0xaa, 0, 0, 0),
    {
      currentOffset: 99,
      continuation5cOffset: 88,
      flags1e: 0x81,
    },
  );
  assert.deepEqual(result, {
    currentOffset: 4,
    continuation5cOffset: null,
    flags1e: 0x80,
    usedProgressContinuation: true,
    displacement: 0,
  });
});
