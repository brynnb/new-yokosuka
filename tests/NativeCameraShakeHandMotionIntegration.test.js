import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";
import {
  createNativeSceneResourceRegistry,
} from "../play/events/NativeSceneResourceRegistry.js";

test("room composition exposes the camera-shake state contract", async () => {
  const room = createNativeRoomScriptRuntime();
  const execute = createNativeEventOperationExecutor({
    handlers: room.semanticHandlers(),
  });
  const result = await execute({
    semanticId: "native-camera-shake-envelope-write",
    arguments: [
      { kind: "constant", value: 0x3e99999a },
      { kind: "constant", value: 0x3dcccccd },
      { kind: "constant", value: 0x3f4ccccd },
    ],
  }, room.eventContext());
  assert.equal(result.status, "continued");
  assert.deepEqual(room.eventContext().nativeCameraShakeState.read(), {
    horizontalAmplitudeWord: 0x3e99999a,
    verticalAmplitudeWord: 0x3dcccccd,
    retentionWord: 0x3f4ccccd,
  });
});

test("room resource adapter retains the OP00 HMOT request", async () => {
  const resources = createNativeSceneResourceRegistry();
  const room = createNativeRoomScriptRuntime({
    motionResource: resources.adapter(),
  });
  const execute = createNativeEventOperationExecutor({
    handlers: room.semanticHandlers(),
  });
  const result = await execute({
    semanticId: "native-hand-motion-resource-request",
    callFileOffset: "0x154ae",
    arguments: [
      { kind: "constant", value: 1 },
      { kind: "constant", value: 0x3030504f },
      { kind: "static-pointer", value: 0x223d8 },
    ],
  }, {
    ...room.eventContext(),
    location: { functionId: "0x1512a" },
    resolveNativeStaticString: pointer => (
      pointer === 0x223d8 ? "HMOT0102.BIN" : null
    ),
  });
  assert.equal(result.status, "continued");
  assert.equal(result.result, 1);
  assert.deepEqual(resources.handMotionRequest(1), {
    kind: "native-hand-motion-resource-request",
    handle: 1,
    path: "scene/01/OP00",
    name: "HMOT0102.BIN",
    resourceType: "HNDM",
    global: false,
    source: {
      functionFileOffset: "0x1512a",
      callFileOffset: "0x154ae",
    },
  });
});
