import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { NativeProgramDataMemory, createNativeTypedTableSemanticHandlers } from "../play/events/NativeProgramDataRuntime.js";
import { createNativeRoomScriptRuntime } from "../play/events/NativeRoomScriptRuntime.js";
import { createNativeEventOperationExecutor } from "../play/events/NativeEventOperationRuntime.js";
import { createNativeEventInterpreter } from "../play/events/NativeEventInterpreter.js";
import { createNativeEventProgramSource } from "../play/events/NativeEventProgramSource.js";

function pool(bytes = Buffer.from("ffffffff000000803412c07f08000000", "hex")) {
  return { schema: "new-yokosuka-native-program-data-v1", sourceSha256: "a".repeat(64), baseFileOffset: 0x100,
    byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), encoding: "base64", data: bytes.toString("base64") };
}
function action(mode, index = 0, word = null) {
  return { kind: "engineOperation", adapterStatus: "proven", semanticId: "typed-indexed-table-access",
    arguments: [0x100, mode, index, ...(word === null ? [] : [word])].map(value => ({ kind: "constant", value })) };
}

test("source-owned table reads preserve widths, float bits and module-relative pointers", async () => {
  const memory = new NativeProgramDataMemory();
  memory.prepare(pool());
  const execute = createNativeEventOperationExecutor({ handlers: createNativeTypedTableSemanticHandlers() });
  const context = { getNativeProgramDataMemory: () => memory };
  assert.equal((await execute(action(1), context)).result, 255);
  assert.equal((await execute(action(2), context)).result, 65535);
  assert.equal((await execute(action(4), context)).result, 0xffffffff);
  assert.equal((await execute(action(5, 1), context)).result, 0x80000000, "negative zero stays negative zero");
  assert.equal((await execute(action(5, 2), context)).result, 0x7fc01234, "float reads preserve NaN payload bits");
  assert.equal((await execute(action(8, 3), context)).result, 0x108);
});

test("writes retain source byte truncation and persist across repeat preparation", async () => {
  const source = pool(), memory = new NativeProgramDataMemory();
  memory.prepare(source);
  const execute = createNativeEventOperationExecutor({ handlers: createNativeTypedTableSemanticHandlers() });
  const context = { getNativeProgramDataMemory: () => memory };
  for (const [mode, value, width, expected] of [[11, 0x1234, 1, 0x34], [12, 0x12345678, 2, 0x5678],
    [14, -1, 4, 0xffffffff], [15, 0x7fc01234, 4, 0x7fc01234], [18, 0x20, 4, 0x20]]) {
    const written = await execute(action(mode, 0, value), context);
    assert.equal(written.status, "continued");
    assert.equal(written.result, 0);
    assert.equal(memory.read(0x100, 0, width), expected);
  }
  assert.equal(memory.prepare({ ...source }), false);
  assert.equal(memory.read(0x100, 0, 4), 0x20);
  assert.throws(() => memory.prepare({ ...source, sourceSha256: "b".repeat(64) }), /different source/);
});

test("unowned, unaligned and incomplete accesses stop without a fabricated value", async () => {
  const memory = new NativeProgramDataMemory(), source = pool();
  assert.throws(() => memory.read(0x100, 0, 4), /unavailable/);
  assert.throws(() => memory.prepare({ ...source, byteLength: 15 }), /byte length/);
  assert.equal(memory.source, null);
  memory.prepare(source);
  for (const [pointer, index, width] of [[0, 0, 4], [0x100, 4, 4], [0x101, 0, 4], [0x100, -1, 4], [0x100, 0, 8]]) {
    assert.throws(() => memory.read(pointer, index, width));
  }
  const execute = createNativeEventOperationExecutor({ handlers: createNativeTypedTableSemanticHandlers() });
  assert.equal((await execute(action(4))).status, "stopped");
  assert.equal((await execute(action(3))).result, 0, "the original unsupported mode is a native no-op");
});

test("room rollback restores source memory and fences stale prepared references", async () => {
  const room = createNativeRoomScriptRuntime();
  room.activateArea("JOMO");
  const context = room.eventContext();
  const execute = createNativeEventOperationExecutor({ handlers: room.semanticHandlers() });
  const program = { staticData: pool() };
  const attempt = room.beginTransaction({ area: "JOMO", program });
  await execute(action(14, 0, 99), context);
  assert.equal((await execute(action(4), context)).result, 99);
  attempt.rollback({ reason: "cancelled" });
  assert.equal((await execute(action(4), context)).status, "stopped", "context must dereference restored ownership, not stale memory");
  const committed = room.beginTransaction({ area: "JOMO", program });
  await execute(action(14, 0, 42), context);
  committed.commit();
  const retry = room.beginTransaction({ area: "JOMO", program });
  assert.equal((await execute(action(4), context)).result, 42);
  retry.rollback({ reason: "retry-cancelled" });
  assert.equal((await execute(action(4), context)).result, 42);
  room.activateArea("JHD0");
  assert.equal((await execute(action(4), context)).status, "stopped");
});

