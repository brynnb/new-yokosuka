export function parseAuthSplineCurve(view, offset, endOffset) {
  if (offset + 4 > endOffset) {
    throw new Error("Truncated AUTH spline curve.");
  }
  const count = view.getUint32(offset, true);
  const byteLength = 4 + count * 12;
  if (offset + byteLength > endOffset) {
    throw new Error(`Invalid AUTH spline curve count ${count}.`);
  }
  const readFloats = (start) => Array.from(
    { length: count },
    (_, index) => view.getFloat32(start + index * 4, true),
  );
  const timesOffset = offset + 4;
  const valuesOffset = timesOffset + count * 4;
  const tangentsOffset = valuesOffset + count * 4;
  return {
    curve: Object.freeze({
      times: Object.freeze(readFloats(timesOffset)),
      values: Object.freeze(readFloats(valuesOffset)),
      tangents: Object.freeze(readFloats(tangentsOffset)),
    }),
    nextOffset: offset + byteLength,
  };
}

export function evaluateAuthCurve(curve, time) {
  const { times, values, tangents } = curve;
  if (times.length === 0) return 0;
  if (time <= times[0]) return values[0];
  if (time >= times.at(-1)) return values.at(-1);

  let upper = 1;
  while (upper < times.length && times[upper] <= time) upper += 1;
  const lower = upper - 1;
  const start = times[lower];
  const end = times[upper];
  const duration = end - start;
  if (!(duration > 0)) return values[upper];
  const t = (time - start) / duration;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return (
    h00 * values[lower]
    + h10 * duration * tangents[lower]
    + h01 * values[upper]
    + h11 * duration * tangents[upper]
  );
}
