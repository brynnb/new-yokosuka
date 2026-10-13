import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { NativeInteractionManagerState } from "../play/events/NativeInteractionManagerState.js";
import { NativeProgramDataMemory } from "../play/events/NativeProgramDataRuntime.js";
import { NativePersistentScriptBitState } from "../play/events/NativePersistentScriptBitState.js";
import { createNativeSceneGameplayState } from "../play/events/NativeSceneGameplayState.js";
import managerPack from "../play/data/events/nativeInteractionManagers.generated.json" with { type: "json" };
import { createNativeRoomScriptRuntime } from "../play/events/NativeRoomScriptRuntime.js";
import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import { createNativeScriptedEventRuntime } from "../play/events/NativeScriptedEventRuntime.js";
import { createNativeActorByteState } from "../play/events/NativeActorByteState.js";
import { createNativeSceneResourceRegistry } from "../play/events/NativeSceneResourceRegistry.js";
import { createNativeFreeConversationState } from "../play/events/NativeScriptedSceneRuntime.js";
import { createNativeDialogueState } from "../play/dialogue/NativeDialogueState.js";

function initializerAction() {
  const arguments_ = [0x100, 0x140, 0x180, 0x180, 208, 224, 264, 304, 344,
    0x52494b41, 15, 0x184, 0x188, 424].map((value, index) => (
    [4, 5, 6, 7, 8, 13].includes(index) ? { kind: "scene-address", offset: value }
      : { kind: "constant", value }
  ));
  return { kind: "secondaryEngineOperation", operationId: 0, adapterStatus: "proven",
    semanticId: "interaction-manager-initialize", callFileOffset: "0x15aa2", arguments: arguments_ };
}

test("secondary initializer binds room ownership, returns VM zero, and rolls back the captured save owner", async () => {
  const input = fixture(), room = createNativeRoomScriptRuntime();
  room.activateArea("JOMO");
  room.sceneState.nativeProgramDataMemory = input.memory;
  room.sceneState.writeObjectVector("AKIR", [0, 0, 0]);
  const tx = room.beginTransaction({ area: "JOMO" });
  const execute = createNativeEventOperationExecutor({ handlers: tx.handlers });
  const context = { ...tx.context, nativePersistentScriptBitState: input.persistentBits };
  const result = await execute(initializerAction(), context);
  assert.equal(result.status, "continued", JSON.stringify(result));
  assert.equal(result.result, 0, "C register r0 is not the pre-cleared VM return cell");
  const binding = room.sceneState.interactionManager.ownerBinding;
  assert.equal(binding.resolvedOwner, "AKIR");
  assert.equal(binding.rawOwnerWord, 0x52494b41);
  assert.deepEqual(binding.sceneBindings.map(x => x.offset), [208, 224, 264, 304, 344, 424]);
  assert.equal(binding.task.suspended, false);
  assert.equal(room.sceneState.readInteractionContextWord56(), 0);
  tx.update({ deltaSeconds: 1 / 30 });
  room.sceneState.writeInteractionRecordFields(0, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => input.memory.read(0x100, i + 6, 4)), [1, 2, 3, 4, 5, 6, 7]);
  assert.throws(() => room.sceneState.writeInteractionRecordFields(1, [1, 2, 3, 4, 5, 6, 7]), /outside/);
  room.sceneState.writeInteractionContextWord56(1);
  assert.throws(() => tx.update({ deltaSeconds: 1 / 30 }), /update mode 1 is unimplemented/);
  const replacement = new NativePersistentScriptBitState();
  context.nativePersistentScriptBitState = replacement;
  const changed = await execute(initializerAction(), context);
  assert.equal(changed.status, "stopped");
  tx.rollback({ reason: "cancelled" });
  assert.equal(input.persistentBits.read(255), 0);
  assert.equal(input.persistentBits.read(7), 1);
  assert.equal(replacement.read(255), 0);
  assert.equal(room.sceneState.interactionManager.ownerBinding, null);
  assert.equal(room.sceneState.nativeProgramDataMemory.read(0x100, 7, 4), 77);
  const next = room.beginTransaction({ area: "JOMO" });
  const stale = await execute(initializerAction(), { ...context, nativePersistentScriptBitState: input.persistentBits });
  assert.equal(stale.status, "stopped", "an old event callback cannot initialize a newer transaction");
  const accepted = await execute(initializerAction(), { ...next.context, nativePersistentScriptBitState: input.persistentBits });
  assert.equal(accepted.status, "continued");
  next.commit();
  assert.equal(input.persistentBits.read(255), 1);
  assert.equal(room.sceneState.interactionManager.ownerBinding.resolvedOwner, "AKIR");
  room.activateArea("JHD0");
  assert.equal(room.sceneState.interactionManager.ownerBinding, null);
});

