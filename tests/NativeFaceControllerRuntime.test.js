import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeFaceControllerSemanticHandlers,
  createNativeFaceControllerState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRoomScriptRuntime,
} from "../play/events/NativeRoomScriptRuntime.js";

const action = {
  kind: "engineOperation",
  operationId: 0x0094,
  operationHex: "0x0094",
  semanticId: "resolved-face-controller-setup",
  arguments: [
    { kind: "constant", value: 0x464e4953, ascii: "SINF" },
    { kind: "constant", value: 2 },
    { kind: "constant", value: 12 },
    { kind: "constant", value: 4 },
  ],
};

test("operation 0x0094 resets the exact FACE +0x44 controller fields", async () => {
  const state = createNativeFaceControllerState();
  state.configureActor({
    actorTag: "SINF",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    activeByte01: 9,
    elapsedWord04: 42,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFaceControllerSemanticHandlers({
      randomFloat: () => 3 / 0x8000,
    }),
  });
  const result = await execute(action, {
    nativeFaceControllerState: state,
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readActor("SINF"), {
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    modeByte00: 2,
    activeByte01: 1,
    parameterByte03: 4,
    elapsedWord04: 0,
    intervalWord06: 12,
    randomizedTimerWord08: 90,
  });
});

test("FACE controller mode zero forces the native three-frame interval", async () => {
  const state = createNativeFaceControllerState();
  state.configureActor({
    actorTag: "SINF",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeFaceControllerSemanticHandlers({
      randomFloat: () => 0,
    }),
  });
  await execute({
    ...action,
    arguments: [action.arguments[0], {
      kind: "constant", value: 0,
    }, {
      kind: "constant", value: 30000,
    }, {
      kind: "constant", value: 0,
    }],
  }, { nativeFaceControllerState: state });
  assert.equal(state.readActor("SINF").intervalWord06, 3);
  assert.equal(state.readActor("SINF").randomizedTimerWord08, 60);
});

test("missing native MOMT or FACE records preserve the native no-op", async () => {
  const state = createNativeFaceControllerState();
  state.configureActor({
    actorTag: "SINF",
    actorAvailable: true,
    momtAvailable: false,
    faceAvailable: false,
  });
  const result = await createNativeEventOperationExecutor({
    handlers: createNativeFaceControllerSemanticHandlers(),
  })(action, { nativeFaceControllerState: state });
  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation, {
    applied: false,
    nativeNoOp: true,
    reason: "momt-record-missing",
    actorTag: "SINF",
  });
});

test("room runtime composes FACE controller and TMNM operation families", () => {
  const room = createNativeRoomScriptRuntime({ randomFloat: () => 0 });
  assert.equal(
    typeof room.semanticHandlers()["resolved-face-controller-setup"],
    "function",
  );
  assert.equal(
    typeof room.semanticHandlers()["resolved-object-tmnm-parameter-write"],
    "function",
  );
});
