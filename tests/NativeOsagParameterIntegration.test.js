import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(objectTag, value) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "resolved-object-osag-float-word-write",
    arguments: [{
      kind: "constant",
      value: 0x59524f53,
      ascii: objectTag,
    }, {
      kind: "constant",
      value,
    }],
  };
}

test("scene gameplay context owns the object-associated OSAG field", () => {
  const scene = createNativeSceneGameplayState();
  scene.configureObjectOsagParameterRecord({
    objectTag: "SORY",
    objectAvailable: true,
    recordAvailable: true,
    floatWord1e8: 0x3f800000,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);

  assert.equal(context.nativeOsagParameterState, scene.nativeOsagParameterState);
  assert.deepEqual(scene.readObjectOsagParameterRecord("SORY"), {
    objectAvailable: true,
    recordAvailable: true,
    floatWord1e8: 0x3f800000,
  });
});

test("room script composition executes OSAG field writes transactionally", async () => {
  const room = createNativeRoomScriptRuntime();
  room.activateArea("OP00");
  room.sceneState.configureObjectOsagParameterRecord({
    objectTag: "SORY",
    objectAvailable: true,
    recordAvailable: true,
    floatWord1e8: 0x3f800000,
  });
  const transaction = room.beginTransaction({ area: "OP00" });
  const execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });

  const result = await execute(
    action("SORY", 0x3e0f5c29),
    transaction.context,
  );

  assert.equal(result.status, "continued");
  assert.equal(
    room.sceneState.readObjectOsagParameterRecord("SORY").floatWord1e8,
    0x3e0f5c29,
  );
  transaction.rollback();
  assert.equal(
    room.sceneState.readObjectOsagParameterRecord("SORY").floatWord1e8,
    0x3f800000,
  );
});
