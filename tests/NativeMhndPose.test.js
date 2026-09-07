import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeMhndPoseState,
  initializeNativeMhndPoseState,
  nativeMhndTargetWords,
  resetNativeMhndPoseState,
  startNativeMhndPoseTransition,
  stepNativeMhndPoseTransition,
} from "../src/NativeMhndPose.js";

test("native MHND row zero supplies the authored relaxed finger curl", () => {
  assert.deepEqual(
    nativeMhndTargetWords(0, 0),
    [0, 0, 0, 0, 0x31c7, 0, 0x31c7, 0x31c7, 0, 0x31c7],
  );
  assert.deepEqual(
    nativeMhndTargetWords(0, 1),
    [0, 0, 0, 0, 0xce39, 0, 0xce39, 0xce39, 0, 0xce39],
  );
});

test("native MHND transitions use signed truncating deltas and two ticks per frame", () => {
  const state = createNativeMhndPoseState();
  const source = [0, 0, 0, 0, 0x0200, 0, 0x0100, 0x0100, 0, 0x0100];
  assert.equal(initializeNativeMhndPoseState(state, source), true);
  assert.deepEqual(Array.from(state.current), source);
  const target = nativeMhndTargetWords(0, 0);
  assert.equal(startNativeMhndPoseTransition(state, target, 16), true);
  assert.equal(stepNativeMhndPoseTransition(state), true);
  assert.equal(state.remainingNativeTicks, 14);
  assert.equal(
    state.current[4],
    source[4] + Math.trunc((0x31c7 - source[4]) / 16) * 2,
  );
  for (let frame = 1; frame < 8; frame += 1) {
    assert.equal(stepNativeMhndPoseTransition(state), true);
  }
  assert.deepEqual(Array.from(state.current), target);
  assert.equal(state.active, false);
  assert.equal(state.engaged, true);

  resetNativeMhndPoseState(state);
  assert.deepEqual(Array.from(state.current), Array(10).fill(0));
  assert.equal(state.engaged, false);
});
