import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeFaceClipControlSemanticHandlers,
  createNativeFaceClipControlState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";

function action(argument1, argument2, argument3) {
  return {
    semanticId: "actor-face-clip-control-write",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: argument1 },
      { kind: "constant", value: argument2 },
      { kind: "constant", value: argument3 },
    ],
  };
}

function executor() {
  return createNativeEventOperationExecutor({
    handlers: createNativeFaceClipControlSemanticHandlers(),
  });
}

test("operation 0x0113 writes exact FACE and CLIP fields", async () => {
  const state = createNativeFaceClipControlState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    clipAvailable: true,
  });
  const result = await executor()(action(7, 5, 10), {
    planActorFaceClipControl: detail => state.planControl(detail),
    commitActorFaceClipControl: plan => state.commitControl(plan),
  });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readActor("AKIR"), {
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    clipAvailable: true,
    faceStateByte47: 0,
    faceActivityByte45: 1,
    faceScaledWord2c: 42,
    faceMinimumWord2e: 10,
    faceConditionalWord4a: 10,
    clipModeByte10: 2,
    clipMinimumWord16: 10,
    clipParameterWord1c: 5,
  });
});

test("operation 0x0113 clamps signed minimum and preserves -1 selector", async () => {
  const state = createNativeFaceClipControlState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    clipAvailable: true,
    faceStateByte47: 0xff,
  });
  await executor()(action(0x40000001, 0xffffffff, 0xffff), {
    planActorFaceClipControl: detail => state.planControl(detail),
    commitActorFaceClipControl: plan => state.commitControl(plan),
  });
  const actor = state.readActor("AKIR");
  assert.equal(actor.faceScaledWord2c, 6);
  assert.equal(actor.faceMinimumWord2e, 1);
  assert.equal(actor.faceConditionalWord4a, 1);
  assert.equal(actor.clipModeByte10, 1);
  assert.equal(actor.clipMinimumWord16, 1);
  assert.equal(actor.clipParameterWord1c, 0xffff);
});

test("operation 0x0113 respects FACE state and activity guards", async () => {
  const state = createNativeFaceClipControlState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    clipAvailable: true,
    faceStateByte47: 2,
    faceActivityByte45: 0,
    faceConditionalWord4a: 99,
  });
  await executor()(action(2, 0, 30), {
    planActorFaceClipControl: detail => state.planControl(detail),
    commitActorFaceClipControl: plan => state.commitControl(plan),
  });
  let actor = state.readActor("AKIR");
  assert.equal(actor.faceActivityByte45, 0);
  assert.equal(actor.faceConditionalWord4a, 99);

  state.configureActor({
    ...actor,
    actorTag: "AKIR",
    faceStateByte47: 1,
    faceActivityByte45: 1,
  });
  await executor()(action(2, 0, 40), {
    planActorFaceClipControl: detail => state.planControl(detail),
    commitActorFaceClipControl: plan => state.commitControl(plan),
  });
  actor = state.readActor("AKIR");
  assert.equal(actor.faceActivityByte45, 1);
  assert.equal(actor.faceConditionalWord4a, 99);
  assert.equal(actor.faceMinimumWord2e, 40);
  assert.equal(actor.clipMinimumWord16, 40);
});

test("operation 0x0113 missing native records are exact no-ops", async () => {
  for (const missing of [
    "actorAvailable",
    "momtAvailable",
    "faceAvailable",
    "clipAvailable",
  ]) {
    const state = createNativeFaceClipControlState();
    state.configureActor({
      actorTag: "AKIR",
      actorAvailable: true,
      momtAvailable: true,
      faceAvailable: true,
      clipAvailable: true,
      [missing]: false,
    });
    const before = state.readActor("AKIR");
    const result = await executor()(action(1, 2, 3), {
      planActorFaceClipControl: detail => state.planControl(detail),
      commitActorFaceClipControl: plan => state.commitControl(plan),
    });
    assert.equal(result.status, "continued");
    assert.equal(result.mutation.applied, false);
    assert.deepEqual(state.readActor("AKIR"), before);
  }
});

test("operation 0x0113 integrates through scene state and rejects stale plans", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureActorFaceClipControl({
    actorTag: "AKIR",
    actorAvailable: true,
    momtAvailable: true,
    faceAvailable: true,
    clipAvailable: true,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);
  assert.equal((await executor()(action(3, 4, 5), context)).status, "continued");
  assert.equal(scene.readActorFaceClipControl("AKIR").faceScaledWord2c, 18);

  const plan = scene.planActorFaceClipControl({
    actorTag: "AKIR",
    scaledSourceWord: 1,
    clipParameterWord: 0,
    minimumWord: 1,
  });
  await executor()(action(2, 0, 1), context);
  assert.throws(
    () => scene.commitActorFaceClipControl(plan),
    /changed before commit/,
  );
});

test("operation 0x0113 stops when modeled state is unavailable", async () => {
  const state = createNativeFaceClipControlState();
  const context = {
    planActorFaceClipControl: detail => state.planControl(detail),
    commitActorFaceClipControl: plan => state.commitControl(plan),
  };
  assert.equal(
    (await executor()(action(1, 2, 3), context)).reason,
    "actor-face-clip-control-state-unavailable",
  );
  assert.equal(
    (await executor()(action(1, 2, 3), {})).reason,
    "actor-face-clip-control-state-missing",
  );
});
