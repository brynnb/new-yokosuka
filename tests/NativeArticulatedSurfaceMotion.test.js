import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  advanceNativeArticulatedSurfaceOscillator,
  NativeArticulatedSurfaceMotion,
  quantizeNativeArticulatedSurfaceDegrees,
} from "../play/characters/NativeArticulatedSurfaceMotion.js";

const PROFILE = Object.freeze({
  angularAmplitudeDegrees: 1.5,
  angularApproachDegrees: 0.2,
  primaryPhaseStepDegrees: 10,
  secondaryPhaseStepDegrees: -15,
  primaryBiasDegrees: -1.5,
  secondaryBiasDegrees: -1.5,
  fixedTurnUnitsPer45Degrees: 8192,
});

test("native articulated-surface oscillator approaches captured amplitude", () => {
  let state = {
    amplitude: 0,
    primaryPhase: 0,
    secondaryPhase: 0,
  };
  for (let frame = 0; frame < 20; frame += 1) {
    state = advanceNativeArticulatedSurfaceOscillator(state, PROFILE);
    assert.ok(state.amplitude <= 1.5);
    assert.ok(state.primaryDegrees >= -3 && state.primaryDegrees <= 0);
    assert.ok(state.secondaryDegrees >= -3 && state.secondaryDegrees <= 0);
  }
  assert.equal(state.amplitude, 1.5);
  assert.equal(state.primaryPhase, 200);
  assert.equal(state.secondaryPhase, 60);
});

test("native articulated-surface fixed-turn conversion matches captured packing", () => {
  assert.equal(
    quantizeNativeArticulatedSurfaceDegrees(-2.8619384765625, 8192),
    -2.8619384765625,
  );
  assert.equal(
    quantizeNativeArticulatedSurfaceDegrees(-2.70263671875, 8192),
    -2.70263671875,
  );
});

test("native articulated surfaces retain authored lengths without endpoint drift", () => {
  const nodes = [0x100, 0x140, 0x180, 0x1c0].map(addr => ({ addr }));
  const solver = new NativeArticulatedSurfaceMotion(nodes, PROFILE);
  const rest = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(0, -0.06, 0),
    new BABYLON.Vector3(0, -0.11, -0.03),
    new BABYLON.Vector3(0, -0.15, -0.06),
    new BABYLON.Vector3(0, -0.18, -0.09),
  ];
  const expectedLengths = rest.slice(1).map(
    (point, index) => BABYLON.Vector3.Distance(rest[index], point),
  );
  let resolved = null;
  for (let frame = 0; frame < 60; frame += 1) resolved = solver.update(rest);
  assert.deepEqual(resolved[0].asArray(), rest[0].asArray());
  for (let index = 0; index < expectedLengths.length; index += 1) {
    assert.ok(Math.abs(
      BABYLON.Vector3.Distance(resolved[index], resolved[index + 1])
        - expectedLengths[index]
    ) < 1e-7);
  }
  assert.ok(BABYLON.Vector3.Distance(resolved.at(-1), rest.at(-1)) > 1e-4);
  assert.ok(BABYLON.Vector3.Distance(resolved.at(-1), rest.at(-1)) < 0.03);
});