test("secondary initializer rejects frame-address aliases and unavailable persistent state before mutation", async () => {
  for (const failure of ["binding", "bits"]) {
    const input = fixture(), room = createNativeRoomScriptRuntime();
    room.activateArea("JOMO");
    room.sceneState.nativeProgramDataMemory = input.memory;
    const tx = room.beginTransaction({ area: "JOMO" });
    const action = initializerAction();
    if (failure === "binding") action.arguments[4].kind = "frame-address";
    const execute = createNativeEventOperationExecutor({ handlers: tx.handlers });
    const result = await execute(action, { ...tx.context,
      nativePersistentScriptBitState: failure === "bits" ? null : input.persistentBits });
    assert.equal(result.status, "stopped");
    assert.equal(input.memory.read(0x100, 7, 4), 77);
    assert.equal(room.sceneState.interactionManager.ownerBinding, null);
    tx.rollback();
  }
});

function memoryFor(bytes, baseFileOffset = 0x100) {
  const memory = new NativeProgramDataMemory();
  const hash = createHash("sha256").update(bytes).digest("hex");
  memory.prepare({ schema: "new-yokosuka-native-program-data-v1", encoding: "base64",
    sourceSha256: hash, sha256: hash, baseFileOffset, byteLength: bytes.length, data: bytes.toString("base64") });
  return memory;
}

function fixture() {
  const bytes = Buffer.alloc(0xc0);
  [0, 71, 0xffff00ff, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82]
    .forEach((word, i) => bytes.writeUInt32LE(word, i * 4));
  bytes.writeUInt32LE(0xffffffff, 52);
  bytes.writeUInt32LE(0, 0x40);
  bytes.writeUInt32LE(0xffffffff, 0x44);
  bytes.writeUInt32LE(2, 0x80);
  const persistentBits = new NativePersistentScriptBitState();
  persistentBits.write(7, 1);
  return { id: "fixture", memory: memoryFor(bytes), descriptorPointer: 0x100,
    indexPointer: 0x140, indexEndPointer: 0x180, recordPointer: 0x180,
    controlArgument: 15, persistentBits };
}

test("source table initialization preserves words zero/two and unrelated persistent flags", () => {
  const input = fixture(), state = new NativeInteractionManagerState();
  const result = state.initializeTables(input);
  assert.deepEqual(Array.from({ length: 13 }, (_, i) => input.memory.read(0x100, i, 4)),
    [0, 0, 0xffff00ff, 0, 0, 0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]);
  assert.equal(input.persistentBits.read(255), 1);
  assert.equal(input.persistentBits.read(7), 1);
  assert.equal(input.persistentBits.read(0), 0);
  assert.equal(state.queryIndirectIndex(0, 2), 0);
  assert.equal(result.descriptorCount, 1);
  assert.equal(result.controlLimit, 1);
  assert.equal(result.candidateCapacity, 1);
  assert.deepEqual(result.candidateScratch, Array.from({ length: 10 }, () =>
    [0xffffffff, 0, 0x4b18967f, 0x4b18967f, 0]));
  result.candidateScratch[0][0] = 12;
  assert.equal(state.initializedTables.candidateScratch[0][0], 0xffffffff);
  state.allocateRuntimeSlot(1, 2);
  state.initializeTables({ ...input, controlArgument: 0xffffffff });
  assert.equal(state.initializedTables.controlLimit, -1, "native comparison is signed");
  assert.deepEqual(state.readRuntimeSlots()[0].words, [0, 0, -1, -3, 0, 5]);
});

