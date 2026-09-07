import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeFixedRecordPoseSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";


const staticAction = {
  semanticId: "native-fixed-record-pose-write",
  arguments: [
    { kind: "constant", value: 1 },
    { kind: "static-pointer", value: 0x27c8 },
    { kind: "constant", value: 0xc000 },
  ],
};


test("operation 0x00ae writes pose fields in the shared 96-byte records", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedRecordPoseSemanticHandlers(),
  });
  const words = [0x459ce000, 0xc3520000, 0xc5afa000];
  const result = await execute(staticAction, {
    ...createNativeSceneFieldRuntimeContext(scene),
    readNativeVector: pointer => pointer === 0x27c8 ? words : undefined,
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    index: 1,
    positionWords1c: words,
    word28: 0xc000,
  });
  assert.deepEqual(scene.readNativeOperation0120ModeTwoRecords()[1], {
    positionWords1c: words,
    word28: 0xc000,
    word34: 0,
  });
});


test("operation 0x00ae reads exact frame-address vector words", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedRecordPoseSemanticHandlers(),
  });
  const fields = new Map([[12, 1], [16, 2], [20, 3]]);
  const result = await execute({
    ...staticAction,
    arguments: [
      { kind: "constant", value: 7 },
      { kind: "frame-address", offset: 12 },
      { kind: "constant", value: 0x1999 },
    ],
  }, {
    ...createNativeSceneFieldRuntimeContext(scene),
    readFrameField: offset => fields.get(offset),
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(scene.readNativeOperation0120ModeTwoRecords()[7], {
    positionWords1c: [1, 2, 3],
    word28: 0x1999,
    word34: 0,
  });
});


test("operation 0x0120 mode two preserves pose fields in the same record", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const poseExecute = createNativeEventOperationExecutor({
    handlers: createNativeFixedRecordPoseSemanticHandlers(),
  });
  await poseExecute(staticAction, {
    ...createNativeSceneFieldRuntimeContext(scene),
    readNativeVector: () => [10, 20, 30],
  });
  const plan = scene.nativeOperation0120State.planModeTwo(1, 9);
  scene.nativeOperation0120State.commit(plan);

  assert.deepEqual(scene.readNativeOperation0120ModeTwoRecords()[1], {
    positionWords1c: [10, 20, 30],
    word28: 0xc000,
    word34: 9,
  });
});


test("operation 0x00ae fails closed without its fixed record table", async () => {
  const scene = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFixedRecordPoseSemanticHandlers(),
  });
  assert.deepEqual(await execute(staticAction, {
    ...createNativeSceneFieldRuntimeContext(scene),
    readNativeVector: () => [1, 2, 3],
  }), {
    status: "stopped",
    reason: "native-fixed-record-table-unavailable",
  });
});
