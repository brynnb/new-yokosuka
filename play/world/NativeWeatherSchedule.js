const EPSILON = 2 ** -23;
const f32 = Math.fround;
const signedByte = value => value > 127 ? value - 256 : value;

/** 0xc1c1256 calendar normalization, not JavaScript Date normalization. */
export function nativeWeatherDateKey(record) {
  if ((!Array.isArray(record) && !(record instanceof Uint8Array))
    || record.length !== 7
    || Array.from(record).some(b => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new TypeError("native weather requires the exact seven-byte clock record");
  }
  let [year, month, day, , hour, minute] = Array.from(record, signedByte);
  year -= 86;
  if (year < 0) { year = 0; month = -1; }
  else if (year > 15) { year = 15; month = 13; }
  if (month < 1) { month = 1; day = -1; }
  else if (month > 12) { month = 12; day = 32; }
  if (day < 1) { day = 1; hour = -1; }
  else if (day > 31) { day = 31; hour = 24; }
  if (hour < 0) { hour = 0; minute = -1; }
  else if (hour > 23) { hour = 23; minute = 60; }
  minute = Math.max(0, Math.min(59, minute));
  return (year << 20) | (month << 16) | (day << 11) | (hour << 6) | minute;
}

/** Immutable, validated curves; binary lookup avoids a scan on every clock tick. */
export class NativeWeatherSchedule {
  constructor(catalog) {
    if (catalog?.schema !== "new-yokosuka-shenmue1-native-weather-v1") {
      throw new TypeError("native weather catalog schema is unavailable");
    }
    this.curves = {};
    for (const tag of ["CLUD", "RAIN", "SNOW", "AUX"]) {
      const words = tag === "AUX" ? catalog.auxiliaryCurve : catalog.curves?.[tag];
      if (!Array.isArray(words) || words.length < 2
        || words.some((word, i) => !Number.isInteger(word) || word < 0 || word > 0xffffffff
          || (i > 0 && (words[i - 1] & 0xffffff) >= (word & 0xffffff)))) {
        throw new TypeError(`native weather ${tag} curve is malformed`);
      }
      this.curves[tag] = Object.freeze([...words]);
    }
    Object.freeze(this.curves);
    this.environment = new NativeWeatherEnvironmentSchedule(catalog.environment);
  }

  sample(record) {
    const packedDate = nativeWeatherDateKey(record);
    const result = { packedDate };
    for (const [tag, channel] of [["CLUD", "cloud"], ["RAIN", "rain"], ["SNOW", "snow"], ["AUX", "auxiliary"]]) {
      const words = this.curves[tag];
      // Native lookup needs a pair surrounding the input. Never make missing
      // source coverage look like a valid clear-weather fallback.
      if (packedDate < (words[0] & 0xffffff) || packedDate >= (words.at(-1) & 0xffffff)) {
        throw new RangeError(`native weather ${tag} has no source interval for 0x${packedDate.toString(16)}`);
      }
      let low = 0;
      let high = words.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >>> 1;
        if ((words[middle] & 0xffffff) <= packedDate) low = middle;
        else high = middle;
      }
      const from = words[low];
      const to = words[high];
      const progress = f32(f32(packedDate - (from & 0xffffff)) / f32((to & 0xffffff) - (from & 0xffffff)));
      let value = nativeWeatherLerp(f32((from >>> 24) / 255), f32((to >>> 24) / 255), progress);
      if (tag !== "SNOW" && Math.abs(value) < EPSILON) value = 0;
      result[channel] = value;
    }
    return result;
  }
}

/** Owns script weather control separately from time, lighting and presentation.
 * The browser has no native forecast-sprite owner. Mode-one refresh therefore
 * models the cloud/rain/snow owners and reports that separate capability gap;
 * it does not pretend to create the original forecast controller.
 */
export class NativeWeatherControllerState {
  constructor(schedule) {
    if (!(schedule instanceof NativeWeatherSchedule)) throw new TypeError("native weather schedule is required");
    this.schedule = schedule;
    // 0xc1ba710 is the session initializer, not a new default on each room.
    this.restore({ frozen: 1, channels: null, cachedClock: null,
      environmentOwner: null, environmentMask: schedule.environment.coldMask,
      environmentFlags: { ...schedule.environment.coldFlags },
      appliedLightRgb: null, appliedSky: null });
  }

  apply(detail, readClock) {
    if (detail.operationId === 0x0175) return this.#applyEnvironmentControl(detail, readClock);
    if (detail.operationId !== 0x0176 || detail.mode !== 1 || typeof detail.truthyBranch !== "boolean") {
      return { status: "stopped", reason: "native-weather-control-route-unproved" };
    }
    if (detail.truthyBranch) {
      this.frozen = 1;
    } else {
      // Evaluate before mutating: a missing clock/table must not unfreeze a
      // prior valid environment or replace it with a plausible clear state.
      const record = readClock();
      const channels = this.schedule.sample(record);
      this.channels = channels;
      this.cachedClock = [record[0], record[1], record[2], record[4], record[5]];
      this.frozen = 0;
    }
    return { mutation: { ...this.snapshot(), nativeForecastOwner: "not-implemented" } };
  }

