import { DEFAULT_LIGHTING } from "./constants.js";

// Shot-local adjustments use the same fields as the shared lighting presets.
// Reject misspelled fields and non-finite values before taking scene ownership.
export function validateLightingOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("lighting override must be a preset-field object");
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, setting]) => {
    const template = DEFAULT_LIGHTING[key];
    const signed = key === "dirDirection" || key === "hemiDirY";
    const valid = number => Number.isFinite(number) && (signed || number >= 0);
    if (!Object.hasOwn(DEFAULT_LIGHTING, key) || (Array.isArray(template)
      ? !Array.isArray(setting) || setting.length !== template.length || !setting.every(valid)
      : !valid(setting))) throw new TypeError(`invalid lighting override field ${key}`);
    return [key, Array.isArray(setting) ? Object.freeze([...setting]) : setting];
  })));
}

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
