export function triangleNormal(points) {
  const ab = points[1].map((value, axis) => value - points[0][axis]);
  const ac = points[2].map((value, axis) => value - points[0][axis]);
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal);
  return length <= 1e-10 ? null : normal.map((value) => value / length);
}

export function trianglesOverlapInProjection(left, right, normal, epsilon) {
  const dominantAxis = normal
    .map((value) => Math.abs(value))
    .reduce((best, value, axis, values) => (
      value > values[best] ? axis : best
    ), 0);
  const axes = [0, 1, 2].filter((axis) => axis !== dominantAxis);
  const left2d = left.map((point) => [point[axes[0]], point[axes[1]]]);
  const right2d = right.map((point) => [point[axes[0]], point[axes[1]]]);
  const separatingAxes = [];
  for (const triangle of [left2d, right2d]) {
    for (let index = 0; index < 3; index += 1) {
      const start = triangle[index];
      const end = triangle[(index + 1) % 3];
      separatingAxes.push([-(end[1] - start[1]), end[0] - start[0]]);
    }
  }
  for (const axis of separatingAxes) {
    const length = Math.hypot(...axis);
    if (length <= 1e-10) continue;
    const unit = axis.map((value) => value / length);
    const project = (triangle) => triangle.map(
      (point) => point[0] * unit[0] + point[1] * unit[1],
    );
    const leftProjection = project(left2d);
    const rightProjection = project(right2d);
    const overlap = Math.min(
      Math.max(...leftProjection),
      Math.max(...rightProjection),
    ) - Math.max(
      Math.min(...leftProjection),
      Math.min(...rightProjection),
    );
    if (overlap <= epsilon) return false;
  }
  return true;
}

export function coplanarOverlayTextureRanks(
  polygons,
  vertices,
  planeEpsilon = 0.002,
) {
  const triangles = [];
  let drawOrder = 0;
  for (const poly of polygons || []) {
    for (const strip of poly.strips || []) {
      const points = strip.map((point) => {
        const vertex = point.vertexOverride || vertices[point.idx];
        return vertex?.pos || null;
      });
      for (let index = 0; index < points.length - 2; index += 1) {
        const triangle = index % 2 === 0
          ? [points[index], points[index + 1], points[index + 2]]
          : [points[index], points[index + 2], points[index + 1]];
        if (triangle.some((point) => !point)) continue;
        const normal = triangleNormal(triangle);
        if (!normal) continue;
        const dominant = normal
          .map((value) => Math.abs(value))
          .reduce((best, value, axis, values) => (
            value > values[best] ? axis : best
          ), 0);
        if (normal[dominant] < 0) {
          normal[0] *= -1;
          normal[1] *= -1;
          normal[2] *= -1;
        }
        triangles.push({
          texId: poly.texId ?? 0,
          points: triangle,
          normal,
          plane: normal.reduce(
            (sum, value, axis) => sum + value * triangle[0][axis],
            0,
          ),
          drawOrder: drawOrder++,
        });
      }
    }
  }
  const conflicts = new Map();
  for (let leftIndex = 0; leftIndex < triangles.length; leftIndex += 1) {
    const left = triangles[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < triangles.length;
      rightIndex += 1
    ) {
      const right = triangles[rightIndex];
      if (left.texId === right.texId) continue;
      const alignment = left.normal.reduce(
        (sum, value, axis) => sum + value * right.normal[axis],
        0,
      );
      if (
        alignment < 0.9999
        || Math.abs(left.plane - right.plane) > planeEpsilon
        || !trianglesOverlapInProjection(
          left.points,
          right.points,
          left.normal,
          planeEpsilon,
        )
      ) {
        continue;
      }
      const key = left.texId < right.texId
        ? `${left.texId}:${right.texId}`
        : `${right.texId}:${left.texId}`;
      const conflict = conflicts.get(key) || {
        textures: [left.texId, right.texId],
        orderTotals: new Map(),
      };
      for (const item of [left, right]) {
        conflict.orderTotals.set(
          item.texId,
          (conflict.orderTotals.get(item.texId) || 0) + item.drawOrder,
        );
      }
      conflicts.set(key, conflict);
    }
  }
  const edges = new Map();
  const textures = new Set();
  for (const conflict of conflicts.values()) {
    const [left, right] = conflict.textures;
    const back = (
      (conflict.orderTotals.get(left) || 0)
      <= (conflict.orderTotals.get(right) || 0)
    ) ? left : right;
    const front = back === left ? right : left;
    if (!edges.has(back)) edges.set(back, new Set());
    edges.get(back).add(front);
    textures.add(back);
    textures.add(front);
  }
  const ranks = new Map([...textures].map((texture) => [texture, 0]));
  for (let pass = 0; pass < textures.size; pass += 1) {
    let changed = false;
    for (const [back, fronts] of edges) {
      for (const front of fronts) {
        const nextRank = Math.min(
          textures.size - 1,
          (ranks.get(back) || 0) + 1,
        );
        if (nextRank > (ranks.get(front) || 0)) {
          ranks.set(front, nextRank);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return ranks;
}
