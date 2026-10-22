import {
  gameDateFromWorldState,
  timeOfDayBlendForDate,
} from "../../src/WorldTime.js";
import nativeWeatherCatalog from "../data/shenmue1-native-weather.json" with { type: "json" };
import { NativeWeatherSchedule } from "./NativeWeatherSchedule.js";
import { nativeClockRecordFromGameDate } from "../events/NativeClockRecordRuntime.js";

const storyWeatherSchedule = new NativeWeatherSchedule(nativeWeatherCatalog);

// WAIR supplies exact sky resources and light RGB. Intensity/ambient/direction
// remain the browser's four presets: project those onto the clear-table light
// anchors (16,17,18,19), with dawn bounded by native sky changes (05:30,07:30).
// This is an explicit renderer adaptation, not a monthly astronomical sunset.
export function storyLightingBlend(date) {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60
    + date.getUTCSeconds() / 3600;
  let fromIndex = 3, toIndex = 3, progress = 0;
  if (hour >= 5.5 && hour < 7.5) {
    fromIndex = 3; toIndex = 0; progress = (hour - 5.5) / 2;
  } else if (hour >= 7.5 && hour < 16) {
    fromIndex = 0; toIndex = 0;
  } else if (hour >= 16 && hour < 19) {
    fromIndex = Math.floor(hour) - 16; toIndex = fromIndex + 1;
    progress = hour % 1;
  }
  return { fromIndex, toIndex, progress,
    presetIndex: progress < 0.5 ? fromIndex : toIndex };
}

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
    getPlayMode = () => "free",
  } = {}) {
    this.fallbackGameTimeMs = fallbackGameTimeMs;
    this.now = now;
    this.fallbackServerTimeMs = now();
    this.onClockChanged = onClockChanged;
    this.getPlayMode = getPlayMode;
    this.storySample = null;
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
    const native = this.storyEnvironment(world);
    const weather = native ? native.weather : weatherName(
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

  storyEnvironment(world, date = dateAtDebugHour(this.gameDate(), this.debugHour)) {
    if (this.getPlayMode() !== "story" || world?.assetFormat === "MT7" || world?.fixedWeather) return null;
    const key = Math.floor(date.getTime() / 1000);
    if (this.storySample?.key === key) return this.storySample;
    const record = nativeClockRecordFromGameDate(date);
    const channels = storyWeatherSchedule.sample(record);
    const light = storyWeatherSchedule.environment.sample(record, channels);
    const previous = this.storySample;
    const continuous = previous && key >= previous.key && key - previous.key <= 60;
    const sky = storyWeatherSchedule.environment.sky(record, channels, continuous ? previous.sky : null);
    this.storySample = { key, channels, sky,
      weather: channels.snow > 0 ? "snow" : channels.rain > 0 ? "rain"
        : channels.cloud > 0 ? "overcast" : "clear",
      lightingOverride: { dirDiffuse: light.values.slice(5, 8) },
    };
    return this.storySample;
  }

  lightingState(world) {
    const serverDate = this.gameDate();
    const date = dateAtDebugHour(serverDate, this.debugHour);
    const lightingDate = dateAtLightingCap(date);
    const fixedIndex = Number.isInteger(world?.fixedTimeOfDayIndex)
      ? world.fixedTimeOfDayIndex
      : null;
    const story = this.storyEnvironment(world, date);
    const blend = fixedIndex !== null
      ? {
        fromIndex: fixedIndex,
        toIndex: fixedIndex,
        progress: 0,
        presetIndex: fixedIndex,
      }
      : world?.interior && world.dynamicTimeOfDay !== true
        ? { fromIndex: 0, toIndex: 0, progress: 0, presetIndex: 0 }
        : story ? { ...storyLightingBlend(date), lightingOverride: story.lightingOverride,
          skyTextureUrl: story.sky.imagePath }
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
