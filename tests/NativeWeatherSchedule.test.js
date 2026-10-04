import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/data/shenmue1-native-weather.json" with { type: "json" };
import { NativeWeatherSchedule, NativeWeatherControllerState, nativeWeatherDateKey } from "../play/world/NativeWeatherSchedule.js";

const schedule = new NativeWeatherSchedule(catalog);
const clock = (hour, minute = 0) => [86, 12, 3, 3, hour, minute, 0];

test("weather uses original packed calendar boundaries rather than Date rollover", () => {
  assert.equal(nativeWeatherDateKey(clock(8, 55)), 0x0c1a37);
  assert.equal(nativeWeatherDateKey([85, 12, 3, 3, 8, 55, 0]), 0x010800);
  assert.equal(nativeWeatherDateKey([102, 1, 1, 0, 0, 0, 0]), 0xfcfdfb);
  assert.equal(nativeWeatherDateKey([86, 13, 1, 0, 0, 0, 0]), 0x0cfdfb);
  assert.equal(nativeWeatherDateKey([86, 12, 3, 3, 24, 255, 0]), 0x0c1dfb);
  for (const bad of [null, [], clock(8).slice(1), [86, 12, 3, 3, 8, NaN, 0], [86, 12, 3, 3, 256, 0, 0]]) {
    assert.throws(() => nativeWeatherDateKey(bad), /exact seven-byte/);
  }
});

test("source weather records reproduce December 3 values and packed-coordinate interpolation", () => {
  assert.deepEqual(schedule.sample(clock(1, 30)), { packedDate: 0xc185e, cloud: 1, rain: 0, snow: 0 });
  assert.equal(schedule.sample(clock(4, 30)).cloud, Math.fround(95 / 255));
  const from = Math.fround(95 / 255);
  const expected = Math.fround(from + Math.fround(-from * Math.fround(15 / 34)));
  assert.equal(schedule.sample(clock(5, 45)).cloud, expected, "5:30 to 6:00 spans 34 packed units, not 30");
  assert.deepEqual(schedule.sample(clock(8, 55)), { packedDate: 0xc1a37, cloud: 0, rain: 0, snow: 0 });
  for (const [tag, channel] of [["CLUD", "cloud"], ["RAIN", "rain"], ["SNOW", "snow"]]) {
    for (const word of catalog.curves[tag].slice(0, -1)) {
      const key = word & 0xffffff;
      const record = [86 + (key >>> 20), (key >>> 16) & 15, (key >>> 11) & 31, 0, (key >>> 6) & 31, key & 63, 0];
      assert.equal(schedule.sample(record)[channel], Math.fround((word >>> 24) / 255));
    }
  }
});

test("invalid curves, unavailable intervals and caller mutation cannot fabricate clear weather", () => {
  const copy = structuredClone(catalog);
  const owned = new NativeWeatherSchedule(copy);
  copy.curves.CLUD.fill(0);
  assert.equal(owned.sample(clock(1, 30)).cloud, 1);
  for (const change of [c => { c.curves.RAIN = null; }, c => { c.curves.SNOW[1] = c.curves.SNOW[0]; },
    c => { c.curves.CLUD[0] = NaN; }, c => { c.schema = "unknown"; }]) {
    const bad = structuredClone(catalog);
    change(bad);
    assert.throws(() => new NativeWeatherSchedule(bad));
  }
  assert.throws(() => schedule.sample([101, 12, 31, 0, 23, 59, 0]), /no source interval/);
});

test("weather control refreshes atomically, freezes without reading, and only follows an enabled clock", () => {
  const state = new NativeWeatherControllerState(schedule);
  const refresh = { operationId: 0x0176, mode: 1, truthyBranch: false };
  const freeze = { ...refresh, truthyBranch: true };
  assert.equal(state.synchronize(undefined, () => { throw Error("should not read"); }), null);
  state.apply(refresh, () => clock(1, 30));
  const before = state.snapshot();
  assert.equal(before.frozen, 0);
  assert.equal(before.channels.cloud, 1);
  assert.throws(() => state.apply(refresh, () => null), /exact seven-byte/);
  assert.deepEqual(state.snapshot(), before);
  state.apply(freeze, () => { throw Error("should not read"); });
  assert.equal(state.synchronize(1, () => clock(8, 55)).cloud, 1);
  state.restore(before);
  assert.equal(state.synchronize(0, () => clock(8, 55)).cloud, 1);
  assert.equal(state.synchronize(1, () => clock(8, 55)).cloud, 0);
  const cached = state.snapshot();
  state.synchronize(1, () => clock(8, 55));
  assert.deepEqual(state.snapshot(), cached);
  cached.channels.cloud = 100;
  assert.equal(state.snapshot().channels.cloud, 0);
  assert.equal(state.apply({ ...refresh, mode: 12 }, () => clock(8)).status, "stopped");
  assert.equal(state.apply({ operationId: 0x0176, mode: 1 }, () => clock(8)).status, "stopped");
});
