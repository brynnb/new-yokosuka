// Some original COLS fields describe alternate collision around the same
// stair flight. Only infer a handoff when both fields independently contain
// the same end markers and the alternate field supplies both side boundaries.
// This is a bounded presentation of source geometry, not a claim that the
// original engine used the same field-selection algorithm.
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const midpoint = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const length = segment => distance(...segment);
const records = field => field?.sections?.flatMap(section => section.records) || [];
const lineDistance = (p, [a, b]) => Math.abs(
  (b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1]),
) / length([a, b]);
const sameSegment = (a, b) => (
  (distance(a[0], b[0]) < .01 && distance(a[1], b[1]) < .01)
  || (distance(a[0], b[1]) < .01 && distance(a[1], b[0]) < .01)
);
const coversSegment = (longer, shorter) => {
  const [a, b] = longer, extent = length(longer);
  if (!(extent > length(shorter) + .4)) return false;
  const dx = (b[0] - a[0]) / extent, dz = (b[1] - a[1]) / extent;
  return shorter.every(point => {
    const projection = (point[0] - a[0]) * dx + (point[1] - a[1]) * dz;
    return projection >= -.08 && projection <= extent + .08 && lineDistance(point, longer) < .08;
  });
};

export function discoverNativeStairFieldHandoffs(base, alternate, segmentsForGeometry) {
  if (!base || !alternate || typeof segmentsForGeometry !== "function") return [];
  const baseRecords = records(base), alternateRecords = records(alternate);
  const alternateSides = alternateRecords.filter(record => record.code === 9)
    .flatMap(record => segmentsForGeometry(record.geometry));
  const alternateGates = alternateRecords.filter(record => record.code === 10)
    .flatMap(record => segmentsForGeometry(record.geometry));
  const sharedGates = baseRecords.filter(record => record.code === 10)
    .flatMap(record => segmentsForGeometry(record.geometry))
    .filter(gate => alternateGates.some(other => sameSegment(gate, other)));
  const handoffs = [];
  for (const record of baseRecords) {
    if (record.code !== 0 || record.geometry?.kind !== "polyline"
      || record.geometry.vertices.length !== 4) continue;
    const [sideA, cap, sideB] = segmentsForGeometry(record.geometry);
    if (![sideA, cap, sideB].every(segment => length(segment) > .1)) continue;
    // Extracted float coordinates differ slightly across fields; require both
    // long, collinear alternate side walls rather than matching by proximity.
    const matchingSide = side => alternateSides.filter(other => coversSegment(other, side));
    if (matchingSide(sideA).length !== 1 || matchingSide(sideB).length !== 1) continue;
    const start = midpoint([sideA[0], sideB[1]]), end = midpoint(cap);
    const dx = end[0] - start[0], dz = end[1] - start[1], flightLength = Math.hypot(dx, dz);
    if (flightLength < .5) continue;
    const ux = dx / flightLength, uz = dz / flightLength;
    const possible = sharedGates.filter(gate => {
      const width = length(gate), [a, b] = gate;
      const parallel = Math.abs(((b[0] - a[0]) * (cap[1][0] - cap[0][0])
        + (b[1] - a[1]) * (cap[1][1] - cap[0][1])) / (width * length(cap)));
      const center = midpoint(gate);
      const lateral = Math.abs((center[0] - start[0]) * -uz + (center[1] - start[1]) * ux);
      return Math.abs(width - length(cap)) < .2 && parallel > .98 && lateral < .3;
    });
    const before = possible.filter(gate => distance(midpoint(gate), start) < .5);
    const after = possible.filter(gate => {
      const p = midpoint(gate), forward = (p[0] - end[0]) * ux + (p[1] - end[1]) * uz;
      return forward > .1 && forward < flightLength && distance(p, end) < flightLength;
    });
    // Ambiguity is not a license to drop collision: leave that record alone.
    if (before.length !== 1 || after.length !== 1) continue;
    handoffs.push({ start: midpoint(before[0]), end: midpoint(after[0]),
      width: Math.min(length(before[0]), length(after[0])), sourceRecordOffset: record.recordOffset });
  }
  return handoffs;
}

export function nativeStairFieldAtPosition(handoffs, position, radius = 0) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return false;
  return (handoffs || []).some(({ start, end, width }) => {
    const dx = end[0] - start[0], dz = end[1] - start[1], extent = Math.hypot(dx, dz);
    if (!(extent > 0) || !(width > 0)) return false;
    const x = position.x - start[0], z = position.z - start[1];
    const along = (x * dx + z * dz) / extent, lateral = Math.abs(x * -dz + z * dx) / extent;
    return along >= -radius && along <= extent + radius && lateral <= width / 2 + radius;
  });
}