  #applyEnvironmentControl(detail, readClock) {
    const { mode, forwardedWords, truthyBranch } = detail;
    if (mode === 1) {
      if (this.environmentOwner) return { nativeNoOp: true, mutation: { environmentOwnerAlreadyActive: true } };
      const clock = Array.from(readClock());
      const channels = this.schedule.sample(clock);
      const sample = this.schedule.environment.sample(clock, channels);
      const sky = this.schedule.environment.sky(clock, channels);
      // All source reads/validation precede the native pointer publication.
      this.channels = channels;
      this.environmentOwner = { tag: "WAIR", clock, channels: { ...channels }, sample, sky };
      this.environmentFlags.effects = 1;
      this.#applyOwnerProjection();
    } else if (mode === 2) {
      if (!this.environmentOwner) return { nativeNoOp: true, mutation: { environmentOwnerAlreadyReleased: true } };
      this.environmentOwner = null;
      this.environmentFlags.effects = 0;
      // Releasing WAIR does not reset the global light or SCROLL renderer.
    } else if (mode === 27) {
      if (!this.environmentOwner) return { nativeNoOp: true, mutation: { environmentOwnerUnavailable: true } };
      this.environmentOwner.sky = this.schedule.environment.sky(this.environmentOwner.clock, this.environmentOwner.channels);
      this.appliedSky = { ...this.environmentOwner.sky };
    } else if (mode === 15 && forwardedWords?.length === 1 && Number.isInteger(forwardedWords[0])) {
      this.environmentFlags.effects = forwardedWords[0] >>> 0;
    } else if (mode === 21 && forwardedWords?.length === 1 && Number.isInteger(forwardedWords[0])) {
      this.environmentMask = (this.environmentMask & ~forwardedWords[0]) >>> 0;
    } else if ([23, 24, 25].includes(mode) && typeof truthyBranch === "boolean") {
      const mask = { 23: 0x780, 24: 0x1800, 25: 12 }[mode];
      this.environmentMask = (truthyBranch ? this.environmentMask | mask : this.environmentMask & ~mask) >>> 0;
    } else {
      return { status: "stopped", reason: "native-weather-environment-control-route-unproved" };
    }
    return { mutation: { ...this.snapshot(), presentationBoundary: "browser-light-color-and-sky-projection" } };
  }

  #applyOwnerProjection() {
    const owner = this.environmentOwner;
    if (this.environmentFlags.lighting === 1 && (this.environmentMask & 2)) {
      // Native records store A,R,G,B at +16. Keep browser intensity/direction
      // policy separate: the full Dreamcast global-light API is not Babylon.
      this.appliedLightRgb = owner.sample.values.slice(5, 8);
    }
    if (this.environmentFlags.sky === 1) this.appliedSky = { ...owner.sky };
  }

  synchronize(enabled, readClock) {
    // The browser samples current game minutes. The native per-frame owner
    // instead queues minute-ahead targets with 120-tick smoothing. That visual
    // timing is not claimed by this adapter; explicit script refresh is exact.
    if (enabled === 1 && (this.frozen === 0 || this.environmentOwner)) {
      const record = readClock();
      const refreshWeather = this.frozen === 0
        && (!this.cachedClock || [0, 1, 2, 4, 5].some((i, j) => record?.[i] !== this.cachedClock[j]));
      const channels = refreshWeather ? this.schedule.sample(record) : this.channels;
      // Native 0xc1baf84 still advances WAIR's clock while weather is frozen.
      // Freeze owns weather curves, not the sun/time-of-day environment.
      const owner = this.environmentOwner;
      let nextOwner = owner;
      if (owner && (owner.clock.some((b, i) => b !== record?.[i])
        || Object.keys(channels).some(k => channels[k] !== owner.channels[k]))) {
        const sample = this.schedule.environment.sample(record, channels);
        const sky = this.schedule.environment.sky(record, channels, owner.sky);
        nextOwner = { ...owner, clock: Array.from(record), channels: { ...channels }, sample, sky };
      }
      // Validate the whole refresh before publishing either owner. A valid
      // WDAT packed-date normalization does not imply a valid WAIR clock.
      if (refreshWeather) {
        this.channels = channels;
        this.cachedClock = [record[0], record[1], record[2], record[4], record[5]];
      }
      this.environmentOwner = nextOwner;
      if (owner) this.#applyOwnerProjection();
    }
    return this.channels ? { ...this.channels } : null;
  }

  snapshot() {
    return structuredClone({ frozen: this.frozen, channels: this.channels, cachedClock: this.cachedClock,
      environmentOwner: this.environmentOwner, environmentMask: this.environmentMask,
      environmentFlags: this.environmentFlags, appliedLightRgb: this.appliedLightRgb, appliedSky: this.appliedSky });
  }

  restore(snapshot) {
    const owned = structuredClone(snapshot);
    this.frozen = owned.frozen;
    this.channels = owned.channels;
    this.cachedClock = owned.cachedClock;
    this.environmentOwner = owned.environmentOwner;
    this.environmentMask = owned.environmentMask;
    this.environmentFlags = owned.environmentFlags;
    this.appliedLightRgb = owned.appliedLightRgb;
    this.appliedSky = owned.appliedSky;
  }

  readEnvironment() {
    if (!this.appliedLightRgb && !this.appliedSky) return null;
    return { ownerActive: this.environmentOwner !== null,
      lightingOverride: this.appliedLightRgb ? { dirDiffuse: [...this.appliedLightRgb] } : null,
      sky: this.appliedSky ? { ...this.appliedSky } : null };
  }
}
import { NativeWeatherEnvironmentSchedule, nativeWeatherLerp } from "./NativeWeatherEnvironment.js";
