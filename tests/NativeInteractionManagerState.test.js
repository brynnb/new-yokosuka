import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeInteractionManagerState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

const configuration = {
  id: "1:D000:test",
  descriptorSequences: [[98, 99], [40, 41], []],
  indirectRecords: [
    { index: 40, key: 2, vectorWords: [0x3f800000, 0, 0] },
    { index: 41, key: 1, vectorWords: [0, 0, 0] },
    { index: 98, key: 1, vectorWords: [0, 0, 0] },
    { index: 99, key: 2, vectorWords: [0x41200000, 0, 0] },
  ],
};

test("native interaction manager preserves ordered first-match lookup", () => {
  const state = createNativeInteractionManagerState();
  assert.equal(state.queryIndirectIndex(0, 1), undefined);
  state.configure(configuration);
  assert.equal(state.queryIndirectIndex(0, 1), 98);
  assert.equal(state.queryIndirectIndex(0, 2), 99);
  assert.equal(state.queryIndirectIndex(1, 2), 40);
  assert.equal(state.queryIndirectIndex(1, 7), -1);
  assert.equal(state.queryIndirectIndex(2, 2), -1);
  assert.equal(state.queryIndirectIndex(300, 2), -1);
});

test("native interaction manager rejects incomplete or duplicate tables", () => {
  const state = createNativeInteractionManagerState();
  assert.throws(() => state.configure({
    descriptorSequences: [[4]],
    indirectRecords: [],
  }), /missing record 4/);
  assert.throws(() => state.configure({
    descriptorSequences: [[]],
    indirectRecords: [
      { index: 1, key: 2, vectorWords: [0, 0, 0] },
      { index: 1, key: 2, vectorWords: [0, 0, 0] },
    ],
  }), /duplicate/);
});

test("native interaction manager selects the nearest keyed descriptor", () => {
  const state = createNativeInteractionManagerState();
  state.configure(configuration);
  assert.equal(state.queryNearestDescriptorIndex([0, 0, 0]), 1);
  assert.equal(state.queryNearestDescriptorIndex([0x41400000, 0, 0]), 0);
});

test("native interaction manager allocates and consumes exact runtime slots", () => {
  const state = createNativeInteractionManagerState();
  assert.equal(state.allocateRuntimeSlot(7, 9), undefined);
  state.configure(configuration);
  assert.equal(state.allocateRuntimeSlot(7, 9), 0);
  assert.deepEqual(state.readRuntimeSlots()[0].words, [9, 7, 0, 2, 0, 5]);
  assert.equal(state.consumeRuntimeSlotStatus(0), 2);
  assert.deepEqual(state.readRuntimeSlots()[0].words, [9, 7, 0, 2, 0, 0]);
  for (let index = 1; index < 16; index += 1) {
    assert.equal(state.allocateRuntimeSlot(index, index + 1), index);
  }
  assert.equal(state.allocateRuntimeSlot(20, 21), -1);
});

test("scene snapshots own interaction-manager configuration transactionally", () => {
  const scene = createNativeSceneGameplayState();
  scene.configureInteractionManager(configuration);
  assert.equal(scene.allocateInteractionManagerRuntimeSlot(3, 5), 0);
  const snapshot = scene.snapshot();
  assert.equal(scene.consumeInteractionManagerRuntimeSlotStatus(0), 2);
  scene.configureInteractionManager({
    id: "replacement",
    descriptorSequences: [[7]],
    indirectRecords: [{ index: 7, key: 2, vectorWords: [0, 0, 0] }],
  });
  assert.equal(scene.queryInteractionManagerIndirectIndex(0, 2), 7);
  scene.restore(snapshot);
  assert.equal(scene.queryInteractionManagerIndirectIndex(0, 2), 99);
  assert.equal(scene.consumeInteractionManagerRuntimeSlotStatus(0), 2);
  assert.equal(scene.interactionManager.readConfiguration().id, "1:D000:test");
});
