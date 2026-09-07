import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorMhndSemanticHandlers,
  createNativeActorMhndState,
} from "../play/events/NativeActorMhndRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";


function action(channel, targetIndex, duration) {
  return {
    kind: "engineOperation",
    operationId: 0x0081,
    operationHex: "0x0081",
    semanticId: "actor-mhnd-controller-request",
    adapterStatus: "proven",
    arguments: [
      { kind: "constant", value: 0x52494b41, ascii: "AKIR" },
      { kind: "constant", value: channel >>> 0 },
      { kind: "constant", value: targetIndex >>> 0 },
      { kind: "constant", value: duration >>> 0 },
    ],
  };
}

function executeFor(state) {
  return createNativeEventOperationExecutor({
    handlers: createNativeActorMhndSemanticHandlers(),
  });
}

function zeroSource(nodePointer) {
  return {
    nodePointer,
    words: Array(10).fill(0),
  };
}

test("operation 0x0081 -1 initializes both exact MHND schedulers", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    allocationAvailable: true,
  });
  const result = await executeFor(state)(action(-1, 0, 0), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });

  assert.equal(result.status, "continued");
  assert.equal(result.mutation.path, "reset-minus-one");
  const actor = state.readActor("AKIR");
  assert.equal(actor.record.allocatedByRuntime, true);
  assert.deepEqual(actor.record.primaryScheduler, {
    state: 14,
    timingPointer12: 0x0c288380,
    timingPointer16: 0x0c288380,
  });
  assert.deepEqual(
    actor.record.secondaryScheduler,
    actor.record.primaryScheduler,
  );
});

test("timed channel zero copies the exact target row and signed deltas", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    recordAvailable: true,
    sources: [zeroSource(0x12345678)],
  });
  const result = await executeFor(state)(action(0, 0, 16), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.configuredSubcontrollers, [0]);
  const record = state.readActor("AKIR").record;
  assert.equal(record.activationRequested, true);
  assert.equal(record.primary.nodePointer, 0x12345678);
  assert.equal(record.primary.channel, 0);
  assert.equal(record.primary.targetIndex, 0);
  assert.equal(record.primary.duration, 16);
  assert.deepEqual(record.primary.targetWords, [
    0, 0, 0, 0, 0x31c7, 0, 0x31c7, 0x31c7, 0, 0x31c7,
  ]);
  assert.deepEqual(record.primary.deltaWords, [
    0, 0, 0, 0, 0, 0, 0, 0,
    0x31c, 0x31c,
    0, 0,
    0x31c, 0x31c,
    0x31c, 0x31c,
    0, 0,
    0x31c, 0x31c,
  ]);
});

test("timed channel two configures both native subcontrollers", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    allocationAvailable: true,
    sources: [zeroSource(0x1000), zeroSource(0x2000)],
  });
  const result = await executeFor(state)(action(2, 0, 16), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });

  assert.equal(result.status, "continued");
  assert.deepEqual(result.mutation.configuredSubcontrollers, [0, 1]);
  const record = state.readActor("AKIR").record;
  assert.equal(record.primary.channel, 2);
  assert.equal(record.secondary.channel, 2);
  assert.deepEqual(record.secondary.targetWords, [
    0, 0, 0, 0, 0xce39, 0,
    0xce39, 0xce39, 0, 0xce39,
  ]);
  assert.equal(record.secondary.deltaWords[8], 0xfffffce4);
});

test("native missing actor and controller paths remain exact no-ops", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: false,
  });
  const execute = executeFor(state);
  let result = await execute(action(-1, 0, 0), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.reason, "actor-missing");

  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: false,
    recordAvailable: true,
  });
  result = await execute(action(0, 3, 16), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });
  assert.equal(result.status, "continued");
  assert.equal(result.mutation.reason, "actor-mhnd-controller-missing");
  const record = state.readActor("AKIR").record;
  assert.equal(record.primaryTargetIndex, 3);
  assert.equal(record.primaryScheduler.state, 0);
});

test("unrecovered immediate route stops before changing state", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    recordAvailable: true,
    sources: [zeroSource(0x1000)],
  });
  const before = state.readActor("AKIR");
  const result = await executeFor(state)(action(0, 0, 1), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });

  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "actor-mhnd-immediate-route-required");
  assert.deepEqual(state.readActor("AKIR"), before);
});

test("missing runtime source snapshot stops without partial mutation", async () => {
  const state = createNativeActorMhndState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    recordAvailable: true,
  });
  const before = state.readActor("AKIR");
  const result = await executeFor(state)(action(0, 0, 16), {
    applyActorMhndControllerRequest: detail => state.applyRequest(detail),
  });

  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "actor-mhnd-source-snapshot-unavailable");
  assert.deepEqual(state.readActor("AKIR"), before);
});

test("scene gameplay context exposes the exact MHND adapter", async () => {
  const scene = createNativeSceneGameplayState();
  scene.configureActorMhndState({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    allocationAvailable: true,
  });
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorMhndSemanticHandlers(),
  });
  const result = await execute(
    action(-1, 0, 0),
    createNativeSceneFieldRuntimeContext(scene),
  );

  assert.equal(result.status, "continued");
  assert.equal(
    scene.readActorMhndState("AKIR").record.primaryScheduler.state,
    14,
  );
});
