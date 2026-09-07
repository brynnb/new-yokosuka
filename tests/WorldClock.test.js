import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_GAME_TIME_MS,
  WORLD_WEATHER_NAMES,
  WorldClock,
  dateAtDebugHour,
  dateAtLightingCap,
  seasonIndexForDate,
} from "../play/world/WorldClock.js";
import { timeOfDayBlendForHour } from "../src/WorldTime.js";

test("offline world clock starts from the canonical fallback", () => {
  assert.equal(
    FALLBACK_GAME_TIME_MS,
    Date.UTC(1986, 5, 9, 8, 30),
  );
  let now = 1000;
  const clock = new WorldClock({ now: () => now });
  now += 5000;
  assert.equal(clock.gameDate().getTime(), FALLBACK_GAME_TIME_MS + 75000);
});

test("debug hours preserve the current game date", () => {
  const date = new Date(Date.UTC(1986, 5, 9, 8, 30));
  const adjusted = dateAtDebugHour(date, 21.5);
  assert.equal(adjusted.toISOString(), "1986-06-09T21:30:00.000Z");
});

test("dynamic lighting stops darkening at 7:45 PM", () => {
  const beforeCap = new Date(Date.UTC(1986, 5, 9, 19, 30));
  assert.equal(dateAtLightingCap(beforeCap), beforeCap);
  assert.equal(
    dateAtLightingCap(new Date(Date.UTC(1986, 5, 9, 22, 15))).toISOString(),
    "1986-06-09T19:45:00.000Z",
  );

  const clock = new WorldClock({
    fallbackGameTimeMs: Date.UTC(1986, 5, 9, 22, 15),
    now: () => 1_000,
  });
  const lighting = clock.lightingState({});
  assert.equal(lighting.date.toISOString(), "1986-06-09T22:15:00.000Z");
  assert.deepEqual(lighting.blend, timeOfDayBlendForHour(19.75));
});

test("server game hour updates the authoritative clock", async () => {
  const expected = {
    serverTimeMs: 2000,
    gameTimeMs: Date.UTC(1986, 5, 9, 12, 40),
  };
  let request = null;
  const clock = new WorldClock({ now: () => 1000 });
  clock.setDebugHour(9);
  const updated = await clock.setServerGameHour(12 + 40 / 60, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => expected };
    },
  });
  assert.equal(updated, true);
  assert.equal(request.url, "/api/world-state");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), { gameSecond: 45600 });
  assert.equal(clock.worldState, expected);
  assert.equal(clock.debugHour, null);
});

test("world environment uses server state and cutscene overrides", () => {
  const clock = new WorldClock({ now: () => 1000 });
  clock.setWorldState({
    gameTimeMs: Date.UTC(1986, 10, 29, 15),
    serverTimeMs: 1000,
    season: "winter",
    seasonIndex: 1,
    weather: "rain",
    weatherIndex: 2,
  }, 1000);
  assert.deepEqual(clock.environmentState({ interior: false }), {
    season: "winter",
    seasonIndex: 1,
    weather: "rain",
    weatherIndex: 2,
    precipitation: "rain",
  });
  assert.deepEqual(clock.environmentState({
    interior: true,
    fixedSeason: "winter",
    fixedWeather: "snow",
    weatherExposure: "outdoor",
  }), {
    season: "winter",
    seasonIndex: 1,
    weather: "snow",
    weatherIndex: 3,
    precipitation: "snow",
  });
  clock.setWorldState({
    gameTimeMs: Date.UTC(1986, 5, 9, 15),
    serverTimeMs: 1000,
    season: "summer",
    seasonIndex: 0,
    weather: "clear",
    weatherIndex: 0,
  }, 1000);
  assert.deepEqual(clock.environmentState({
    interior: true,
    fixedSeason: "winter",
    fixedWeather: "snow",
    weatherExposure: "outdoor",
  }), {
    season: "winter",
    seasonIndex: 1,
    weather: "snow",
    weatherIndex: 3,
    precipitation: "snow",
  });
  assert.equal(
    clock.environmentState({ interior: true }).precipitation,
    "clear",
  );
  assert.deepEqual(WORLD_WEATHER_NAMES, ["clear", "overcast", "rain", "snow"]);
});

test("offline season follows the game calendar", () => {
  assert.equal(seasonIndexForDate(new Date(Date.UTC(1986, 5, 9))), 0);
  assert.equal(seasonIndexForDate(new Date(Date.UTC(1986, 10, 29))), 1);
});
