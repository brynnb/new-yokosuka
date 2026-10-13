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
