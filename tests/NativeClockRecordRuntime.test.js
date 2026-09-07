import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeClockRecordSemanticHandlers,
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeClockRecordState,
  normalizeNativeClockRecord,
  nativeClockRecordFromGameDate,
} from "../play/events/NativeClockRecordRuntime.js";

function action(kind, offset = 4, semanticId = "native-clock-record-copy") {
  return {
    kind: "engineOperation",
    semanticId,
    callFileOffset: "0x120",
    arguments: [{ kind, offset }],
  };
}

test("derives the exact seven bytes from the authoritative game date", () => {
  assert.deepEqual(
    nativeClockRecordFromGameDate(
      new Date("1986-12-04T23:32:02.000Z"),
    ),
    [86, 12, 4, 4, 23, 32, 2],
  );
  assert.throws(
    () => nativeClockRecordFromGameDate(new Date("2000-01-01T00:00:00Z")),
    /outside 1900-1999/,
  );
});

test("normalizes the exact native calendar fields and recomputes weekday", () => {
  assert.deepEqual(
    normalizeNativeClockRecord([86, 12, 31, 99, 23, 59, 60]),
    [87, 1, 1, 4, 0, 0, 0],
  );
  assert.deepEqual(
    normalizeNativeClockRecord([88, 2, 29, 99, 8, 30, 0]),
    [88, 2, 29, 1, 8, 30, 0],
  );
});

test("clock state owns native writes transactionally over the game clock", () => {
  const state = createNativeClockRecordState({
    readAuthoritativeRecord: () => [86, 11, 29, 6, 8, 30, 0],
  });
  assert.deepEqual(state.read(), [86, 11, 29, 6, 8, 30, 0]);
  const snapshot = state.snapshot();
  assert.equal(state.write([86, 12, 3, 0, 8, 55, 0]), true);
  assert.deepEqual(state.read(), [86, 12, 3, 3, 8, 55, 0]);
  assert.equal(state.restore(snapshot), true);
  assert.deepEqual(state.read(), [86, 11, 29, 6, 8, 30, 0]);
});

test("installs operation 0x0058 from an exact frame address", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeClockRecordSemanticHandlers({
      writeNativeClockRecord: record => writes.push(record),
    }),
  });
  const fields = [86, 12, 3, 0, 8, 30, 0];
  const result = await execute(
    action("frame-address", 4, "native-clock-record-write"),
    { readFrameField: offset => fields[offset - 4] },
  );
  assert.equal(result.status, "continued");
  assert.deepEqual(writes, [[86, 12, 3, 3, 8, 30, 0]]);
});

test("copies all seven exact native clock bytes to a frame address", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeClockRecordSemanticHandlers({
      readNativeClockRecord: () => [86, 12, 3, 2, 14, 30, 45],
    }),
  });
  const result = await execute(action("frame-address"), {
    location: { functionId: "0x100" },
    writeFrameField: write => writes.push(write),
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(writes.map(({ offset, width, value }) => ({
    offset,
    width,
    value,
  })), [
    { offset: 4, width: 1, value: 86 },
    { offset: 5, width: 1, value: 12 },
    { offset: 6, width: 1, value: 3 },
    { offset: 7, width: 1, value: 2 },
    { offset: 8, width: 1, value: 14 },
    { offset: 9, width: 1, value: 30 },
    { offset: 10, width: 1, value: 45 },
  ]);
  assert.deepEqual(writes[0].source, {
    functionFileOffset: "0x100",
    callFileOffset: "0x120",
  });
});

test("copies the record through the exact scene-field writer", async () => {
  const writes = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeClockRecordSemanticHandlers({
      readNativeClockRecord: () => Uint8Array.from([1, 2, 3, 4, 5, 6, 7]),
    }),
  });
  assert.equal((await execute(action("scene-address", 0x80), {
    writeSceneField: write => writes.push(write),
  })).status, "continued");
  assert.deepEqual(
    writes.map(write => write.offset),
    [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86],
  );
});

test("stops when the exact native record is unavailable", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeClockRecordSemanticHandlers(),
  });
  assert.deepEqual(await execute(action("frame-address"), {
    writeFrameField: () => {},
  }), {
    status: "stopped",
    reason: "native-clock-record-reader-missing",
  });
});
