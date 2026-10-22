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

test("Story uses its calendar's native sky/weather and continues past the Free roam light cap", () => {
  let mode = "story";
  const clock = new WorldClock({ now: () => 1_000, getPlayMode: () => mode });
  const at = (day, hour, minute = 0) => clock.setWorldState({
    gameTimeMs: Date.UTC(1986, 11, day, hour, minute), serverTimeMs: 1_000,
    dayStartHour: 0, dayEndHour: 24, paused: true, weather: "clear",
  });
  const world = { id: "dobuita" };
  at(3, 16, 29); assert.equal(clock.storyEnvironment(world).sky.index, 1);
  at(3, 16, 30); assert.equal(clock.storyEnvironment(world).sky.index, 2);
  at(3, 17, 59); assert.equal(clock.storyEnvironment(world).sky.index, 2);
  at(3, 18); assert.equal(clock.storyEnvironment(world).sky.index, 3);
  const evening = clock.lightingState(world).blend;
  assert.deepEqual(evening.lightingOverride.dirDiffuse.map(n => Math.round(n * 100)), [93, 77, 75]);
  at(3, 23); assert.equal(clock.lightingState(world).blend.presetIndex, 3);
  assert.equal(clock.lightingState(world).date.getUTCHours(), 23);
  // Dec 3 dawn is cloudy; use the source's clear Dec 4 dawn for sky boundaries.
  at(4, 5, 29); assert.equal(clock.storyEnvironment(world).sky.index, 3);
  at(4, 5, 30); assert.equal(clock.storyEnvironment(world).sky.index, 0);
  at(4, 7, 30); assert.equal(clock.storyEnvironment(world).sky.index, 1);
  at(7, 18); assert.equal(clock.environmentState(world).weather, "rain");
  assert.equal(clock.storyEnvironment(world).sky.index, 4);
  at(11, 18); assert.equal(clock.environmentState(world).weather, "snow");
  assert.equal(clock.environmentState({ interior: true }).precipitation, "clear");
  assert.equal(clock.storyEnvironment({ fixedWeather: "clear" }), null);
  assert.equal(clock.storyEnvironment({ assetFormat: "MT7" }), null);
  assert.equal(clock.lightingState({ fixedTimeOfDayIndex: 0 }).blend.lightingOverride, undefined);
  assert.equal(clock.lightingState({ interior: true }).blend.lightingOverride, undefined);
  mode = "free_roam";
  assert.equal(clock.environmentState(world).weather, "clear", "shared server weather is unchanged");
  at(3, 23);
  assert.deepEqual(clock.lightingState(world).blend, timeOfDayBlendForHour(19.75));
  mode = "story";
  assert.equal(clock.lightingState(world).blend.presetIndex, 3);
});

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

test("personal scene pause holds calendar and lighting but not wall-clock deadlines", () => {
  let now = 1_000;
  const clock = new WorldClock({ now: () => now });
  const gameTimeMs = Date.UTC(1986, 11, 25, 19, 16);
  clock.setWorldState({ gameTimeMs, serverTimeMs: now, paused: true });
  const lighting = clock.lightingState({});
  now += 30_000;
  assert.equal(clock.gameDate().getTime(), gameTimeMs);
  assert.deepEqual(clock.lightingState({}), lighting);
  assert.equal(clock.serverWallTimeMs(), now);

  // Periodic paused snapshots update the wall offset without moving the game.
  clock.setWorldState({ gameTimeMs, serverTimeMs: now, paused: true });
  now += 1_000;
  assert.equal(clock.gameDate().getTime(), gameTimeMs);
  assert.equal(clock.serverWallTimeMs(), now);

  clock.setWorldState({ gameTimeMs, serverTimeMs: now, paused: false });
  assert.equal(clock.gameDate().getTime(), gameTimeMs);
  now += 1_000;
  assert.equal(clock.gameDate().getTime(), gameTimeMs + 15_000);
});

test("personal full-day snapshots interpolate across bedtime and midnight without the public skip",()=>{
  let now=1_000;const clock=new WorldClock({now:()=>now});
  const saved=Date.UTC(1986,11,31,23,59,30);
  clock.setWorldState({gameTimeMs:saved,serverTimeMs:now,dayLengthMs:96*60_000,dayStartHour:0,dayEndHour:24});
  assert.equal(clock.gameDate().getTime(),saved);now+=4_000;
  assert.equal(clock.gameDate().toISOString(),"1987-01-01T00:00:30.000Z");
  const late=Date.UTC(1986,11,30,23,45);
  clock.setWorldState({gameTimeMs:late,serverTimeMs:now,dayLengthMs:96*60_000,dayStartHour:0,dayEndHour:24,paused:true});
  now+=90_000;assert.equal(clock.gameDate().getTime(),late);
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
