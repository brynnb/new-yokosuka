import assert from "node:assert/strict";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import {
  advanceNativeArticulatedSurfaceOscillator,
  NativeArticulatedSurfaceMotion,
  quantizeNativeArticulatedSurfaceDegrees,
} from "../play/characters/NativeArticulatedSurfaceMotion.js";
import { NATIVE_CONTROLLED_SURFACE_PROFILE } from "../play/data/native-articulated-surface.web.js";
import { NativeSecondaryMotionControlState } from "../play/events/NativeSecondaryMotionControlRuntime.js";
import { rowIdentity, rowTranslation } from "../src/Mt5Transform.js";

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

test("scripted surfaces taper native shortening without scaling the arm or opposite channel", () => {
  const nodes = [{ addr: 1, parentAddr: 0 }, { addr: 2, parentAddr: 1 }, { addr: 3, parentAddr: 2 }];
  const base = new Map([[0, rowIdentity()], [1, rowIdentity()],
    [2, rowTranslation(0, -1, 0)], [3, rowTranslation(0, -2, 0)]]);
  const solver = new NativeArticulatedSurfaceMotion(nodes, NATIVE_CONTROLLED_SURFACE_PROFILE);
  const controls = new NativeSecondaryMotionControlState();
  const resolved = new Map(base);
  assert.equal(solver.resolveControlledMatrices(base, resolved, controls, 0), false);
  controls.writeGlobalFloat(30, 0x41e80000);
  assert.equal(solver.resolveControlledMatrices(base, resolved, controls, 0), false,
    "axial rotation alone does not select the native forced branch");
  controls.clear();
  controls.writeGlobalFloat(0, 0x3e6b851f); // Original callback's 0.23f.
  assert.equal(solver.resolveControlledMatrices(base, resolved, controls, 1), false);
  assert.equal(solver.resolveControlledMatrices(base, resolved, controls, 0), true);
  let cumulative = 0.23000000417232513;
  for (const node of nodes) {
    assert.ok(Math.abs(resolved.get(node.addr)[5] - cumulative) < 1e-10);
    cumulative = NATIVE_CONTROLLED_SURFACE_PROFILE.childScaleBase
      + NATIVE_CONTROLLED_SURFACE_PROFILE.childScaleRetention * cumulative;
  }
  assert.deepEqual(resolved.get(0), base.get(0));
  assert.ok(Math.abs(resolved.get(2)[13] + 0.23000000417232513) < 1e-10);
  const rootScale = 0.23000000417232513;
  const nextScale = NATIVE_CONTROLLED_SURFACE_PROFILE.childScaleBase
    + NATIVE_CONTROLLED_SURFACE_PROFILE.childScaleRetention * rootScale;
  assert.ok(Math.abs(resolved.get(3)[13] + rootScale + nextScale) < 1e-10);
  controls.writeGlobalFloat(0, 0x7f800000);
  assert.throws(() => solver.resolveControlledMatrices(base, resolved, controls, 0), /not finite/);
});
