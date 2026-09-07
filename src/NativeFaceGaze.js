function finiteVector3(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || !value.every(Number.isFinite)
  ) throw new TypeError(`${label} must be a finite three-vector`);
  return value;
}

function angleRange(value, label) {
  if (
    !value
    || !Number.isFinite(value.minimum)
    || !Number.isFinite(value.maximum)
    || value.minimum > value.maximum
  ) throw new TypeError(`${label} must be a finite ordered range`);
  return value;
}

function clamp(value, range) {
  return Math.max(range.minimum, Math.min(range.maximum, value));
}

/**
 * Resolve the two source-space rotations used by a native FACE eye node.
 * Detailed FACE eyes look down local +X. Positive local Y is horizontal and
 * positive local Z is vertical; the returned rotations therefore map
 * directly to the MT5 row-matrix Y (vertical) and Z (horizontal) rotations.
 */
export function nativeFaceEyeTargetAngles({
  target,
  eyeOrigin,
  verticalLimits,
  horizontalLimits,
} = {}) {
  const targetValue = finiteVector3(target, "native FACE gaze target");
  const origin = finiteVector3(eyeOrigin, "native FACE eye origin");
  const verticalRange = angleRange(
    verticalLimits,
    "native FACE vertical limits",
  );
  const horizontalRange = angleRange(
    horizontalLimits,
    "native FACE horizontal limits",
  );
  const delta = targetValue.map((value, index) => value - origin[index]);
  const horizontalLength = Math.hypot(delta[0], delta[1]);
  return Object.freeze({
    // rowRotationY(+a) turns +X toward -Z.
    vertical: clamp(
      -Math.atan2(delta[2], Math.max(horizontalLength, 1e-9)),
      verticalRange,
    ),
    // rowRotationZ(+a) turns +X toward +Y.
    horizontal: clamp(
      Math.atan2(delta[1], delta[0]),
      horizontalRange,
    ),
  });
}

/**
 * One native FACE interpolation tick. FUN_0c0bc824 divides the remaining
 * angular error by (duration - elapsed), and FUN_0c0bcaec applies that step.
 * Re-evaluating this function with a moving desired angle reproduces the
 * native controller's smooth tracking after a world-space target request.
 */
export function advanceNativeFaceEyeAngles(
  current,
  target,
  ticksRemaining,
) {
  if (
    !current
    || !target
    || ![current.vertical, current.horizontal].every(Number.isFinite)
    || ![target.vertical, target.horizontal].every(Number.isFinite)
    || !Number.isInteger(ticksRemaining)
    || ticksRemaining < 0
  ) throw new TypeError("native FACE eye interpolation state is invalid");
  if (ticksRemaining === 0) {
    return Object.freeze({
      vertical: target.vertical,
      horizontal: target.horizontal,
      ticksRemaining: 0,
    });
  }
  return Object.freeze({
    vertical: current.vertical
      + (target.vertical - current.vertical) / ticksRemaining,
    horizontal: current.horizontal
      + (target.horizontal - current.horizontal) / ticksRemaining,
    ticksRemaining: ticksRemaining - 1,
  });
}
