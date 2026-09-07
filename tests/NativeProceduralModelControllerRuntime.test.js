import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeProceduralModelControllerSemanticHandlers,
  createNativeProceduralModelControllerState,
} from "../play/events/NativeProceduralModelControllerRuntime.js";

function constant(value) {
  return { kind: "constant", value };
}

function action(mode, operands) {
  return {
    kind: "engineOperation",
    semanticId: "native-procedural-model-controller",
    callFileOffset: "0x1556c",
    arguments: [constant(mode), ...operands],
  };
}

function context(state, extra = {}) {
  const strings = new Map([
    [0x22408, "model/object"],
    [0x22415, "trlake1.pvr"],
    [0x22421, "model/object"],
    [0x2242e, "trsea025.mt6"],
    [0x2243b, "model/object"],
    [0x22448, "grid025.bin"],
  ]);
  return {
    nativeProceduralModelControllerState: state,
    resolveNativeStaticString: pointer => strings.get(pointer),
    ...extra,
  };
}

function createAction() {
  return action(0, [
    {
      kind: "static-pointer",
      value: 0x21600,
      staticWords: [0x4114cccd, 0xbda3d70a, 0x41300000],
    },
    constant(0x22408),
    constant(0x22415),
    constant(0x22421),
    constant(0x2242e),
    constant(0x3e800000),
    constant(0x1000),
  ]);
}

function executor(options = {}) {
  return createNativeEventOperationExecutor({
    handlers: createNativeProceduralModelControllerSemanticHandlers(options),
  });
}

test("allocates OP00's exact authored procedural model and returns its slot", async () => {
  const state = createNativeProceduralModelControllerState();
  const applied = [];
  const result = await executor()(createAction(), context(state, {
    applyNativeProceduralModelMutation: detail => applied.push(detail),
  }));

  assert.equal(result.status, "continued");
  assert.equal(result.result, 0);
  assert.equal(result.mutation.mode, 0);
  assert.deepEqual(state.read(0), {
    handle: 0,
    flagBit2Set: true,
    flagsWord: 0x100a,
    originWords: [0x4114cccd, 0xbda3d70a, 0x41300000],
    resourcePath: "model/object",
    texture: "trlake1.pvr",
    modelPath: "model/object",
    model: "trsea025.mt6",
    scaleWord: 0x3e800000,
    gridResource: null,
    parameters: {},
    modelCommands: [],
    packedColor: null,
  });
  assert.equal(applied.length, 1);
});

test("applies exact OP00 field, grid, flag, color, and lifecycle routes", async () => {
  const state = createNativeProceduralModelControllerState();
  const execute = executor();
  const ctx = context(state);
  await execute(createAction(), ctx);
  await execute(action(17, [
    constant(0), constant(0x2243b), constant(0x22448),
  ]), ctx);
  await execute(action(10, [
    constant(0), ...[1, 2, 3, 4, 5, 6].map(constant),
  ]), ctx);
  await execute(action(11, [
    constant(0), constant(7), constant(8), constant(9),
  ]), ctx);
  await execute(action(13, [
    constant(0), constant(0x3f800000), constant(0x3f000000),
  ]), ctx);
  await execute(action(14, [
    constant(0), constant(10), constant(11),
  ]), ctx);
  await execute(action(16, [
    constant(0), constant(12), constant(13),
  ]), ctx);
  await execute(action(21, [
    constant(0), constant(2), constant(2),
  ]), ctx);
  await execute(action(24, [
    constant(0), constant(255), constant(169), constant(190), constant(125),
  ]), ctx);
  await execute(action(2, [constant(0)]), ctx);

  const record = state.read(0);
  assert.equal(record.flagBit2Set, false);
  assert.equal(record.flagsWord & 0x04000002, 0x04000000);
  assert.deepEqual(record.gridResource, {
    path: "model/object",
    name: "grid025.bin",
  });
  assert.deepEqual(record.parameters, {
    wordAc: 1, wordB0: 2, wordB4: 3, wordB8: 4, wordBc: 5, wordC0: 6,
    wordA0: 7, wordA4: 8, wordA8: 9,
    word20: 0x3f800000, word24: 0x40a00000,
    word28: 10, word2c: 11,
    word38: 12, word3c: 13,
  });
  assert.deepEqual(record.modelCommands, [{ firstWord: 2, secondWord: 2 }]);
  assert.equal(record.packedColor, 0xffa9be7d);

  await execute(action(3, [constant(0)]), ctx);
  assert.equal(state.read(0), null);
});

test("mode 18 reads the exact point, truncates height, and returns it", async () => {
  const state = createNativeProceduralModelControllerState();
  const queries = [];
  const execute = executor({
    querySurfaceHeight: detail => {
      queries.push(detail);
      return -12.875;
    },
  });
  const fields = new Map([
    [4, 0x3f800000],
    [8, 0x40000000],
    [12, 0x40400000],
  ]);
  const ctx = context(state, {
    readFrameField: offset => fields.get(offset),
  });
  await execute(createAction(), ctx);
  const result = await execute(action(18, [
    constant(0), { kind: "frame-address", offset: 4 },
  ]), ctx);

  assert.equal(result.status, "continued");
  assert.equal(result.result, -12);
  assert.deepEqual(queries[0].pointWords, [
    0x3f800000, 0x40000000, 0x40400000,
  ]);
});

test("surface queries fail closed without the typed geometry adapter", async () => {
  const state = createNativeProceduralModelControllerState();
  const execute = executor();
  const ctx = context(state, {
    readFrameField: () => 0,
  });
  await execute(createAction(), ctx);
  const result = await execute(action(18, [
    constant(0), { kind: "frame-address", offset: 4 },
  ]), ctx);
  assert.deepEqual(result, {
    status: "stopped",
    reason: "native-procedural-model-surface-query-missing",
  });
});

test("controller snapshots retain exactly two independent native slots", () => {
  const state = createNativeProceduralModelControllerState();
  state.allocate({
    originWords: [0, 0, 0],
    resourcePath: "model/object",
    texture: "a.pvr",
    modelPath: "model/object",
    model: "a.mt6",
    scaleWord: 0,
    flagsWord: 0,
  });
  state.allocate({
    originWords: [1, 2, 3],
    resourcePath: "model/object",
    texture: "b.pvr",
    modelPath: "model/object",
    model: "b.mt6",
    scaleWord: 1,
    flagsWord: 2,
  });
  const snapshot = state.snapshot();
  state.release(0);
  state.restore(snapshot);
  assert.equal(state.read(0).model, "a.mt6");
  assert.equal(state.read(1).model, "b.mt6");
  assert.throws(() => state.allocate({}), /slots-exhausted/);
});
