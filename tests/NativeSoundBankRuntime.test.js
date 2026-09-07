import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventOperationExecutor,
  createNativeSoundBankSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";

const strings = new Map([
  [0x1000, "bgm013.snd"],
  [0x1004, "FREE"],
  [0x1008, "a1_senfk.snd"],
  [0x100c, "battle_1.snd"],
]);

function action(arguments_) {
  return {
    semanticId: "native-sound-bank-slot-reconcile",
    callFileOffset: "0x84bcc",
    arguments: arguments_.map(value => ({
      kind: value === 0 ? "constant" : "static-pointer",
      value,
    })),
  };
}

test("operation 0x00f3 preserves, releases, and installs exact sound slots", async () => {
  const scene = createNativeSceneGameplayState();
  scene.soundBankSlots[0] = "retained.snd";
  scene.soundBankSlots[3] = "old.snd";
  const context = {
    ...createNativeSceneFieldRuntimeContext(scene),
    resolveNativeStaticString: pointer => strings.get(pointer) ?? null,
  };
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSoundBankSemanticHandlers(),
  });
  const result = await execute(action([
    0, 0, 0x1000, 0x1004, 0x1008, 0x100c, 0x1004, 0x1004,
  ]), context);
  assert.equal(result.status, "continued");
  assert.deepEqual(scene.readNativeSoundBankSlots(), [
    "retained.snd",
    null,
    "bgm013.snd",
    null,
    "a1_senfk.snd",
    "battle_1.snd",
    null,
    null,
  ]);
});

test("operation 0x00f3 stops on unresolved strings without mutation", async () => {
  const scene = createNativeSceneGameplayState();
  const context = {
    ...createNativeSceneFieldRuntimeContext(scene),
    resolveNativeStaticString: () => null,
  };
  const execute = createNativeEventOperationExecutor({
    handlers: createNativeSoundBankSemanticHandlers(),
  });
  const result = await execute(action([
    0, 0, 0x9999, 0, 0, 0, 0, 0,
  ]), context);
  assert.match(result.reason, /native-sound-bank-string-unavailable/);
  assert.deepEqual(scene.readNativeSoundBankSlots(), Array(8).fill(null));
});
