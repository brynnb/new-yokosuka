import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  resolveShenmue2NativeMotionId,
  Shenmue2MotLoader,
} from "../src/Shenmue2MotLoader.js";

const fixture = JSON.parse(fs.readFileSync(new URL(
  "./fixtures/shenmue2-animation/f07e-rrn_l-native.json",
  import.meta.url,
), "utf8"));

test("native S2 layer transitions bake target curve affines into endpoints", () => {
  const transitions = fixture.frames.flatMap((frame) => (
    frame.nativeSolverInputs.armSolverStates
      .flatMap((state) => state.layerTransition ? [state.layerTransition] : [])
  ));
  assert.ok(transitions.length > 0, "RRN_L must retain its native arm transition");

  let observedNonIdentityAffine = false;
  for (const transition of transitions) {
    const resolved = resolveShenmue2NativeMotionId(transition.targetMotionId);
    assert.ok(resolved, `unresolved target motion ${transition.targetMotionId}`);
    const bankPath = fixture.motionBanks[resolved.bank];
    const sequence = Shenmue2MotLoader.parse(
      fs.readFileSync(new URL(`../${bankPath}`, import.meta.url)),
      { sequenceIndices: [resolved.sequenceIndex] },
    ).sequences[0];
    assert.equal(sequence.valid, true);
    const target = Shenmue2MotLoader.evaluateSequence(sequence, 0);

    for (const descriptor of transition.targetCurveDescriptors) {
      const controller = Math.floor((descriptor.curveIndex - 3) / 3);
      const channel = ["rx", "ry", "rz"][(descriptor.curveIndex - 3) % 3];
      const rawTarget = target.rotations[controller][channel];
      const affineTarget = rawTarget * descriptor.scale + descriptor.base;
      assert.ok(Math.abs(descriptor.endValue - affineTarget) < 1e-6);
      if (
        Math.abs(descriptor.scale - 1) > 1e-6
        || Math.abs(descriptor.base) > 1e-6
      ) {
        observedNonIdentityAffine = true;
        assert.ok(
          Math.abs(descriptor.endValue - rawTarget) > 1e-6,
          "the regression evidence must distinguish native affine output from raw MOT",
        );
      }
    }
  }
  assert.equal(observedNonIdentityAffine, true);
});
