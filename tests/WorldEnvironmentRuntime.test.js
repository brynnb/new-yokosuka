import assert from "node:assert/strict";
import test from "node:test";

import {
  WorldEnvironmentRuntime,
} from "../play/world/WorldEnvironmentRuntime.js";

function createRuntime({ environment = {}, lighting = {} } = {}) {
  const calls = [];
  const sceneState = {
    currentSeason: 0,
    currentWeather: "clear",
    currentWeatherIndex: 0,
    currentTimeOfDay: 0,
  };
  const clock = {
    debugHour: null,
    environmentState: () => ({
      seasonIndex: 1,
      weather: "rain",
      weatherIndex: 2,
      precipitation: "rain",
      ...environment,
    }),
    lightingState: () => ({
      serverDate: new Date("1986-12-04T10:00:00Z"),
      date: new Date("1986-12-04T10:00:00Z"),
      blend: { presetIndex: 2 },
      ...lighting,
    }),
  };
  const runtime = new WorldEnvironmentRuntime({
    clock,
    weather: {
      setOccluders: () => calls.push("occluders"),
      apply: value => calls.push(["weather", value]),
      clear: () => calls.push("clear-weather"),
    },
    sceneState,
    getWorld: () => ({ id: "dobuita" }),
    getReady: () => true,
    isSwitching: () => false,
    getWater: () => "water",
    getMeshes: () => ["mesh"],
    getCutsceneLightingPreset: () => null,
    dailyMusicCue: { update: () => calls.push("music") },
    setWorldDate: () => calls.push("date"),
    updateDebugClock: () => calls.push("debug"),
    showDayRollover: () => calls.push("rollover"),
    getMovementLocked: () => false,
    setMovementLocked: value => calls.push(["locked", value]),
    updateSceneLighting: () => calls.push("scene-lighting"),
    applyTimeOfDay: value => calls.push(["time", value]),
    updateModelVisibility: () => calls.push("visibility"),
    updateMapLayer: () => calls.push("map-layer"),
    applyTimeOfDayLighting: () => calls.push("lighting"),
    applyWaterTimeOfDay: () => calls.push("water"),
  });
  return { calls, runtime, sceneState };
}

test("environment synchronization applies changed time, season, and weather once", () => {
  const { calls, runtime, sceneState } = createRuntime();

  assert.equal(runtime.synchronize(), true);
  assert.equal(sceneState.currentSeason, 1);
  assert.equal(sceneState.currentWeather, "rain");
  assert.equal(sceneState.currentWeatherIndex, 2);
  assert.equal(sceneState.currentTimeOfDay, 2);
  assert.deepEqual(calls, [
    "music",
    "date",
    "debug",
    "scene-lighting",
    ["time", 2],
    "visibility",
    "occluders",
    "map-layer",
    ["weather", "rain"],
    "lighting",
    "water",
  ]);
});

test("day rollover temporarily owns and restores the movement lock", async () => {
  const { calls, runtime } = createRuntime();
  await runtime.showDayRollover(new Date("1986-12-05T08:30:00Z"));
  assert.deepEqual(calls, [
    ["locked", true],
    "rollover",
    ["locked", false],
  ]);
});

test("disposing the environment stops its synchronization timer", () => {
  const { runtime } = createRuntime();
  let scheduled = null;
  let cleared = null;
  runtime.start((callback, delay) => {
    scheduled = { callback, delay };
    return 42;
  });
  runtime.dispose(timer => { cleared = timer; });
  assert.equal(scheduled.delay, 250);
  assert.equal(typeof scheduled.callback, "function");
  assert.equal(cleared, 42);
});
