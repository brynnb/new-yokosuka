import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FORKLIFT_TUNING_CONTROLS,
  forkliftPhysicsTuningFromControls,
} from "../play/forklift/ForkliftTuningControls.js";
import { DEFAULT_FORKLIFT_PHYSICS_TUNING } from "../src/ForkliftCargoRules.js";

test("forklift tuning controls map to the physics values they describe", () => {
  const tuning = forkliftPhysicsTuningFromControls(
    DEFAULT_FORKLIFT_TUNING_CONTROLS,
  );

  assert.equal(tuning.centerOfMassHeight, 0.26);
  assert.equal(tuning.wheelSuspensionStiffness, 200000);
  assert.equal(tuning.wheelSuspensionDamping, 22500);
  assert.equal(tuning.loadInfluence, 0.1);
  assert.equal(tuning.tireGrip, 16);
  assert.equal(tuning.steeringGrip, 10);
  assert.equal(tuning.tireFrictionCoefficient, 2.1);
  assert.equal(tuning.brakeAcceleration, 23);
  assert.equal(tuning.driveAcceleration, 12.8);
  assert.equal(tuning.steeringResponse, 1.9);
  assert.equal(tuning.highSpeedSteeringResponseFraction, 0.2);
  assert.equal(tuning.antiRollStiffness, 12000);
  assert.equal(tuning.antiRollDamping, 1200);
});

test("every forklift slider changes at least one live tuning parameter", () => {
  const baseline = forkliftPhysicsTuningFromControls(
    DEFAULT_FORKLIFT_TUNING_CONTROLS,
  );
  const affectedProperties = {
    centerOfMassHeight: ["centerOfMassHeight"],
    springRate: ["wheelSuspensionStiffness"],
    shockDamping: ["wheelSuspensionDamping"],
    loadInfluence: ["loadInfluence"],
    tireGrip: ["tireGrip", "steeringGrip", "tireFrictionCoefficient"],
    brakeForce: ["brakeAcceleration"],
    driveForce: ["driveAcceleration"],
    steeringResponse: ["steeringResponse"],
    highSpeedSteering: ["highSpeedSteeringResponseFraction"],
    rollStiffness: ["antiRollStiffness", "antiRollDamping"],
  };

  for (const [control, properties] of Object.entries(affectedProperties)) {
    const changed = forkliftPhysicsTuningFromControls({
      ...DEFAULT_FORKLIFT_TUNING_CONTROLS,
      [control]: DEFAULT_FORKLIFT_TUNING_CONTROLS[control] + 1,
    });
    assert.ok(
      properties.some((property) => changed[property] !== baseline[property]),
      `${control} should alter its live physics parameter`,
    );
  }
});
