import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeCameraShakeSemanticHandlers,
  createNativeCameraShakeState,
} from "../play/events/NativeCameraShakeRuntime.js";

function action() {
  return {
    semanticId: "native-camera-shake-envelope-write",
    arguments: [{}, {}, {}],
  };
}

test("camera-shake envelope retains the exact positive-retention words", async () => {
  const state = createNativeCameraShakeState();
  const values = [0x3e99999a, 0x3dcccccd, 0x3f4ccccd];
  const result = await createNativeCameraShakeSemanticHandlers({ state })[
    "native-camera-shake-envelope-write"
  ]({ action: action(), context: {}, readArgument: index => values[index] });

  assert.equal(result.status, "continued");
  assert.deepEqual(state.read(), {
    horizontalAmplitudeWord: 0x3e99999a,
    verticalAmplitudeWord: 0x3dcccccd,
    retentionWord: 0x3f4ccccd,
  });
  assert.deepEqual(result.mutation.previous, {
    horizontalAmplitudeWord: 0,
    verticalAmplitudeWord: 0,
    retentionWord: 0x3f800000,
  });
});

test("camera-shake envelope uses the native disabled defaults", async () => {
  const state = createNativeCameraShakeState();
  state.write({
    horizontalAmplitudeWord: 0x3f000000,
    verticalAmplitudeWord: 0x3f000000,
    retentionWord: 0x3f000000,
  });
  const values = [0x7fc00000, 0xff800000, 0x80000000];
  const result = await createNativeCameraShakeSemanticHandlers({ state })[
    "native-camera-shake-envelope-write"
  ]({ action: action(), context: {}, readArgument: index => values[index] });

  assert.equal(result.status, "continued");
  assert.deepEqual(state.read(), {
    horizontalAmplitudeWord: 0,
    verticalAmplitudeWord: 0,
    retentionWord: 0x3f800000,
  });
});

test("camera-shake handler fails closed without state", async () => {
  const result = await createNativeCameraShakeSemanticHandlers()[
    "native-camera-shake-envelope-write"
  ]({ action: action(), context: {}, readArgument: () => 0 });
  assert.deepEqual(result, {
    status: "stopped",
    reason: "native-camera-shake-state-missing",
  });
});
