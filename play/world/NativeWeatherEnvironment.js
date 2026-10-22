const f32 = Math.fround;
const EPSILON = 2 ** -23;
const wordView = new DataView(new ArrayBuffer(4));

export function nativeWeatherLerp(from, to, progress) {
  let delta = f32(to - from);
  if (Math.abs(delta) < EPSILON) delta = 0;
  else {
    delta = f32(delta * progress);
    if (Math.abs(delta) < EPSILON) delta = 0;
  }
  return f32(from + delta);
}

function floatFromWord(word) {
  wordView.setUint32(0, word, true);
  return wordView.getFloat32(0, true);
}

// 0xc0ecf2c truncates the signed difference BEFORE adding the starting
// channel. Math.trunc(from + difference * t) is wrong for decreasing colors.
export function nativeWeatherColorLerp(from, to, progress) {
  let word = 0;
  for (const shift of [24, 16, 8, 0]) {
    const a = (from >>> shift) & 255;
    const b = (to >>> shift) & 255;
    word |= (a + Math.trunc(f32((b - a) * progress))) << shift;
  }
  return word >>> 0;
}

function addColors(from, to) {
  let word = 0;
  for (const shift of [24, 16, 8, 0]) {
    word |= Math.min(255, ((from >>> shift) & 255) + ((to >>> shift) & 255)) << shift;
  }
  return word >>> 0;
}

function requireClock(record) {
  if ((!Array.isArray(record) && !(record instanceof Uint8Array)) || record.length !== 7
    || Array.from(record).some(b => !Number.isInteger(b) || b < 0 || b > 255)
    || record[1] < 1 || record[1] > 12 || record[2] < 1 || record[2] > 31
    || record[4] > 23 || record[5] > 59 || record[6] > 59) {
    throw new TypeError("native environment requires a valid seven-byte clock record");
  }
  return record[4] * 3600 + record[5] * 60 + record[6];
}

function requireChannels(channels) {
  if (["cloud", "rain", "snow"].some(k => !Number.isFinite(channels?.[k]) || channels[k] < 0 || channels[k] > 1)) {
    throw new TypeError("native WAIR weather channels are unavailable");
  }
}

