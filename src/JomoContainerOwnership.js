function extent(bounds, axis) {
  return Math.max(0, bounds.max[axis] - bounds.min[axis]);
}

function volume(bounds) {
  return extent(bounds, 0) * extent(bounds, 1) * extent(bounds, 2);
}

export function boundsCenter(bounds) {
  return [0, 1, 2].map(
    (axis) => (bounds.min[axis] + bounds.max[axis]) * 0.5,
  );
}

export function containingJomoContainer(
  containers,
  candidateBounds,
  epsilon = 0.015,
) {
  const center = boundsCenter(candidateBounds);
  const candidateVolume = volume(candidateBounds);
  const matches = [];
  for (const container of containers) {
    const bounds = container.bounds;
    const containsCenter = center.every((value, axis) => (
      value >= bounds.min[axis] - epsilon
      && value <= bounds.max[axis] + epsilon
    ));
    if (!containsCenter) continue;

    const containerVolume = volume(bounds);
    if (
      !Number.isFinite(candidateVolume)
      || !Number.isFinite(containerVolume)
      || containerVolume <= 0
      || candidateVolume >= containerVolume * 0.25
    ) {
      continue;
    }

    const normalizedDistance = center.reduce((sum, value, axis) => {
      const middle = (bounds.min[axis] + bounds.max[axis]) * 0.5;
      const size = Math.max(extent(bounds, axis), epsilon);
      return sum + ((value - middle) / size) ** 2;
    }, 0);
    matches.push({ container, normalizedDistance });
  }
  matches.sort(
    (left, right) => left.normalizedDistance - right.normalizedDistance,
  );
  return matches[0]?.container || null;
}
