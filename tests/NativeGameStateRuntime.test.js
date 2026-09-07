import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeGameStateSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(...values) {
  return {
    kind: "engineOperation",
    semanticId: "native-game-state-byte-control",
    arguments: values.map(value => ({ kind: "constant", value })),
  };
}

test("game-state fixed byte pairs use only their exact native addresses", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  for (const [writeMode, readMode, address] of [
    [14, 15, 0x0c220a5b],
    [57, 58, 0x0c220a58],
    [73, 74, 0x0c2218ed],
    [75, 76, 0x0c2218ec],
  ]) {
    assert.deepEqual(await execute(action(writeMode, 0x123), context), {
      result: 0xff,
      mutation: { offset: address, width: 1, value: 0xff },
    });
    assert.deepEqual(await execute(action(readMode), context), {
      result: 0xff,
    });
  }
});

test("game-state indexed byte route preserves native address arithmetic", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(71, 4, -1), context), {
    result: 0xff,
    mutation: { offset: 0x0c2218d0, width: 1, value: 0xff },
  });
  assert.deepEqual(await execute(action(72, 4), context), { result: 0xff });
});

test("game-state mode 42 saturates its exact indexed byte", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  assert.deepEqual(await execute(action(42, 40), context), {
    result: 1,
    mutation: { offset: 0x0c221468, width: 1, value: 1 },
  });
  assert.deepEqual(await execute(action(42, 40), context), {
    result: 2,
    mutation: { offset: 0x0c221468, width: 1, value: 2 },
  });
  scene.writeNativeField({ offset: 0x0c221468, width: 1, value: 0xff });
  assert.deepEqual(await execute(action(42, 40), context), {
    result: 0xff,
    mutation: { offset: 0x0c221468, width: 1, value: 0xff },
  });
});

test("game-state mode 42 registers its executable-proven special codes once", async () => {
  const scene = createNativeSceneGameplayState();
  const context = createNativeSceneFieldRuntimeContext(scene);
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  await execute(action(42, 99), context);
  assert.equal(scene.readNativeField({
    offset: 0x0c22220c,
    width: 2,
  }), 3);
  assert.deepEqual([0, 1, 2].map(index => scene.readNativeField({
    offset: 0x0c221e0c + index * 2,
    width: 2,
  })), [0x02c0, 0x007d, 0x00fd]);
  await execute(action(42, 99), context);
  assert.equal(scene.readNativeField({
    offset: 0x0c22220c,
    width: 2,
  }), 3);
});

test("game-state selector 44 reads its exact signed 16-bit field", async () => {
  const scene = createNativeSceneGameplayState();
  scene.writeNativeField({ offset: 0x0c220d14, width: 2, value: 0xffff });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  assert.deepEqual(await execute(
    action(44),
    createNativeSceneFieldRuntimeContext(scene),
  ), { result: -1 });
});

test("game-state pair byte routes retain the native helper boundary", async () => {
  const records = new Map();
  const key = ({ firstKey, secondKey }) => `${firstKey}:${secondKey}`;
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers({
      writeNativeGameStatePairByte: detail => {
        records.set(key(detail), detail.value);
      },
      readNativeGameStatePairByte: detail => records.get(key(detail)) ?? 0,
    }),
  });
  assert.deepEqual(await execute(action(55, 1, 9, 300)), {
    result: 0xff,
    mutation: { firstKey: 1, secondKey: 9, value: 0xff },
  });
  assert.deepEqual(await execute(action(56, 1, 9)), { result: 0xff });
});

test("game-state byte routes stop at missing or invalid boundaries", async () => {
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeGameStateSemanticHandlers(),
  });
  assert.equal(
    (await execute(action(15))).reason,
    "native-game-state-byte-reader-missing",
  );
  assert.equal(
    (await execute(action(14, 1))).reason,
    "native-game-state-byte-writer-missing",
  );
  assert.equal(
    (await execute(action(55, 1, 2, 3))).reason,
    "native-game-state-pair-byte-writer-missing",
  );
  assert.equal(
    (await execute(action(56, 1, 2))).reason,
    "native-game-state-pair-byte-reader-missing",
  );
  assert.equal(
    (await execute(action(70))).reason,
    "native-game-state-byte-mode-unproved",
  );
});