/** Original 100-byte environment records, separate from renderer policy. */
export class NativeWeatherEnvironmentSchedule {
  constructor(catalog) {
    if (catalog?.ownerTag !== "WAIR" || catalog.recordBytes !== 100 || catalog.daySeconds !== 86400
      || catalog.coldMask !== 0x1fff || catalog.tables?.length !== 4
      || catalog.skyResources?.length !== 6) throw new TypeError("native WAIR catalog is unavailable");
    this.floatIndices = Object.freeze([...catalog.floatWordIndices]);
    this.colorIndices = Object.freeze([...catalog.colorWordIndices]);
    if (JSON.stringify(this.floatIndices) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 19, 20, 21])
      || JSON.stringify(this.colorIndices) !== JSON.stringify([10, 11, 12, 16, 17, 18, 22, 23, 24])) {
      throw new TypeError("native WAIR record layout changed");
    }
    this.tables = Object.freeze(catalog.tables.map((table, index) => {
      if (table.channel !== ["clear", "cloud", "rain", "snow"][index]
        || !Array.isArray(table.recordWords) || table.recordWords.length < 2) {
        throw new TypeError("native WAIR table is malformed");
      }
      const records = table.recordWords.map((words, i) => {
        if (!Array.isArray(words) || words.length !== 25
          || words.some(w => !Number.isInteger(w) || w < 0 || w > 0xffffffff)
          || words[0] >= 86400 || (i === 0 && words[0] !== 0)
          || (i > 0 && words[0] <= table.recordWords[i - 1][0])) {
          throw new TypeError("native WAIR record is malformed");
        }
        const values = [...words];
        for (const j of this.floatIndices) values[j] = floatFromWord(words[j]);
        if (values.some(v => !Number.isFinite(v))) throw new TypeError("native WAIR float is not finite");
        return Object.freeze(values);
      });
      return Object.freeze(records);
    }));
    this.skyResources = Object.freeze([...catalog.skyResources]);
    this.skyImages = Object.freeze(catalog.skyResourceRecords.map((resource, i) => {
      if (resource.resource !== this.skyResources[i] || !resource.tiles?.length
        || !resource.tiles[0].imagePath?.startsWith("/textures/sky/")) {
        throw new TypeError("native WAIR sky image metadata is unavailable");
      }
      return resource.tiles[0].imagePath;
    }));
    this.coldMask = catalog.coldMask;
    this.coldFlags = Object.freeze({ ...catalog.coldFlags });
    this.skySelection = Object.freeze({ ...catalog.skySelection,
      minuteBoundaries: Object.freeze([...catalog.skySelection.minuteBoundaries]),
      indices: Object.freeze([...catalog.skySelection.indices]) });
  }

  weights(record, channels) {
    requireClock(record);
    requireChannels(channels);
    const rawRain = f32(channels.rain * 3);
    const rawSnow = f32(channels.snow * 3);
    const rain = Math.min(1, rawRain);
    const snow = Math.min(1, rawSnow);
    // Native HHMM uses minute/60*100, not base-100 clock minutes.
    const hhmm = record[4] * 100 + Math.trunc(f32(f32(record[5] / 60) * 100));
    const daylight = hhmm < 600 || hhmm >= 1800 ? 0
      : hhmm > 1650 ? f32(f32(1800 - hhmm) / 150) : 1;
    const cloud = Math.max(0, f32(Math.min(1, f32(channels.cloud * 3))
      - f32(Math.max(rawRain, rawSnow) * daylight)));
    const clear = f32(1 - Math.max(cloud, rain, snow));
    const sum = f32(f32(f32(clear + cloud) + rain) + snow);
    return [clear, cloud, rain, snow].map(weight => {
      const normalized = f32(weight / sum);
      return Math.abs(normalized) < EPSILON ? 0 : normalized;
    });
  }

  sampleTable(index, seconds) {
    if (!Number.isInteger(index) || !this.tables[index]
      || !Number.isInteger(seconds) || seconds < 0 || seconds >= 86400) {
      throw new RangeError("native WAIR sample is outside the source day");
    }
    const records = this.tables[index];
    let low = 0;
    let high = records.length;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (records[middle][0] <= seconds) low = middle;
      else high = middle;
    }
    const from = records[low];
    const to = records[high] ?? records[0];
    const nextKey = high === records.length ? 86400 : to[0];
    const progress = f32(f32(seconds - from[0]) / f32(nextKey - from[0]));
    const values = [seconds];
    for (const j of this.floatIndices) values[j] = nativeWeatherLerp(from[j], to[j], progress);
    for (const j of this.colorIndices) values[j] = nativeWeatherColorLerp(from[j], to[j], progress);
    return values;
  }

  sample(record, channels) {
    const seconds = requireClock(record);
    const weights = this.weights(record, channels);
    const values = Array(25).fill(0);
    for (let table = 0; table < weights.length; table += 1) {
      if (weights[table] <= 0) continue;
      const sample = this.sampleTable(table, seconds);
      for (const j of this.floatIndices) values[j] = f32(values[j] + nativeWeatherLerp(0, sample[j], weights[table]));
      for (const j of this.colorIndices) values[j] = addColors(values[j], nativeWeatherColorLerp(0, sample[j], weights[table]));
    }
    // 0xc1bd33a's weighted accumulator leaves offset zero cleared.
    return { seconds, weights, values };
  }

  sky(record, channels, previous = null) {
    requireClock(record);
    requireChannels(channels);
    const rules = this.skySelection;
    const precipitation = previous?.precipitation
      ? channels.rain >= f32(rules.precipitationExitThreshold) || channels.snow >= f32(rules.precipitationExitThreshold)
      : channels.rain >= f32(rules.precipitationThreshold) || channels.snow >= f32(rules.precipitationThreshold);
    // Initial selection is strictly >0.25; the per-frame enter test is >=.
    const cloud = previous?.cloud ? channels.cloud >= f32(rules.cloudExitThreshold)
      : previous ? channels.cloud >= f32(rules.cloudThreshold) : channels.cloud > f32(rules.cloudThreshold);
    const minute = record[4] * 60 + record[5];
    const interval = rules.minuteBoundaries.findIndex(boundary => minute < boundary);
    const index = precipitation ? 4 : cloud ? 5 : rules.indices[interval < 0 ? rules.indices.length - 1 : interval];
    return { precipitation: Number(precipitation), cloud: Number(cloud), index,
      resource: this.skyResources[index], imagePath: this.skyImages[index] };
  }
}
