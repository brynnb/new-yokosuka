import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceNativeAddressOperand,
  isNativeAddressOperand,
  readNativeAddressWords,
  writeNativeAddressWords,
} from "../play/events/NativeEventAddress.js";

test("native event addresses preserve frame address identity and stride", () => {
  const fields = new Map([
    [0x20, 0x12345678],
    [0x24, -1],
    [0x28, 3],
  ]);
  const writes = [];
  const address = { kind: "frame-address", offset: 0x20 };
  const context = {
    readFrameField: offset => fields.get(offset),
    writeFrameField: write => writes.push(write),
  };

  assert.equal(isNativeAddressOperand(address), true);
  assert.deepEqual(
    readNativeAddressWords(address, context, 3),
    [0x12345678, 0xffffffff, 3],
  );
  assert.deepEqual(
    advanceNativeAddressOperand(address, 4),
    { kind: "frame-address", offset: 0x24 },
  );
  assert.deepEqual(address, { kind: "frame-address", offset: 0x20 });

  const source = { functionFileOffset: 1, callFileOffset: 2 };
  writeNativeAddressWords(address, context, [4, 5, 6], source);
  assert.deepEqual(writes, [
    { offset: 0x20, width: 4, value: 4, source },
    { offset: 0x24, width: 4, value: 5, source },
    { offset: 0x28, width: 4, value: 6, source },
  ]);
});

test("native event addresses use scene accessors without pointer coercion", () => {
  const fields = new Map([[0x100, 7], [0x104, 8], [0x108, 9]]);
  const address = { kind: "scene-address", offset: 0x100 };
  const writes = [];
  const context = {
    readSceneField: offset => fields.get(offset),
    writeSceneField: write => writes.push(write),
  };

  assert.deepEqual(readNativeAddressWords(address, context, 3), [7, 8, 9]);
  writeNativeAddressWords(address, context, [10, 11, 12]);
  assert.deepEqual(writes.map(write => write.offset), [0x100, 0x104, 0x108]);
});

test("native event addresses reject incomplete and unowned memory", () => {
  assert.equal(isNativeAddressOperand({ kind: "constant", value: 1 }), false);
  assert.throws(
    () => readNativeAddressWords(
      { kind: "frame-address", offset: 0 },
      { readFrameField: () => undefined },
      1,
    ),
    /word at offset 0x0 is unavailable/,
  );
  assert.throws(
    () => writeNativeAddressWords(
      { kind: "scene-address", offset: 0 },
      {},
      [1],
    ),
    /scene-address-writer-missing/,
  );
});
