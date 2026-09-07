function lerp(from, to, amount) {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  return from + (to - from) * amount;
}

function interpolateValue(from, to, amount) {
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => lerp(value, to[index], amount));
  }
  return lerp(from, to, amount);
}

export function interpolateLightingPresets(from, to, progress) {
  const amount = Math.min(1, Math.max(0, Number(progress) || 0));
  return Object.fromEntries(Object.keys(from).map((key) => (
    [key, interpolateValue(from[key], to[key], amount)]
  )));
}

export function interpolateClearColors(from, to, progress) {
  const amount = Math.min(1, Math.max(0, Number(progress) || 0));
  return from.map((value, index) => lerp(value, to[index], amount));
}