test("a checksum-verified fetched program owns its table bytes inside the room transaction", async () => {
  const program = { id: "source-table", area: "JOMO", entryFunction: "0x100", staticData: pool(),
    functions: [{ id: "0x100", entryBlock: "0x100", blocks: [{ id: "0x100", actions: [], successors: [] }] }] };
  const text = JSON.stringify(program), hash = createHash("sha256").update(text).digest("hex");
  const source = createNativeEventProgramSource({
    index: { schema: "new-yokosuka-native-event-program-index-v1", programs: [{
      id: program.id, area: program.area, entryFunction: program.entryFunction,
      asset: { path: `/data/native-event-programs/${hash}.json`, sha256: hash, byteLength: Buffer.byteLength(text) },
    }] },
    cryptoImpl: webcrypto,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => text }),
  });
  const loaded = await source.loadProgram(program.id);
  const room = createNativeRoomScriptRuntime();
  room.activateArea("JOMO");
  const tx = room.beginTransaction({ area: "JOMO", program: loaded });
  const execute = createNativeEventOperationExecutor({ handlers: room.semanticHandlers() });
  assert.equal((await execute(action(4), room.eventContext())).result, 0xffffffff);
  tx.rollback({ reason: "cancelled" });
  assert.equal((await execute(action(4), room.eventContext())).status, "stopped");
});

test("an original unsigned end word terminates a loop comparing its result with signed minus one", async () => {
  const data = Buffer.alloc(16);
  [0, 4, 6, 0xffffffff].forEach((word, i) => data.writeUInt32LE(word, i * 4));
  const memory = new NativeProgramDataMemory();
  memory.prepare(pool(data));
  const comparison = { kind: "operationResult", comparison: "equal", constant: -1,
    resolvedBranch: { branchFileOffset: "0x118", comparisonTrueSuccessor: "0x120", comparisonFalseSuccessor: "0x130" } };
  const query = { ...action(4), callFileOffset: "0x114", resultComparison: comparison };
  query.arguments[2] = { kind: "frame-field", offset: 0 };
  const program = { entryFunction: "0x100", functions: [{ id: "0x100", entryBlock: "0x100", blocks: [
    { id: "0x100", actions: [{ kind: "frameFieldWrite", callFileOffset: "0x102", offset: 0, width: 4, value: 0 }], successors: ["0x110"] },
    { id: "0x110", actions: [query], terminator: { fileOffset: "0x118", mnemonic: "bf" }, successors: ["0x120", "0x130"] },
    { id: "0x120", actions: [], successors: [] },
    { id: "0x130", actions: [{ kind: "frameFieldAdd", callFileOffset: "0x132", offset: 0, width: 4, value: 1 }], successors: ["0x110"] },
  ] }] };
  let reads = 0;
  const execute = createNativeEventOperationExecutor({ handlers: createNativeTypedTableSemanticHandlers() });
  const interpreter = createNativeEventInterpreter({ program, executeOperation: (...args) => { reads += 1; return execute(...args); } });
  const result = await interpreter.run(null, { getNativeProgramDataMemory: () => memory });
  assert.equal(result.status, "completed");
  assert.equal(reads, 4, "the sentinel terminates before an out-of-range access");
  assert.equal(memory.read(0x100, 3, 4), 0xffffffff, "the reader must preserve the raw unsigned word");

  query.resultComparison = { ...comparison, kind: "operationResultExpression", expression: {
    kind: "comparison-mask", operand: { kind: "equal",
      left: { kind: "operation-result", callFileOffset: "0x114" },
      right: { kind: "frame-field", offset: 8, width: 4, signedLoad: false },
    },
  } };
  reads = 0;
  const compound = await interpreter.run(null, { getNativeProgramDataMemory: () => memory, initialFrameFields: { 8: -1 } });
  assert.equal(compound.status, "completed");
  assert.equal(reads, 4, "compound result/frame predicates compare the same register bits too");
});
