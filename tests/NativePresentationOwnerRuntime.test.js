import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativePresentationOwnerSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

const action = {
  kind: "engineOperation",
  semanticId: "current-presentation-owner-install",
  arguments: [{ kind: "frame-field", offset: 12 }],
};

test("installs the resolved owner after the exact primary-runtime reset", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  scene.beginPrimaryRuntimeEvent();
  scene.installCurrentPresentationOwner("MGR_");
  const context = {
    ...createNativeSceneFieldRuntimeContext(scene),
    readFrameField: offset => offset === 12 ? 0x52494b41 : undefined,
  };
  const calls = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePresentationOwnerSemanticHandlers({
      resolveCurrentPresentationOwner(value) {
        calls.push(["resolve", value]);
        return "AKIR";
      },
      installCurrentPresentationOwner(owner, detail) {
        calls.push(["install", owner, detail.notificationTag]);
        return scene.installCurrentPresentationOwner(owner);
      },
    }),
  });

  const result = await execute(action, context);
  assert.equal(result.status, "continued");
  assert.equal(result.result, 1);
  assert.equal(result.mutation.previous, "MGR_");
  assert.equal(result.mutation.owner, "AKIR");
  assert.equal(result.mutation.notificationTag, "CPCT");
  assert.deepEqual(calls, [
    ["resolve", 0x52494b41],
    ["install", "AKIR", "CPCT"],
  ]);
  assert.equal(scene.readCurrentPresentationOwner(), "AKIR");
  assert.deepEqual(scene.readPrimaryRuntimeState(), {
    available: true,
    currentEventPresent: true,
    gateByte: 0,
    stateDword1f8: 0,
    stateDword20: 2,
    statusByte1d9: 0,
    globalByteB02: 0,
  });
});

test("fails closed before mutating state when owner resolution is unavailable", async () => {
  const scene = createNativeSceneGameplayState();
  scene.initializeRoomRuntimeState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativePresentationOwnerSemanticHandlers(),
  });
  assert.deepEqual(await execute(action, {
    ...createNativeSceneFieldRuntimeContext(scene),
    readFrameField: () => 0x52494b41,
  }), {
    status: "stopped",
    reason: "current-presentation-owner-resolver-missing",
  });
  assert.equal(scene.readCurrentPresentationOwner(), null);
  assert.equal(scene.readPrimaryRuntimeState().stateDword1f8, 1);
});

test("room-script composition uses the shared presentation-owner handler", async () => {
  const { NativeRoomScriptRuntime } = await import(
    "../play/events/NativeRoomScriptRuntime.js"
  );
  const runtime = new NativeRoomScriptRuntime({
    presentationOwner: {
      resolveCurrentPresentationOwner: value => (
        value === 0x52494b41 ? "AKIR" : null
      ),
    },
  });
  runtime.activateArea("OP02");
  const result = await runtime.semanticHandlers()[
    "current-presentation-owner-install"
  ]({
    context: runtime.eventContext(),
    readArgument: () => 0x52494b41,
  });
  assert.equal(result.result, 1);
  assert.equal(runtime.sceneState.readCurrentPresentationOwner(), "AKIR");
});
