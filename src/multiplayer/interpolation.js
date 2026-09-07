export const REMOTE_POSITION_SNAP_DISTANCE = 8;
export const REMOTE_INTERPOLATION_SHARPNESS = 12;

export function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function interpolationAlpha(
  deltaSeconds,
  sharpness = REMOTE_INTERPOLATION_SHARPNESS,
) {
  return 1 - Math.exp(
    -Math.max(0, sharpness) * Math.max(0, deltaSeconds),
  );
}

export function shouldSnapPosition(
  current,
  target,
  snapDistance = REMOTE_POSITION_SNAP_DISTANCE,
) {
  if (!current || !target) return true;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  return dx * dx + dy * dy + dz * dz > snapDistance * snapDistance;
}
