import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/data/shenmue1-native-weather.json" with { type: "json" };
import { NativeWeatherEnvironmentSchedule, nativeWeatherColorLerp, nativeWeatherLerp } from "../play/world/NativeWeatherEnvironment.js";

const schedule = new NativeWeatherEnvironmentSchedule(catalog.environment);
const clock = (h, m = 0, s = 0) => [86, 12, 3, 3, h, m, s];
const clear = { cloud: 0, rain: 0, snow: 0 };

test("all forty source environment keyframes and midnight wrap are preserved", () => {
  let count = 0;
  for (let index = 0; index < schedule.tables.length; index += 1) {
    const records = schedule.tables[index];
    for (const record of records) {
      assert.deepEqual(schedule.sampleTable(index, record[0]), record);
      count += 1;
    }
    const last = records.at(-1);
    const midnight = records[0];
    const halfway = schedule.sampleTable(index, 84600);
    for (const j of schedule.floatIndices) assert.equal(halfway[j], nativeWeatherLerp(last[j], midnight[j], .5));
    for (const j of schedule.colorIndices) assert.equal(halfway[j], nativeWeatherColorLerp(last[j], midnight[j], .5));
  }
  assert.equal(count, 40);
  assert.equal(nativeWeatherColorLerp(0xffffffff, 0, .5), 0x80808080,
    "decreasing packed colors truncate their signed delta, not the final channel");
  assert.equal(nativeWeatherColorLerp(0, 0xffffffff, .5), 0x7f7f7f7f);
});

test("weather table weights follow source daylight suppression and independently retained rain/snow", () => {
  assert.deepEqual(schedule.weights(clock(8, 55), clear), [1, 0, 0, 0]);
  assert.deepEqual(schedule.weights(clock(8), { cloud: 1, rain: 0, snow: 0 }), [0, 1, 0, 0]);
  assert.deepEqual(schedule.weights(clock(8), { cloud: 1, rain: 1, snow: 0 }), [0, 0, 1, 0]);
  assert.deepEqual(schedule.weights(clock(3), { cloud: 1, rain: 1, snow: 0 }), [0, .5, .5, 0]);
  assert.deepEqual(schedule.weights(clock(8), { cloud: 0, rain: 1, snow: 1 }), [0, 0, .5, .5]);
  assert.deepEqual(schedule.sample(clock(8), clear).values.slice(1), schedule.tables[0][4].slice(1));
  assert.equal(schedule.sample(clock(8), clear).values[0], 0, "native weighted output clears the time word");
  const transition = schedule.weights(clock(17, 15), { cloud: 1, rain: 1 / 3, snow: 0 });
  assert.equal(transition[0], 0);
  assert.ok(transition[1] > 0 && transition[1] < .5);
  assert.ok(transition[2] > .5 && transition[2] < 1);
  assert.equal(transition[3], 0);
});

test("initial and evolving sky selection retain native threshold asymmetry and hysteresis", () => {
  for (const [h, m, expected] of [[5, 29, 3], [5, 30, 0], [7, 29, 0], [7, 30, 1],
    [16, 29, 1], [16, 30, 2], [17, 59, 2], [18, 0, 3]]) {
    assert.equal(schedule.sky(clock(h, m), clear).index, expected);
  }
  assert.equal(schedule.sky(clock(8), { ...clear, cloud: .25 }).index, 1);
  const cloudy = schedule.sky(clock(8), { ...clear, cloud: .25 }, { cloud: 0, precipitation: 0 });
  assert.equal(cloudy.index, 5, "initial >.25 differs from update >=.25");
  assert.equal(schedule.sky(clock(8), { ...clear, cloud: Math.fround(.2) }, cloudy).index, 5);
  assert.equal(schedule.sky(clock(8), { ...clear, cloud: .19 }, cloudy).index, 1);
  const rain = schedule.sky(clock(8), { ...clear, rain: Math.fround(.1) });
  assert.equal(rain.resource, "SPRITE/SCROLL64.SPR");
  assert.equal(rain.imagePath, "/textures/sky/air64.png");
  assert.equal(schedule.sky(clock(8), { ...clear, rain: Math.fround(.05) }, rain).index, 4);
  assert.equal(schedule.sky(clock(8), { ...clear, rain: .04 }, rain).index, 1);
});

test("invalid time/tables/channels stop rather than inventing a daylight environment", () => {
  for (const bad of [null, {}, { ...clear, cloud: NaN }, { ...clear, rain: -1 }, { ...clear, snow: 2 }]) {
    assert.throws(() => schedule.sample(clock(8), bad));
  }
  for (const bad of [null, [], clock(24), clock(8, 60), clock(8, 0, 60)]) assert.throws(() => schedule.sample(bad, clear));
  for (const change of [c => { c.tables[0].recordWords[1][0] = 0; },
    c => { c.tables[1].recordWords[0][5] = 0x7fc00000; }, c => { c.tables[0].recordWords[0].pop(); }]) {
    const damaged = structuredClone(catalog.environment);
    change(damaged);
    assert.throws(() => new NativeWeatherEnvironmentSchedule(damaged));
  }
});
