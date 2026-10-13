import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import managerPack from "../play/data/events/nativeInteractionManagers.generated.json" with { type: "json" };

import {
  createNativeInteractionManagerState,
  createNativeEventOperationExecutor,
  createNativeInteractionRecordSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import { createNativeRoomScriptRuntime } from "../play/events/NativeRoomScriptRuntime.js";
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

test("manager runtime slots match original initialization and allocation preserves word two", () => {
  const evidence = JSON.parse(fs.readFileSync(new URL(
    "../tools/evidence/dialogue-native-interaction-manager.json", import.meta.url,
  ), "utf8"));
  const state = createNativeInteractionManagerState();
  state.configure(configuration);
  const original = evidence.managerLayout.runtimeSlots;
  assert.equal(state.readRuntimeSlots().length, original.recordCount);
  for (const slot of state.readRuntimeSlots()) {
    assert.deepEqual(slot.words.map(word => word >>> 0), original.initialWords);
  }
  state.allocateRuntimeSlot(7, 9);
  assert.equal(state.readRuntimeSlots()[0].words[2] >>> 0, 0xffffffff,
    "native allocator writes offsets 0, 4, 12, 16, 20, but not offset 8");
  state.runtimeSlots[0].words[2] = 1234;
  state.runtimeSlots[0].words[3] = -3;
  assert.equal(state.allocateRuntimeSlot(11, 13), 0);
  assert.equal(state.readRuntimeSlots()[0].words[2], 1234,
    "a reused slot retains its existing word rather than restoring a default");
});

test("same-source room events retain committed manager slots and roll back only the current attempt", () => {
  const program = managerPack.managers.find(manager => manager.disc === 1 && manager.area === "JOMO");
  assert.ok(program);
  const room = createNativeRoomScriptRuntime();
  room.activateArea("JOMO");
  const first = room.beginTransaction({ area: "JOMO", program });
  assert.equal(room.sceneState.allocateInteractionManagerRuntimeSlot(3, 5), 0);
  first.commit();
  const saved = room.sceneState.interactionManager.readRuntimeSlots();
  const second = room.beginTransaction({ area: "JOMO", program });
  assert.deepEqual(room.sceneState.interactionManager.readRuntimeSlots(), saved);
  assert.equal(room.sceneState.allocateInteractionManagerRuntimeSlot(7, 9), 1);
  room.sceneState.consumeInteractionManagerRuntimeSlotStatus(0);
  second.rollback({ reason: "cancelled" });
  assert.deepEqual(room.sceneState.interactionManager.readRuntimeSlots(), saved);
  const third = room.beginTransaction({ area: "JOMO", program });
  assert.equal(room.sceneState.allocateInteractionManagerRuntimeSlot(11, 13), 1);
  third.commit();
  assert.equal(room.sceneState.interactionManager.readRuntimeSlots()[1].words[1], 11);
  room.activateArea("JHD0");
  assert.equal(room.sceneState.interactionManager.isConfigured(), false);
  room.activateArea("JOMO");
  const returned = room.beginTransaction({ area: "JOMO", program });
  assert.equal(room.sceneState.allocateInteractionManagerRuntimeSlot(17, 19), 0);
  returned.rollback({ reason: "cancelled" });
});

test("source changes replace the manager but cancelled or failed setup restores the previous room owner", () => {
  const program = managerPack.managers.find(manager => manager.disc === 1 && manager.area === "JOMO");
  const replacement = managerPack.managers.find(manager => manager.disc === 2 && manager.area === "JOMO");
  assert.ok(program && replacement);
  let failSetup = false;
  const room = createNativeRoomScriptRuntime({
    transaction: { begin() { if (failSetup) throw new Error("setup failed"); } },
  });
  room.activateArea("JOMO");
  const first = room.beginTransaction({ area: "JOMO", program });
  room.sceneState.allocateInteractionManagerRuntimeSlot(3, 5);
  first.commit();
  const saved = room.sceneState.interactionManager.readRuntimeSlots();
  const changed = room.beginTransaction({ area: "JOMO", program: replacement });
  assert.equal(room.sceneState.interactionManager.identity, replacement.id);
  assert.equal(room.sceneState.allocateInteractionManagerRuntimeSlot(7, 9), 0);
  changed.rollback({ reason: "cancelled" });
  assert.equal(room.sceneState.interactionManager.identity, program.id);
  assert.deepEqual(room.sceneState.interactionManager.readRuntimeSlots(), saved);
  const missing = room.beginTransaction({ area: "JOMO", program: { ...program, mapinfoSha256: "unknown" } });
  assert.equal(room.sceneState.interactionManager.isConfigured(), false);
  missing.rollback({ reason: "source mismatch" });
  assert.deepEqual(room.sceneState.interactionManager.readRuntimeSlots(), saved);
  failSetup = true;
  assert.throws(() => room.beginTransaction({ area: "JOMO", program: replacement }), /setup failed/);
  assert.equal(room.sceneState.interactionManager.identity, program.id);
  assert.deepEqual(room.sceneState.interactionManager.readRuntimeSlots(), saved);
});

test("pending-owner reset clears only its global word and rolls back with the room", async () => {
  const room = createNativeRoomScriptRuntime();
  room.activateArea("JOMO");
  room.sceneState.configureInteractionManager(configuration);
  room.sceneState.writeNativeField({ offset: 0x0c224010, width: 4, value: 0x1234 });
  const action = { semanticId: "interaction-manager-pending-owner-clear",
    arguments: [{ kind: "constant", value: 0 }] };
  const execute = createNativeEventOperationExecutor({ handlers: createNativeInteractionRecordSemanticHandlers() });
  const context = room.eventContext(), tx = room.beginTransaction({ area: "JOMO" });
  // Transaction setup clears a manager when no source profile was supplied;
  // install this fixture before checking the reset operation in isolation.
  room.sceneState.configureInteractionManager(configuration);
  assert.equal((await execute(action, context)).result, 0);
  assert.equal(room.sceneState.readNativeField({ offset: 0x0c224010, width: 4 }), 0);
  assert.deepEqual(room.sceneState.interactionManager.readConfiguration(), configuration);
  tx.rollback({ reason: "cancelled" });
  assert.equal(room.sceneState.readNativeField({ offset: 0x0c224010, width: 4 }), 0x1234);
  assert.equal((await execute(action)).status, "stopped");
  assert.equal((await execute({ ...action, arguments: [{ kind: "constant", value: 1 }] }, context)).status, "stopped");
});

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
  assert.deepEqual(state.readRuntimeSlots()[0].words, [9, 7, -1, 2, 0, 5]);
  assert.equal(state.consumeRuntimeSlotStatus(0), 2);
  assert.deepEqual(state.readRuntimeSlots()[0].words, [9, 7, -1, 2, 0, 0]);
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
