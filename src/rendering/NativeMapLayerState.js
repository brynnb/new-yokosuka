import nativeMapLayerStates from "../../play/data/native-map-layer-states.json" with {
  type: "json",
};

export function nativeClockMinute(date, dayBoundaryHour = 6) {
  let minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (date.getUTCHours() < dayBoundaryHour) minute += 24 * 60;
  return minute;
}

export function evaluateNativeMapLayerStates(area, date) {
  const definition = nativeMapLayerStates.areas[area];
  if (!definition) return new Map();
  const states = new Map();
  for (const rule of definition.rules) {
    const predicate = rule.predicate;
    const minute = nativeClockMinute(date, predicate.dayBoundaryHour);
    const matches = (
      predicate.startMinute <= minute
      && minute < predicate.endMinute
    );
    for (const assignment of matches ? rule.whenTrue : rule.whenFalse) {
      states.set(assignment.layer, assignment.value);
    }
  }
  return states;
}

export function nativeMapLayerDefinition(area) {
  return nativeMapLayerStates.areas[area] || null;
}

export function numberedMapLayer(filename, modelPrefix) {
  const escapedPrefix = String(modelPrefix || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const match = String(filename || "").toUpperCase().match(
    new RegExp(`^${escapedPrefix}_MAP(\\d{2})?\\.(?:MT5|MT7)$`, "i"),
  );
  return match ? Number.parseInt(match[1] || "0", 10) : null;
}
