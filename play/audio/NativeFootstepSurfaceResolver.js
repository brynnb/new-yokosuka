import surfaceCatalog from "../data/native-footstep-surfaces.json" with {
  type: "json",
};
import actorProperties from "../data/native-actor-footstep-properties.json" with {
  type: "json",
};

const EPSILON = 1e-6;

function cross([ax, az], [bx, bz]) {
  return ax * bz - az * bx;
}

function subtract([ax, az], [bx, bz]) {
  return [ax - bx, az - bz];
}

function pointInPolygon(point, vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) return false;
  let positive = false;
  let negative = false;
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const side = cross(subtract(end, start), subtract(point, start));
    if (side > EPSILON) positive = true;
    if (side < -EPSILON) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

function pointInParallelogram(point, { origin, edgeU, edgeV }) {
  const determinant = cross(edgeU, edgeV);
  if (Math.abs(determinant) <= EPSILON) return false;
  const relative = subtract(point, origin);
  const u = cross(relative, edgeV) / determinant;
  const v = cross(edgeU, relative) / determinant;
  return (
    u >= -EPSILON
    && u <= 1 + EPSILON
    && v >= -EPSILON
    && v <= 1 + EPSILON
  );
}

export function nativeSurfaceShapeContains(geometry, point) {
  if (!geometry || !Array.isArray(point)) return false;
  if (geometry.kind === "point") {
    return (
      Math.abs(point[0] - geometry.point[0]) <= EPSILON
      && Math.abs(point[1] - geometry.point[1]) <= EPSILON
    );
  }
  if (geometry.kind === "circle") {
    const [dx, dz] = subtract(point, geometry.center);
    return dx * dx + dz * dz <= geometry.radius * geometry.radius + EPSILON;
  }
  if (geometry.kind === "triangle" || geometry.kind === "polygon") {
    return pointInPolygon(point, geometry.vertices);
  }
  if (geometry.kind === "parallelogram") {
    return pointInParallelogram(point, geometry);
  }
  return false;
}

export function nativeActorFootstepSurfaceIndex({
  area,
  actorTag,
  catalog = actorProperties,
} = {}) {
  const property = catalog.actors?.[String(actorTag || "").toUpperCase()]
    ?.areas?.[String(area || "").toUpperCase()];
  const surfaceIndex = Number(property?.surfaceIndex);
  return property?.enabled === true
    && Number.isInteger(surfaceIndex)
    && surfaceIndex >= 0
    && surfaceIndex < 23
    ? surfaceIndex
    : null;
}

function cellIndexForPoint(grid, [x, z]) {
  if (
    x < grid.minimumX
    || x > grid.maximumX
    || z < grid.minimumZ
    || z > grid.maximumZ
  ) {
    return -1;
  }
  const column = Math.max(
    0,
    Math.min(grid.width - 1, Math.floor(
      (x - grid.minimumX) / grid.cellWidth,
    )),
  );
  const sourceRow = Math.max(
    0,
    Math.min(grid.height - 1, Math.floor(
      (z - grid.minimumZ) / grid.cellHeight,
    )),
  );
  // FUN_0c0b27c2 stores the Z cells from maximum to minimum.
  const row = grid.height - 1 - sourceRow;
  return row * grid.width + column;
}

export function nativeFootstepSurfaceIndexAt({
  area,
  actorTag,
  browserX,
  browserZ,
  fallbackSurfaceIndex = 0,
  catalog = surfaceCatalog,
  actorCatalog = actorProperties,
} = {}) {
  const actorFallbackSurfaceIndex = nativeActorFootstepSurfaceIndex({
    area,
    actorTag,
    catalog: actorCatalog,
  }) ?? fallbackSurfaceIndex;
  const definition = catalog.areas?.[String(area || "").toUpperCase()];
  if (
    !definition
    || !Number.isFinite(browserX)
    || !Number.isFinite(browserZ)
  ) {
    return actorFallbackSurfaceIndex;
  }
  // MT5 rendering reflects source X. The native collision point constructed
  // by FUN_0c0b3986 also negates source Z before dispatching its shape test.
  const collisionPoint = [-browserX, -browserZ];
  const cellIndex = cellIndexForPoint(definition.grid, collisionPoint);
  if (cellIndex < 0) return actorFallbackSurfaceIndex;
  let selected = null;
  for (const recordIndex of definition.grid.cells[cellIndex] || []) {
    const record = definition.records[recordIndex];
    if (
      !record
      || record.suppressed
      || !nativeSurfaceShapeContains(record.geometry, collisionPoint)
    ) {
      continue;
    }
    const encoded = record.code & 0xffff;
    if (encoded > (selected?.encoded ?? 0)) {
      selected = { encoded, surfaceIndex: record.surfaceIndex };
    }
  }
  // FUN_0c17bb14 replaces collision result zero with the current area's
  // actor STEP property. This is authored actor data, not a terrain guess:
  // captured AKIR values differ between MFSY and JOMO.
  return selected?.surfaceIndex || actorFallbackSurfaceIndex;
}
