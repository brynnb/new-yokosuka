import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeActorControllerWordSemanticHandlers,
} from "../play/events/NativeActorControllerWordRuntime.js";
import {
  createNativeEventOperationExecutor,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

function action(actor, value) {
  return {
    kind: "engineOperation",
    semanticId: "actor-controller-word-7c-write",
    callFileOffset: "0x220",
    arguments: [
      {
        kind: "constant",
        value: (
          actor.charCodeAt(0)
          | (actor.charCodeAt(1) << 8)
          | (actor.charCodeAt(2) << 16)
          | (actor.charCodeAt(3) << 24)
        ) >>> 0,
        ascii: actor,
      },
      { kind: "constant", value },
    ],
  };
}

function modeAction(actor, mode) {
  return {
    ...action(actor, mode),
    semanticId: "actor-motm-mode-control",
  };
}

function runtime(removeActorFromSceneRegistry) {
  const state = createNativeSceneGameplayState();
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorControllerWordSemanticHandlers({
      removeActorFromSceneRegistry,
    }),
  });
  const context = {
    ...createNativeSceneFieldRuntimeContext(state),
    location: { functionId: "0x100" },
  };
  return { state, execute, context };
}

test("writes only the low word of an available actor MOTM controller", async () => {
  const { state, execute, context } = runtime();
  state.configureActorControllerWordState({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    controllerWord7c: 0xabcd,
  });
  assert.deepEqual(await execute(action("AKIR", 0x12345678), context), {
    status: "continued",
    mutation: {
      applied: true,
      actorTag: "AKIR",
      value: 0x5678,
    },
  });
  assert.deepEqual(state.readActorControllerWordState("AKIR"), {
    actorAvailable: true,
    controllerAvailable: true,
    controllerWord7c: 0x5678,
  });
});

test("a missing actor preserves the native no-op", async () => {
  const { state, execute, context } = runtime();
  state.configureActorControllerWordState({
    actorTag: "AKIR",
    actorAvailable: false,
    controllerAvailable: false,
  });
  assert.deepEqual(await execute(action("AKIR", 20), context), {
    status: "continued",
    mutation: {
      applied: false,
      reason: "actor-unavailable",
    },
  });
});

test("an actor without MOTM uses the exact scene-registry removal adapter", async () => {
  const removals = [];
  const { state, execute, context } = runtime(
    detail => removals.push(detail),
  );
  state.configureActorControllerWordState({
    actorTag: "FUKU",
    actorAvailable: true,
    controllerAvailable: false,
  });
  assert.deepEqual(await execute(action("FUKU", 30), context), {
    status: "continued",
    mutation: {
      applied: false,
      actorTag: "FUKU",
      removeFromSceneRegistry: true,
    },
  });
  assert.deepEqual(removals, [{
    actorTag: "FUKU",
    source: {
      functionFileOffset: "0x100",
      callFileOffset: "0x220",
    },
  }]);
});

test("unavailable state and missing removal adapters stop explicitly", async () => {
  const unavailable = runtime();
  assert.deepEqual(await unavailable.execute(
    action("AKIR", 5),
    unavailable.context,
  ), {
    status: "stopped",
    reason: "actor-controller-word-state-unavailable",
  });

  const missingAdapter = runtime();
  missingAdapter.state.configureActorControllerWordState({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: false,
  });
  assert.deepEqual(await missingAdapter.execute(
    action("AKIR", 5),
    missingAdapter.context,
  ), {
    status: "stopped",
    reason: "actor-scene-registry-remove-adapter-missing",
  });
});

test("the four authored MOTM modes set only their exact controller fields", async () => {
  const expectedDword = [3, 7, 0, 5];
  for (let mode = 0; mode <= 3; mode += 1) {
    const { state, execute, context } = runtime();
    state.configureActorControllerWordState({
      actorTag: "AKIR",
      actorAvailable: true,
      controllerAvailable: true,
      controllerFlag4000: false,
      controllerDword1cc: 99,
      controllerWord86: 11,
      controllerWord90: 12,
      controllerWord9a: 13,
    });
    assert.deepEqual(await execute(modeAction("AKIR", mode), context), {
      status: "continued",
      mutation: {
        applied: true,
        actorTag: "AKIR",
        mode,
        controllerFlag4000: true,
        controllerDword1cc: expectedDword[mode],
      },
    });
    assert.deepEqual(state.readActorControllerWordState("AKIR"), {
      actorAvailable: true,
      controllerAvailable: true,
      controllerFlag4000: true,
      controllerDword1cc: expectedDword[mode],
      controllerWord86: 11,
      controllerWord90: 12,
      controllerWord9a: 13,
    });
  }
});

test("the authored minus-one mode clears the complete proven controller set", async () => {
  const { state, execute, context } = runtime();
  state.configureActorControllerWordState({
    actorTag: "TONY",
    actorAvailable: true,
    controllerAvailable: true,
    controllerFlag4000: true,
    controllerDword1cc: 7,
    controllerWord86: 11,
    controllerWord90: 12,
    controllerWord9a: 13,
  });
  const result = await execute(modeAction("TONY", 0xffffffff), context);
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readActorControllerWordState("TONY"), {
    actorAvailable: true,
    controllerAvailable: true,
    controllerFlag4000: false,
    controllerDword1cc: 0,
    controllerWord86: 0,
    controllerWord90: 0,
    controllerWord9a: 0,
  });
});

test("MOTM mode control resolves exact actor state and rejects unproven modes", async () => {
  const state = createNativeSceneGameplayState();
  const resolutions = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeActorControllerWordSemanticHandlers({
      resolveActorControllerState: detail => {
        resolutions.push(detail);
        return { actorAvailable: true, controllerAvailable: true };
      },
    }),
  });
  const context = createNativeSceneFieldRuntimeContext(state);
  assert.equal((await execute(modeAction("SMTH", 3), context)).status, "continued");
  assert.deepEqual(resolutions, [{ actorTag: "SMTH", mode: 3 }]);
  assert.equal(
    state.readActorControllerWordState("SMTH").controllerDword1cc,
    5,
  );
  assert.deepEqual(await execute(modeAction("SMTH", 4), context), {
    status: "stopped",
    reason: "actor-controller-mode-unproven",
  });
});