test("malformed tables fail before any manager, memory, or persistent state is changed", () => {
  for (const corrupt of [
    input => input.memory.write(0x100, 0, 4, 0xfffffffe),
    input => input.memory.write(0x140, 0, 4, 0xfffffffe),
    input => { input.indexPointer = 0x134; },
    input => { input.indexEndPointer = 0x144; },
    input => { input.controlArgument = NaN; },
  ]) {
    const input = fixture(), state = new NativeInteractionManagerState();
    state.configure({ id: "previous", descriptorSequences: [], indirectRecords: [] });
    state.allocateRuntimeSlot(7, 9);
    corrupt(input);
    const before = { configuration: state.readConfiguration(), slots: state.readRuntimeSlots(),
      bytes: [...input.memory.bytes], bits: input.persistentBits.toJSON() };
    assert.throws(() => state.initializeTables(input));
    assert.deepEqual({ configuration: state.readConfiguration(), slots: state.readRuntimeSlots(),
      bytes: [...input.memory.bytes], bits: input.persistentBits.toJSON() }, before);
  }
});

test("room snapshots restore initialized manager tables and memory together", () => {
  const input = fixture(), scene = createNativeSceneGameplayState();
  scene.nativeProgramDataMemory = input.memory;
  const before = scene.snapshot();
  scene.interactionManager.initializeTables(input);
  const initialized = scene.snapshot();
  scene.interactionManager.allocateRuntimeSlot(4, 8);
  scene.nativeProgramDataMemory.write(0x100, 7, 4, 12);
  scene.restore(initialized);
  assert.equal(scene.nativeProgramDataMemory.read(0x100, 7, 4), 0xffffffff);
  assert.equal(scene.interactionManager.initializedTables.descriptorCount, 1);
  assert.equal(scene.interactionManager.readRuntimeSlots()[0].words[3], -3);
  scene.restore(before);
  assert.equal(scene.nativeProgramDataMemory.read(0x100, 7, 4), 77);
  assert.equal(scene.interactionManager.initializedTables, null);
  // Persistent bits belong to the existing personal-save transaction, not the
  // room snapshot. No second save store is introduced by this initializer.
});

const reportPath = new URL("../.disc-work/dialogue/native-interaction-manager.json", import.meta.url);
test("all original room tables initialize with the exact recovered graph and flag writes", {
  skip: !fs.existsSync(reportPath) && "local extracted game data is unavailable",
}, () => {
  const root = path.resolve(import.meta.dirname, "..");
  const report = JSON.parse(fs.readFileSync(reportPath));
  let descriptorCount = 0;
  for (const entry of report.registrations) {
    const bytes = fs.readFileSync(path.resolve(root, entry.source));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.mapinfoSha256);
    const memory = memoryFor(bytes, 0), bits = new NativePersistentScriptBitState();
    const state = new NativeInteractionManagerState();
    const id = `${entry.disc}:${entry.area}:${entry.mapinfoSha256}`;
    const result = state.initializeTables({ id, memory, persistentBits: bits,
      descriptorPointer: Number(entry.descriptorTable.fileOffset),
      indexPointer: Number(entry.indirectIndexTable.fileOffset),
      indexEndPointer: Number(entry.indirectIndexTable.upperBoundFileOffset),
      recordPointer: Number(entry.indirectRecordTable.fileOffset), controlArgument: entry.controlArgument.value });
    const catalog = managerPack.managers.find(item => item.id === id);
    assert.deepEqual(state.readConfiguration(), { id, descriptorSequences: catalog.descriptorSequences,
      indirectRecords: catalog.indirectRecords });
    assert.equal(result.descriptorCount, entry.descriptorTable.recordCount);
    const expected = new NativePersistentScriptBitState();
    for (const record of entry.descriptorTable.records) {
      const word = record.words[2];
      expected.write(word & 0xffff, 1); expected.write(word >>> 16, 1);
      assert.equal(memory.read(Number(record.fileOffset), 2, 4), word);
      assert.equal(memory.read(Number(record.fileOffset), 7, 4), 0xffffffff);
    }
    assert.deepEqual(bits.toJSON(), expected.toJSON());
    descriptorCount += result.descriptorCount;
  }
  assert.equal(report.registrations.length, 96);
  assert.equal(descriptorCount, 517);
});

