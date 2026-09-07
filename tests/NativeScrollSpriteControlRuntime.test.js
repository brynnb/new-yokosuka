import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeScrollSpriteControlSemanticHandlers,
  createNativeScrollSpriteControlState,
} from "../play/events/NativeEventOperationRuntime.js";


function executeFor(state) {
  return createNativeEventOperationExecutor({
    handlers: createNativeScrollSpriteControlSemanticHandlers(),
  });
}


test("operation 0x00b4 mode two releases only active SCRL slots", async () => {
  const state = createNativeScrollSpriteControlState();
  const execute = executeFor(state);
  const action = {
    semanticId: "scroll-sprite-slot-release",
    arguments: [
      { kind: "constant", value: 2 },
      { kind: "constant", value: 0 },
      { kind: "constant", value: 0 },
    ],
  };
  const inactive = await execute(action, { nativeScrollSpriteControlState: state });
  assert.equal(inactive.mutation.nativeNoOp, true);
  state.configureSlot(0, { active: true, transition: { duration: 8 } });
  const active = await execute(action, { nativeScrollSpriteControlState: state });
  assert.equal(active.mutation.applied, true);
  assert.deepEqual(state.readSlot(0), { active: false, transition: null, resource: null });
});

test("operation 0x00b4 modes zero and one allocate exact package resources", async () => {
  const state = createNativeScrollSpriteControlState();
  const queued = [];
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeScrollSpriteControlSemanticHandlers({
      queueNativeScrollSpriteResource: async detail => {
        queued.push(detail);
        return { resource: Object.freeze({ kind: "test-scroll", ...detail }) };
      },
    }),
  });
  const strings = new Map([[100, "scroll"], [200, "SCROLL25.SPR"]]);
  for (const [mode, arguments_, expectedSlot] of [
    [0, [{ kind: "constant", value: 0 }, { kind: "static-pointer", value: 100 }, { kind: "static-pointer", value: 200 }], 0],
    [1, [{ kind: "constant", value: 1 }, { kind: "static-pointer", value: 100 }, { kind: "static-pointer", value: 200 }, { kind: "constant", value: 2 }], 2],
  ]) {
    const result = await execute({
      semanticId: "scroll-sprite-resource-allocation",
      callFileOffset: `mode-${mode}`,
      arguments: arguments_,
    }, {
      nativeScrollSpriteControlState: state,
      resolveNativeStaticString: pointer => strings.get(pointer) ?? null,
    });
    assert.equal(result.status, "continued");
    assert.equal(result.mutation.slotIndex, expectedSlot);
    assert.equal(state.readSlot(expectedSlot).active, true);
  }
  assert.deepEqual(queued.map(value => value.slotIndex), [0, 2]);
});


test("operation 0x00b4 mode three retains the exact transition request", async () => {
  const state = createNativeScrollSpriteControlState();
  state.configureSlot(1, { active: true });
  const result = await executeFor(state)({
    semanticId: "scroll-sprite-transition-request",
    arguments: [
      { kind: "constant", value: 3 },
      { kind: "constant", value: 0 },
      { kind: "constant", value: 1 },
      { kind: "constant", value: 560 },
    ],
  }, { nativeScrollSpriteControlState: state });
  assert.equal(result.status, "continued");
  assert.deepEqual(state.readSlot(1), {
    active: true,
    transition: { controlMode: 0, duration: 560, requestId: 1 },
    resource: null,
  });
});


test("operation 0x00b4 modes four and five sign-extend native words", async () => {
  const state = createNativeScrollSpriteControlState();
  const execute = executeFor(state);
  for (const [mode, value] of [[4, 0xfffffef0], [5, 0x58e3]]) {
    const result = await execute({
      semanticId: "scroll-sprite-global-signed-word-write",
      arguments: [
        { kind: "constant", value: mode },
        { kind: "constant", value },
      ],
    }, { nativeScrollSpriteControlState: state });
    assert.equal(result.status, "continued");
  }
  assert.deepEqual(state.readGlobals(), {
    transitionLocked: false,
    signedWord58: -272,
    signedWord5c: 22755,
  });
});
