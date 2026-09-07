import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeOperation019fSemanticHandlers,
  createNativeOperation019fState,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeSceneFieldRuntimeContext,
} from "../play/events/NativeSceneRuntimeContext.js";

function action(actorTag, mode) {
  const tagWord = (
    actorTag.charCodeAt(0)
    | actorTag.charCodeAt(1) << 8
    | actorTag.charCodeAt(2) << 16
    | actorTag.charCodeAt(3) << 24
  ) >>> 0;
  return {
    semanticId: "native-operation-019f-momt-flag-24-control",
    callFileOffset: "0x240",
    arguments: [
      { kind: "constant", value: tagWord, ascii: actorTag },
      { kind: "constant", value: mode },
    ],
  };
}

function executor(removeActorFromSceneRegistry) {
  return createNativeEventOperationExecutor({
    handlers: createNativeOperation019fSemanticHandlers({
      removeActorFromSceneRegistry,
    }),
  });
}

test("operation 0x019f changes only MOMT controller flag bit 24", async () => {
  const state = createNativeOperation019fState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    controllerFlags18: 0x80000021,
  });
  let result = await executor()(action("AKIR", 1), {
    nativeOperation019fState: state,
  });
  assert.equal(result.mutation.controllerFlags18, 0x81000021);
  assert.equal(state.readActor("AKIR").controllerFlags18, 0x81000021);

  result = await executor()(action("AKIR", 0), {
    nativeOperation019fState: state,
  });
  assert.equal(result.mutation.controllerFlags18, 0x80000021);
  assert.equal(state.readActor("AKIR").controllerFlags18, 0x80000021);
});

test("operation 0x019f preserves the missing-actor no-op", async () => {
  const state = createNativeOperation019fState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: false,
    controllerAvailable: false,
  });
  assert.deepEqual(await executor()(action("AKIR", 1), {
    nativeOperation019fState: state,
  }), {
    status: "continued",
    mutation: { applied: false, reason: "actor-unavailable" },
  });
});

test("operation 0x019f preserves the no-controller unlink boundary", async () => {
  const state = createNativeOperation019fState();
  state.configureActor({
    actorTag: "SYZU",
    actorAvailable: true,
    controllerAvailable: false,
  });
  const removals = [];
  const result = await executor(detail => removals.push(detail))(
    action("SYZU", 0),
    {
      nativeOperation019fState: state,
      location: { functionId: "0x200" },
    },
  );
  assert.equal(result.mutation.removeFromSceneRegistry, true);
  assert.deepEqual(removals, [{
    actorTag: "SYZU",
    source: {
      functionFileOffset: "0x200",
      callFileOffset: "0x240",
    },
  }]);
});

test("operation 0x019f fails closed before unavailable prerequisites", async () => {
  assert.equal(
    (await executor()(action("AKIR", 1), {})).reason,
    "native-operation-019f-state-unavailable",
  );
  const state = createNativeOperation019fState();
  assert.equal(
    (await executor()(action("AKIR", 1), {
      nativeOperation019fState: state,
    })).reason,
    "native-operation-019f-actor-state-unavailable",
  );
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: false,
  });
  assert.equal(
    (await executor()(action("AKIR", 1), {
      nativeOperation019fState: state,
    })).reason,
    "actor-scene-registry-remove-adapter-missing",
  );
  assert.equal(
    (await executor()(action("AKIR", 2), {
      nativeOperation019fState: state,
    })).reason,
    "native-operation-019f-mode-unproved",
  );
});

test("operation 0x019f rejects stale plans", () => {
  const state = createNativeOperation019fState();
  state.configureActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
  });
  const plan = state.planFlagWrite({ actorTag: "AKIR", enabled: true });
  state.configureActor({
    actorTag: "SYZU",
    actorAvailable: false,
    controllerAvailable: false,
  });
  assert.throws(() => state.commit(plan), /changed before commit/);
});

test("operation 0x019f state is exposed through scene runtime context", () => {
  const scene = createNativeSceneGameplayState();
  scene.configureNativeOperation019fActor({
    actorTag: "AKIR",
    actorAvailable: true,
    controllerAvailable: true,
    controllerFlags18: 0x10,
  });
  const context = createNativeSceneFieldRuntimeContext(scene);
  assert.equal(context.nativeOperation019fState, scene.nativeOperation019fState);
  assert.equal(
    scene.readNativeOperation019fActor("AKIR").controllerFlags18,
    0x10,
  );
});
