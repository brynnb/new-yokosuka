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

function motionRequestAction(filenamePointer, discOperand = {
  kind: "constant",
  value: 1,
}) {
  return {
    kind: "engineOperation",
    adapterStatus: "proven",
    semanticId: "native-motion-resource-request",
    callFileOffset: "0x15476",
    arguments: [
      discOperand,
      { kind: "constant", value: 0x3030504f },
      { kind: "static-pointer", value: filenamePointer },
    ],
  };
}

test("room transactions execute the shared native MOTI request handler", async () => {
  const resources = createNativeSceneResourceRegistry();
  const room = createNativeRoomScriptRuntime({
    motionResource: resources.adapter(),
  });
  room.activateArea("OP00");
  const transaction = room.beginTransaction({
    area: "OP00",
    program: {},
  });
  const execute = createNativeEventOperationExecutor({
    handlers: transaction.handlers,
  });
  const result = await execute(
    motionRequestAction(0x223c3, {
      kind: "operation-result",
      callFileOffset: "0x15468",
    }),
    {
      ...transaction.context,
      location: { functionId: "0x1512a" },
      readOperationResult: callFileOffset => (
        callFileOffset === "0x15468" ? 1 : undefined
      ),
      resolveNativeStaticString: pointer => (
        pointer === 0x223c3 ? "M_0101A.BIN" : null
      ),
    },
  );

  assert.equal(result.status, "continued");
  assert.equal(result.result, 1);
  assert.deepEqual(resources.motionRequest(1), {
    kind: "native-motion-resource-request",
    handle: 1,
    path: "scene/01/OP00",
    name: "M_0101A.BIN",
    resourceType: "MOTI",
    global: false,
    source: {
      functionFileOffset: "0x1512a",
      callFileOffset: "0x15476",
    },
  });

  assert.equal(transaction.rollback({ reason: "test" }), true);
  // The native resource manager is world-scoped rather than event-frame
  // state. Rolling back interpreter fields must not invalidate its opaque
  // request handle; world teardown owns the corresponding clear.
  assert.equal(resources.motionRequest(1)?.handle, 1);
});

test("room composition fails closed without a motion resource adapter", async () => {
  const room = createNativeRoomScriptRuntime();
  const execute = createNativeEventOperationExecutor({
    handlers: room.semanticHandlers(),
  });
  const result = await execute(motionRequestAction(0x223c3), {
    ...room.eventContext(),
    resolveNativeStaticString: () => "M_0101A.BIN",
  });
  assert.deepEqual(result, {
    status: "stopped",
    reason: "native-motion-resource-queue-missing",
  });
});
