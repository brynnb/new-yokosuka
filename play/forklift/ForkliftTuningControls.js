import { DEFAULT_FORKLIFT_PHYSICS_TUNING } from "../../src/ForkliftCargoRules.js";
import { DEFAULT_FORKLIFT_OPTIONS } from "../../src/ForkliftRig.js";

export const DEFAULT_FORKLIFT_TUNING_CONTROLS = Object.freeze({
  centerOfMassHeight: 0.26,
  springRate: 250,
  shockDamping: 250,
  loadInfluence: 10,
  tireGrip: 200,
  brakeForce: 115,
  driveForce: 200,
  steeringResponse: 50,
  highSpeedSteering: 20,
  rollStiffness: 20,
});

function percentageOf(value, baseline) {
  return baseline * Number(value) / 100;
}

export function forkliftPhysicsTuningFromControls(values) {
  return {
    ...DEFAULT_FORKLIFT_PHYSICS_TUNING,
    centerOfMassHeight: Number(values.centerOfMassHeight),
    wheelSuspensionStiffness: percentageOf(
      values.springRate,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.wheelSuspensionStiffness,
    ),
    wheelSuspensionDamping: percentageOf(
      values.shockDamping,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.wheelSuspensionDamping,
    ),
    loadInfluence: Number(values.loadInfluence) / 100,
    tireGrip: percentageOf(
      values.tireGrip,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.tireGrip,
    ),
    steeringGrip: percentageOf(
      values.tireGrip,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.steeringGrip,
    ),
    tireFrictionCoefficient: percentageOf(
      values.tireGrip,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.tireFrictionCoefficient,
    ),
    brakeAcceleration: percentageOf(
      values.brakeForce,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.brakeAcceleration,
    ),
    driveAcceleration: percentageOf(
      values.driveForce,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.driveAcceleration,
    ),
    steeringResponse: percentageOf(
      values.steeringResponse,
      DEFAULT_FORKLIFT_OPTIONS.steeringResponse,
    ),
    highSpeedSteeringResponseFraction: (
      Number(values.highSpeedSteering) / 100
    ),
    antiRollStiffness: percentageOf(
      values.rollStiffness,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.antiRollStiffness,
    ),
    antiRollDamping: percentageOf(
      values.rollStiffness,
      DEFAULT_FORKLIFT_PHYSICS_TUNING.antiRollDamping,
    ),
  };
}
