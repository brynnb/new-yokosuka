import assert from "node:assert/strict";
import test from "node:test";

import { NativeMapClipState } from "../play/world/NativeMapClipState.js";

function node({ collision = true, descendants = [], disposed = false } = {}) {
  return {
    checkCollisions: collision,
    getDescendants: () => descendants,
    isDisposed: () => disposed,
  };
}

function root(filename, options = {}) {
  return {
    ...node(options),
    _filename: filename,
  };
}

test("native MAP CLIP state maps the base and numbered files exactly", () => {
  const baseChild = node();
  const layerFiveChild = node();
  const unrelatedChild = node();
  const state = new NativeMapClipState();

  const records = state.load({ prefix: "S1_D000" }, [
    root("S1_D000_MAP.MT5", {
      collision: false,
      descendants: [baseChild],
    }),
    root("S1_D000_MAP05.MT5", {
      collision: false,
      descendants: [layerFiveChild],
    }),
    root("S1_D000_MAP5.MT5", {
      descendants: [unrelatedChild],
    }),
    root("S1_JU00_MAP05.MT5"),
  ]);

  assert.equal(records.length, 32);
  assert.deepEqual(records[0], { word00: 1, word08: 1 });
  assert.deepEqual(records[5], { word00: 1, word08: 1 });
  assert.deepEqual(records[1], { word00: 0, word08: 0 });
  assert.equal(unrelatedChild.checkCollisions, true);
});

test("native MAP CLIP state controls only collision-classified MAP nodes", () => {
  const collidable = node();
  const visualOnly = node({ collision: false });
  const state = new NativeMapClipState();
  const records = state.load({ prefix: "S1_D000" }, [
    root("S1_D000_MAP07.MT5", {
      collision: false,
      descendants: [collidable, visualOnly],
    }),
  ]);

  records[7].word08 = 0;
  assert.equal(state.applyNativeRecords(records), true);
  assert.equal(collidable.checkCollisions, false);
  assert.equal(visualOnly.checkCollisions, false);

  records[7].word08 = 0xffffffff;
  state.applyNativeRecords(records);
  assert.equal(collidable.checkCollisions, true);
  assert.equal(visualOnly.checkCollisions, false);
});

test("native MAP CLIP transaction rollback restores collision state", () => {
  const collidable = node();
  const state = new NativeMapClipState();
  const records = state.load({ prefix: "S1_D000" }, [
    root("S1_D000_MAP03.MT5", {
      collision: false,
      descendants: [collidable],
    }),
  ]);

  const rollbackToken = state.beginTransaction();
  records[3].word08 = 0;
  state.applyNativeRecords(records);
  assert.equal(collidable.checkCollisions, false);
  state.rollbackTransaction(rollbackToken);
  assert.equal(collidable.checkCollisions, true);

  const commitToken = state.beginTransaction();
  state.applyNativeRecords(records);
  state.commitTransaction(commitToken);
  assert.equal(collidable.checkCollisions, false);
});

test("native MAP CLIP state rejects malformed tables and active clearing", () => {
  const state = new NativeMapClipState();
  assert.throws(
    () => state.applyNativeRecords([]),
    /exactly 32 records/,
  );
  const token = state.beginTransaction();
  assert.throws(() => state.clear(), /during a transaction/);
  state.rollbackTransaction(token);
});
