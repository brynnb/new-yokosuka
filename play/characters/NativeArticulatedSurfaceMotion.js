import * as BABYLON from "@babylonjs/core";

const EPSILON = 1e-8;

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function approach(current, target, step) {
  if (current < target) return Math.min(current + step, target);
  if (current > target) return Math.max(current - step, target);
  return current;
}

function phaseFromNode(node, salt) {
  let value = (Number(node?.addr) | 0) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function perpendicularAxes(directionValue) {
  const direction = directionValue.normalizeToNew();
  const reference = Math.abs(BABYLON.Vector3.Dot(direction, BABYLON.Axis.Y)) < 0.9
    ? BABYLON.Axis.Y
    : BABYLON.Axis.X;
  const primary = BABYLON.Vector3.Cross(direction, reference).normalize();
  const secondary = BABYLON.Vector3.Cross(direction, primary).normalize();
  return { primary, secondary };
}

/** Quantize degrees through FUN_0c135bec's signed fixed-turn output. */
export function quantizeNativeArticulatedSurfaceDegrees(
  degrees,
  fixedTurnUnitsPer45Degrees,
) {
  const fixedTurn = Math.trunc(
    degrees * fixedTurnUnitsPer45Degrees / 45,
  );
  const signed = (fixedTurn << 16) >> 16;
  return signed * 45 / fixedTurnUnitsPer45Degrees;
}

export function advanceNativeArticulatedSurfaceOscillator(state, profile) {
  const amplitude = approach(
    state.amplitude,
    profile.angularAmplitudeDegrees,
    profile.angularApproachDegrees,
  );
  const primaryPhase = wrapDegrees(
    state.primaryPhase + profile.primaryPhaseStepDegrees,
  );
  const secondaryPhase = wrapDegrees(
    state.secondaryPhase + profile.secondaryPhaseStepDegrees,
  );
  const primaryDegrees = quantizeNativeArticulatedSurfaceDegrees(
    profile.primaryBiasDegrees
      + Math.sin(BABYLON.Tools.ToRadians(primaryPhase)) * amplitude,
    profile.fixedTurnUnitsPer45Degrees,
  );
  const secondaryDegrees = quantizeNativeArticulatedSurfaceDegrees(
    profile.secondaryBiasDegrees
      + Math.sin(BABYLON.Tools.ToRadians(secondaryPhase)) * amplitude,
    profile.fixedTurnUnitsPer45Degrees,
  );
  return Object.freeze({
    amplitude,
    primaryPhase,
    secondaryPhase,
    primaryDegrees,
    secondaryDegrees,
  });
}

/**
 * Type-0x81 records rotate authored surface segments rather than simulating
 * free endpoints. Children begin at their resolved parent endpoint, keeping
 * the sleeve attached to its arm while small bends accumulate toward the cuff.
 */
export class NativeArticulatedSurfaceMotion {
  constructor(nodes, profile) {
    if (!Array.isArray(nodes) || nodes.length < 2) {
      throw new TypeError("native articulated surface requires OSAG nodes");
    }
    this.nodes = nodes;
    this.profile = profile;
    this.states = nodes.map(node => ({
      amplitude: 0,
      primaryPhase: phaseFromNode(node, 0x9e3779b1) % 360,
      secondaryPhase: phaseFromNode(node, 0x85ebca6b) % 360,
    }));
  }

  update(baseWorldPoints) {
    if (
      !Array.isArray(baseWorldPoints)
      || baseWorldPoints.length !== this.nodes.length + 1
    ) {
      throw new TypeError(
        "native articulated-surface rest points do not match its OSAG nodes",
      );
    }
    const resolved = [baseWorldPoints[0].clone()];
    for (let index = 0; index < this.nodes.length; index += 1) {
      const restSegment = baseWorldPoints[index + 1]
        .subtract(baseWorldPoints[index]);
      if (restSegment.lengthSquared() <= EPSILON) {
        throw new Error("native articulated-surface segment has no length");
      }
      const state = advanceNativeArticulatedSurfaceOscillator(
        this.states[index],
        this.profile,
      );
      this.states[index] = state;
      const axes = perpendicularAxes(restSegment);
      const primaryRotation = BABYLON.Matrix.RotationAxis(
        axes.primary,
        BABYLON.Tools.ToRadians(state.primaryDegrees),
      );
      const secondaryRotation = BABYLON.Matrix.RotationAxis(
        axes.secondary,
        BABYLON.Tools.ToRadians(state.secondaryDegrees),
      );
      const rotated = BABYLON.Vector3.TransformNormal(
        BABYLON.Vector3.TransformNormal(restSegment, primaryRotation),
        secondaryRotation,
      );
      resolved.push(resolved[index].add(rotated));
    }
    return resolved;
  }
}