// Feed this the canonical builder's scoped JOMO pack, never a hand-edited
// action list. This proves source execution, not rendering or full startup.
test("original JOMO startup executes selector zero and unwinds when the next source boundary stops", {
  skip: !process.env.NY_JOMO_STARTUP_PACK && "set NY_JOMO_STARTUP_PACK to a freshly compiled scoped package",
}, async () => {
  const programPack = JSON.parse(fs.readFileSync(process.env.NY_JOMO_STARTUP_PACK));
  const program = programPack.programs.find(p => p.id === "disc1-jomo-room-initialization-0x88b70");
  assert.equal(program.mapinfoSha256, "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9");
  const resources = createNativeSceneResourceRegistry(), bits = new NativePersistentScriptBitState();
  const dialogueState = createNativeDialogueState();
  const room = createNativeRoomScriptRuntime({ motionResource: resources.adapter(),
    operation013c: resources.adapter(), operation013e: resources.adapter(),
    clockRecord: { readNativeClockRecord: () => [86, 12, 3, 3, 8, 55, 0] },
    scriptedScene: { freeConversationState: createNativeFreeConversationState({ dialogueState }) } });
  room.activateArea("JOMO");
  room.operation01c7State.initializeColdState();
  room.applyArrival({ scene: 1, area: "JOMO", entry: 1 }, { clockLoaderControlDword: 0 });
  room.sceneState.writeObjectVector("AKIR", [0, 0, 0]);
  let initialized;
  const runtime = createNativeScriptedEventRuntime({ programPack, actorByteState: createNativeActorByteState(),
    createExecution(detail) {
      const tx = room.beginTransaction(detail), handler = tx.handlers["interaction-manager-initialize"];
      tx.handlers["interaction-manager-initialize"] = async call => {
        const result = await handler(call);
        initialized = { result, binding: structuredClone(room.sceneState.interactionManager.ownerBinding), bits: bits.toJSON() };
        return result;
      };
      return tx;
    } });
  const result = await runtime.startProgram({ programId: program.id,
    context: { dialogueState, nativePersistentScriptBitState: bits } });
  assert.equal(initialized?.result.status, "continued", JSON.stringify(result));
  assert.equal(initialized.result.mutation.descriptorCount, 17);
  assert.equal(initialized.result.mutation.controlLimit, 15);
  assert.equal(initialized.binding.resolvedOwner, "AKIR");
  assert.equal(initialized.binding.source.callFileOffset, "0x15aa2");
  assert.deepEqual(initialized.bits.bytes.slice(12, 17), [240, 243, 255, 191, 31]);
  assert.equal(result.status, "stopped");
  assert.equal(result.reason.result.reason.semanticId, "native-operation-0166-control");
  assert.equal(result.reason.result.reason.detail, "native operation 0x0166 scheduler path is unavailable");
  assert.equal(result.reason.result.location.blockId, "0x88ece");
  assert.equal(room.sceneState.interactionManager.ownerBinding, null);
  assert.deepEqual(bits.toJSON(), new NativePersistentScriptBitState().toJSON());
});
