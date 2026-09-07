import {
  gameDateFromWorldState,
  timeOfDayBlendForDate,
} from "../../src/WorldTime.js";

export const FALLBACK_GAME_TIME_MS = Date.UTC(1986, 5, 9, 8, 30);
export const LATEST_DYNAMIC_LIGHTING_HOUR = 19.75;
export const WORLD_WEATHER_NAMES = Object.freeze([
  "clear",
  "overcast",
  "rain",
  "snow",
]);

export function seasonIndexForDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 0;
  const month = date.getUTCMonth();
  return month >= 10 || month <= 2 ? 1 : 0;
}

function seasonIndex(value, name, date) {
  if (value === 0 || value === 1) return value;
  const normalized = String(name || "").trim().toLowerCase();
  if (normalized === "summer") return 0;
  if (normalized === "winter") return 1;
  return seasonIndexForDate(date);
}

function weatherName(value, index) {
  const normalized = String(value || "").trim().toLowerCase();
  if (WORLD_WEATHER_NAMES.includes(normalized)) return normalized;
  return WORLD_WEATHER_NAMES[index] || "clear";
}

export function dateAtDebugHour(date, hour) {
  if (!Number.isFinite(hour)) return date;
  const totalMinutes = Math.round(hour * 60) % (24 * 60);
  const result = new Date(date);
  result.setUTCHours(
    Math.floor(totalMinutes / 60),
    totalMinutes % 60,
    0,
    0,
  );
  return result;
}

export function dateAtLightingCap(date) {
  const hour = (
    date.getUTCHours()
    + date.getUTCMinutes() / 60
    + date.getUTCSeconds() / 3600
    + date.getUTCMilliseconds() / 3_600_000
  );
  if (hour <= LATEST_DYNAMIC_LIGHTING_HOUR) return date;
  const result = new Date(date);
  const capHour = Math.floor(LATEST_DYNAMIC_LIGHTING_HOUR);
  const capMinute = Math.round(
    (LATEST_DYNAMIC_LIGHTING_HOUR - capHour) * 60,
  );
  result.setUTCHours(capHour, capMinute, 0, 0);
  return result;
}

export class WorldClock {
  constructor({
    fallbackGameTimeMs = FALLBACK_GAME_TIME_MS,
    now = () => Date.now(),
    onClockChanged = () => {},
  } = {}) {
    this.fallbackGameTimeMs = fallbackGameTimeMs;
    this.now = now;
    this.fallbackServerTimeMs = now();
    this.onClockChanged = onClockChanged;
    this.worldState = null;
    this.serverClockOffsetMs = 0;
    this.debugHour = null;
  }

  gameDate() {
    return gameDateFromWorldState(
      this.worldState,
      this.now(),
      this.fallbackGameTimeMs,
      this.fallbackServerTimeMs,
    );
  }

  serverWallTimeMs() {
    return this.now() + this.serverClockOffsetMs;
  }

  setWorldState(worldState, receivedAtMs = this.now()) {
    this.worldState = worldState;
    if (Number.isFinite(worldState?.serverTimeMs)) {
      this.serverClockOffsetMs = worldState.serverTimeMs - receivedAtMs;
    }
    this.onClockChanged();
  }

  environmentState(world) {
    const date = this.gameDate();
    const fixedSeasonIndex = Number.isInteger(world?.fixedSeasonIndex)
      ? world.fixedSeasonIndex
      : null;
    const fixedSeasonName = String(world?.fixedSeason || "")
      .trim()
      .toLowerCase();
    const hasFixedSeasonName = (
      fixedSeasonName === "summer" || fixedSeasonName === "winter"
    );
    const resolvedSeasonIndex = seasonIndex(
      fixedSeasonIndex ?? (
        hasFixedSeasonName ? null : this.worldState?.seasonIndex
      ),
      hasFixedSeasonName ? fixedSeasonName : this.worldState?.season,
      date,
    );
    const weather = weatherName(
      world?.fixedWeather ?? this.worldState?.weather,
      this.worldState?.weatherIndex,
    );
    const exposed = world?.weatherExposure === "outdoor"
      || world?.interior !== true;
    return Object.freeze({
      season: resolvedSeasonIndex === 1 ? "winter" : "summer",
      seasonIndex: resolvedSeasonIndex,
      weather,
      weatherIndex: WORLD_WEATHER_NAMES.indexOf(weather),
      precipitation: exposed ? weather : "clear",
    });
  }

  setDebugHour(hour) {
    this.debugHour = Number.isFinite(hour) ? hour : null;
  }

  lightingState(world) {
    const serverDate = this.gameDate();
    const date = dateAtDebugHour(serverDate, this.debugHour);
    const lightingDate = dateAtLightingCap(date);
    const fixedIndex = Number.isInteger(world?.fixedTimeOfDayIndex)
      ? world.fixedTimeOfDayIndex
      : null;
    const blend = fixedIndex !== null
      ? {
        fromIndex: fixedIndex,
        toIndex: fixedIndex,
        progress: 0,
        presetIndex: fixedIndex,
      }
      : world?.interior && world.dynamicTimeOfDay !== true
        ? { fromIndex: 0, toIndex: 0, progress: 0, presetIndex: 0 }
        : timeOfDayBlendForDate(lightingDate);
    return { serverDate, date, blend };
  }

  async fetchInitial({
    url = "/api/world-state",
    timeoutMs = 800,
    fetchImpl = fetch,
  } = {}) {
    const abortController = new AbortController();
    const timeout = globalThis.setTimeout(
      () => abortController.abort(),
      timeoutMs,
    );
    try {
      const response = await fetchImpl(url, {
        signal: abortController.signal,
      });
      if (!response.ok) return false;
      this.setWorldState(await response.json());
      return true;
    } catch {
      return false;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async setServerGameHour(hour, {
    url = "/api/world-state",
    fetchImpl = fetch,
  } = {}) {
    if (!Number.isFinite(hour)) return false;
    const response = await fetchImpl(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSecond: Math.round(hour * 60 * 60) }),
    });
    if (!response.ok) return false;
    this.setWorldState(await response.json());
    this.setDebugHour(null);
    return true;
  }
}
