import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeDialogueProgressIndexAllocator,
  NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT,
  NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START,
  nativeDialogueFixedProgressIndex,
  NativeDialogueProgressIndexAllocator,
} from "../play/dialogue/NativeDialogueProgressIndex.js";

test("fixed actor identities retain their exact native progress indices", () => {
  assert.equal(nativeDialogueFixedProgressIndex("HATO"), 30);
  assert.equal(nativeDialogueFixedProgressIndex("AKIR"), 0);
  assert.equal(nativeDialogueFixedProgressIndex("NOPE"), null);
  assert.equal(NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_START, 301);
  assert.equal(NATIVE_DIALOGUE_DYNAMIC_PROGRESS_INDEX_COUNT, 24);
});

test("dynamic actor identities use the native round-robin pool", () => {
  const allocator = createNativeDialogueProgressIndexAllocator();
  assert.equal(allocator.resolve("ZZZ0"), 301);
  assert.equal(allocator.resolve("ZZZ0"), 301);
  assert.equal(allocator.resolve("ZZZ1"), 302);

  for (let index = 2; index < 24; index += 1) {
    assert.equal(
      allocator.resolve(`ZZ${index.toString(16).padStart(2, "0")}`),
      301 + index,
    );
  }
  assert.equal(allocator.resolve("WRAP"), 301);
  assert.equal(allocator.resolve("ZZZ0"), 302);
});

test("native allocator sends fixed slot zero through the dynamic pool", () => {
  const allocator = createNativeDialogueProgressIndexAllocator();
  assert.equal(allocator.resolve("AKIR"), 301);
  assert.equal(allocator.resolve("HATO"), 30);
});

test("dynamic progress identity state round-trips exactly", () => {
  const first = createNativeDialogueProgressIndexAllocator();
  first.resolve("TEMP");
  const second = new NativeDialogueProgressIndexAllocator(first.toJSON());
  assert.equal(second.resolve("TEMP"), 301);
  assert.equal(second.resolve("NEXT"), 302);
});
