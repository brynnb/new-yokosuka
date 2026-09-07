export function routeLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    length += Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2],
    );
  }
  return length;
}

export function sampleRoute(points, distance) {
  if (!points?.length) return null;
  if (points.length === 1) {
    return {
      position: [...points[0]],
      yaw: 0,
      pointIndex: 0,
    };
  }
  const totalLength = routeLength(points);
  if (distance >= totalLength) {
    const previous = points.at(-2);
    const current = points.at(-1);
    return {
      position: [...current],
      yaw: Math.atan2(
        current[0] - previous[0],
        current[2] - previous[2],
      ),
      pointIndex: points.length - 2,
    };
  }

  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2],
    );
    if (remaining <= segmentLength || index === points.length - 1) {
      const amount = segmentLength > 0
        ? Math.min(1, remaining / segmentLength)
        : 1;
      return {
        position: previous.map((value, axis) => (
          value + (current[axis] - value) * amount
        )),
        yaw: Math.atan2(
          current[0] - previous[0],
          current[2] - previous[2],
        ),
        pointIndex: index - 1,
      };
    }
    remaining -= segmentLength;
  }
  return null;
}
