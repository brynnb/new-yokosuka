import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceNativeFaceEyeAngles,
  nativeFaceEyeTargetAngles,
} from "../src/NativeFaceGaze.js";

test("native FACE gaze resolves and clamps each eye's authored rotations", () => {
  const result = nativeFaceEyeTargetAngles({
    target: [1, 1, -1],
    eyeOrigin: [0, 0, 0],
    verticalLimits: { minimum: -0.1, maximum: 0.2 },
    horizontalLimits: { minimum: -0.25, maximum: 0.3 },
  });
  assert.equal(result.vertical, 0.2);
  assert.equal(result.horizontal, 0.3);

  const opposite = nativeFaceEyeTargetAngles({
    target: [1, -1, 1],
    eyeOrigin: [0, 0, 0],
    verticalLimits: { minimum: -0.1, maximum: 0.2 },
    horizontalLimits: { minimum: -0.25, maximum: 0.3 },
  });
  assert.equal(opposite.vertical, -0.1);
  assert.equal(opposite.horizontal, -0.25);
});

test("native FACE gaze reaches a fixed target in the authored tick count", () => {
  let current = { vertical: 0, horizontal: 0 };
  let ticksRemaining = 4;
  const target = { vertical: 0.2, horizontal: -0.4 };
  for (let tick = 0; tick < 4; tick += 1) {
    const next = advanceNativeFaceEyeAngles(
      current,
      target,
      ticksRemaining,
    );
    current = next;
    ticksRemaining = next.ticksRemaining;
  }
  assert.equal(ticksRemaining, 0);
  assert.ok(Math.abs(current.vertical - target.vertical) < 1e-12);
  assert.ok(Math.abs(current.horizontal - target.horizontal) < 1e-12);
});
