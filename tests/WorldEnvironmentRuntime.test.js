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

test("native Story environment projects through shared lighting while cutscene and fixed worlds retain ownership", () => {
  const { runtime } = createRuntime();
  const applied = [];
  runtime.applyTimeOfDayLighting = blend => applied.push(blend);
  let reads = 0;
  runtime.getNativeWeatherEnvironment = () => {
    reads += 1;
    return { lightingOverride: { dirDiffuse: [.9, .8, .7] }, sky: { imagePath: "/textures/sky/air61.png" } };
  };
  runtime.synchronize();
  assert.deepEqual(applied.at(-1).lightingOverride, { dirDiffuse: [.9, .8, .7] });
  assert.equal(applied.at(-1).skyTextureUrl, "/textures/sky/air61.png");
  runtime.getCutsceneLightingPreset = () => 3;
  runtime.getCutsceneLightingOverride = () => ({ dirIntensity: .1 });
  runtime.synchronize();
  assert.equal(reads, 1, "cutscene ownership does not sample/mutate the Story environment");
  assert.equal(applied.at(-1).presetIndex, 3);
  assert.deepEqual(applied.at(-1).lightingOverride, { dirIntensity: .1 });
  assert.equal(applied.at(-1).skyTextureUrl, undefined);
  runtime.getCutsceneLightingPreset = () => null;
  for (const world of [{ id: "s2", assetFormat: "MT7" }, { id: "fixed", fixedWeather: "clear" }]) {
    runtime.getWorld = () => world;
    runtime.synchronize();
    assert.equal(reads, 1);
    assert.equal(applied.at(-1).lightingOverride, undefined);
    assert.equal(applied.at(-1).skyTextureUrl, undefined);
  }
});

test("native story weather reuses shared presentation without changing lighting or indoor exposure", () => {
  const { runtime, calls, sceneState } = createRuntime();
  let channels = { cloud: 1, rain: 0, snow: 0 };
  let world = { id: "interior", interior: true };
  runtime.getNativeWeather = () => channels;
  runtime.getWorld = () => world;
  runtime.synchronize();
  assert.equal(sceneState.currentWeather, "overcast");
  assert.equal(sceneState.currentTimeOfDay, 2);
  assert.deepEqual(calls.filter(c => Array.isArray(c) && c[0] === "weather").at(-1), ["weather", "clear"]);
  channels = { cloud: 1, rain: 1, snow: 0 };
  world = { id: "dobuita", interior: false };
  runtime.synchronize();
  assert.deepEqual(calls.filter(c => Array.isArray(c) && c[0] === "weather").at(-1), ["weather", "rain"]);
  channels = { cloud: 0, rain: 0, snow: 0 };
  world = { id: "fixed", fixedWeather: "snow" };
  assert.equal(runtime.capture(world).environment.weather, "rain", "fixed worlds keep the clock's resolved policy");
  world = { id: "s2", assetFormat: "MT7" };
  assert.equal(runtime.capture(world).environment.weather, "rain", "S1 curves must not leak into S2 worlds");
  runtime.getNativeWeather = () => null;
  world = { id: "free-roam" };
  assert.equal(runtime.capture(world).environment.weather, "rain", "uninitialized/free-roam keeps server weather");
});

test("shot lighting survives periodic clock updates and disappears when released", () => {
  const { runtime } = createRuntime();
  let index = 3;
  const override = { hemiIntensity: 0.45, hemiDiffuse: [0.4, 0.47, 0.7] };
  runtime.getCutsceneLightingPreset = () => index;
  runtime.getCutsceneLightingOverride = () => override;
  const blends = [];
  runtime.applyTimeOfDayLighting = blend => blends.push(blend);
  runtime.synchronize();
  runtime.synchronize();
  assert.deepEqual(blends, Array(2).fill({ fromIndex: 3, toIndex: 3, progress: 0,
    presetIndex: 3, lightingOverride: override }));
  index = null;
  runtime.synchronize();
  assert.deepEqual(blends.at(-1), { presetIndex: 2 });
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

test("cinematic precipitation stays overridden on timer updates without changing settled snow variants", () => {
  const { runtime, calls, sceneState } = createRuntime({ environment: {
    seasonIndex: 1, weather: "snow", weatherIndex: 3, precipitation: "snow",
  } });
  let precipitation = "clear";
  runtime.getCutscenePrecipitation = () => precipitation;
  runtime.synchronize();
  runtime.synchronize();
  assert.equal(sceneState.currentWeather, "snow");
  assert.equal(sceneState.currentWeatherIndex, 3);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "weather"),
    [["weather", "clear"], ["weather", "clear"]]);
  precipitation = null;
  runtime.synchronize();
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "weather").at(-1), ["weather", "snow"]);
});

test("isolated stages suppress sky and weather until the last release, then catch up to server state", () => {
  const environment = { weather: "rain", precipitation: "rain" };
  const { runtime, calls, sceneState } = createRuntime({ environment });
  const sky = { enabled: true, isEnabled() { return this.enabled; },
    setEnabled(value) { this.enabled = value; }, isDisposed: () => false };
  sceneState.currentSkybox = sky;
  runtime.synchronize();
  calls.length = 0;
  const release = runtime.acquireIsolatedStage();
  const releaseOther = runtime.acquireIsolatedStage();
  assert.equal(sky.enabled, false);
  assert.deepEqual(calls, [["weather", "clear"]]);
  calls.length = 0;
  environment.weather = environment.precipitation = "snow";
  runtime.synchronize();
  assert.deepEqual(calls, ["music", "date", "debug"]);
  assert.equal(sceneState.currentWeather, "rain", "applied cache is not advanced while presentation is borrowed");
  release();
  assert.equal(sky.enabled, false);
  releaseOther();
  assert.equal(sky.enabled, true);
  assert.equal(sceneState.currentWeather, "snow");
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "weather" && call[1] === "snow"));
  const count = calls.length;
  releaseOther();
  assert.equal(calls.length, count, "release is idempotent");
  sky.enabled = false;
  runtime.acquireIsolatedStage()();
  assert.equal(sky.enabled, false, "an already hidden sky stays hidden");
});
