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

function nativeLerp(from, to, progress) {
  // The shared 0xc0ecf06 helper zeroes both tiny differences and tiny products.
  let delta = f32(to - from);
  if (Math.abs(delta) < EPSILON) delta = 0;
  else {
    delta = f32(delta * progress);
    if (Math.abs(delta) < EPSILON) delta = 0;
  }
  return f32(from + delta);
}

/** Immutable, validated curves; binary lookup avoids a scan on every clock tick. */
export class NativeWeatherSchedule {
  constructor(catalog) {
    if (catalog?.schema !== "new-yokosuka-shenmue1-native-weather-v1") {
      throw new TypeError("native weather catalog schema is unavailable");
    }
    this.curves = {};
    for (const tag of ["CLUD", "RAIN", "SNOW"]) {
      const words = catalog.curves?.[tag];
      if (!Array.isArray(words) || words.length < 2
        || words.some((word, i) => !Number.isInteger(word) || word < 0 || word > 0xffffffff
          || (i > 0 && (words[i - 1] & 0xffffff) >= (word & 0xffffff)))) {
        throw new TypeError(`native weather ${tag} curve is malformed`);
      }
      this.curves[tag] = Object.freeze([...words]);
    }
    Object.freeze(this.curves);
  }

  sample(record) {
    const packedDate = nativeWeatherDateKey(record);
    const result = { packedDate };
    for (const [tag, channel] of [["CLUD", "cloud"], ["RAIN", "rain"], ["SNOW", "snow"]]) {
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
      let value = nativeLerp(f32((from >>> 24) / 255), f32((to >>> 24) / 255), progress);
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
    this.restore({ frozen: null, channels: null, cachedClock: null });
  }

  apply(detail, readClock) {
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

  synchronize(enabled, readClock) {
    // The browser samples current game minutes. The native per-frame owner
    // instead queues minute-ahead targets with 120-tick smoothing. That visual
    // timing is not claimed by this adapter; explicit script refresh is exact.
    if (this.frozen === 0 && enabled === 1) {
      const record = readClock();
      if (!this.cachedClock || [0, 1, 2, 4, 5].some((i, j) => record?.[i] !== this.cachedClock[j])) {
        this.apply({ operationId: 0x0176, mode: 1, truthyBranch: false }, () => record);
      }
    }
    return this.channels ? { ...this.channels } : null;
  }

  snapshot() {
    return structuredClone({ frozen: this.frozen, channels: this.channels, cachedClock: this.cachedClock });
  }

  restore(snapshot) {
    const owned = structuredClone(snapshot);
    this.frozen = owned.frozen;
    this.channels = owned.channels;
    this.cachedClock = owned.cachedClock;
  }
}
