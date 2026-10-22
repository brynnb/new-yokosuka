import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/data/shenmue1-native-weather.json" with { type: "json" };
import { NativePrecipitationFieldState, nativePrecipitationExcluded, prepareNativePrecipitationExclusion } from "../play/world/NativePrecipitationFields.js";
import { nativeFloat32Word } from "../play/events/NativeEventNumericRuntime.js";
import { NativeWeatherSchedule, NativeWeatherControllerState } from "../play/world/NativeWeatherSchedule.js";

const vertices = [[2, 2], [0, 2], [0, 0], [2, 0]];
const bounds = { operationId: 0x0179, mode: 38,
  vectorWordGroups: vertices.map(point => point.map(nativeFloat32Word)),
  scalarFloatWords: [-1, 3.3].map(nativeFloat32Word) };

test("native dry volume uses inclusive Y, strict authored winding and float32 edges", () => {
  const volume = prepareNativePrecipitationExclusion({ vertices, lower: -1, upper: 3 });
  assert.equal(nativePrecipitationExcluded(volume, 1, 0, 1), true);
  assert.equal(nativePrecipitationExcluded(volume, 1, -1, 1), true);
  assert.equal(nativePrecipitationExcluded(volume, 1, 3, 1), true);
  for (const point of [[0, 0, 1], [2, 0, 1], [1, 0, 0], [1, 0, 2], [1, -2, 1], [1, 4, 1], [3, 0, 1]]) {
    assert.equal(nativePrecipitationExcluded(volume, ...point), false);
  }
  const reversed = prepareNativePrecipitationExclusion({ vertices: [...vertices].reverse(), lower: -1, upper: 3 });
  assert.equal(nativePrecipitationExcluded(reversed, 1, 0, 1), false, "never guess a winding repair");
  const invalidHeights = prepareNativePrecipitationExclusion({ vertices, lower: 3, upper: -1 });
  assert.equal(nativePrecipitationExcluded(invalidHeights, 1, 0, 1), false, "never reorder authored heights");
});

test("bounds mutate existing kind-one components, never configure future or missing owners", () => {
  const fields = new NativePrecipitationFieldState(catalog.precipitation);
  assert.equal(fields.apply(bounds).nativeNoOp, true);
  assert.deepEqual(fields.snapshot(), []);
  fields.register({ id: "non-field", kind: 0, factoryFlags: 0, components: { rain: 2, snow: 1, splash: 1 } });
  fields.register({ id: "absent-components", kind: 1, factoryFlags: 0, components: { rain: 0, snow: 0, splash: 0 } });
  assert.equal(fields.apply(bounds).nativeNoOp, true);
  assert.equal(fields.activateDefault(), true);
  assert.deepEqual(fields.readExclusions(), { rain: [], snow: [] }, "an earlier empty-list write cannot initialize a future field");
  const before = fields.snapshot();
  const written = fields.apply(bounds);
  assert.deepEqual(written.mutation.affectedFields, ["default"]);
  assert.equal(written.mutation.volume.lower, Math.fround(Math.fround(-1) - Math.fround(.09999999403953552)));
  assert.equal(written.mutation.volume.upper, Math.fround(Math.fround(3.3) + Math.fround(.09999999403953552)));
  const state = fields.snapshot();
  const active = state.find(([id]) => id === "default")[1];
  assert.equal(active.regions.rain.length, 2);
  assert.deepEqual(active.regions.rain[0], active.regions.rain[1]);
  assert.deepEqual(active.regions.snow[0], active.regions.splash[0]);
  assert.deepEqual(state.find(([id]) => id === "non-field")[1], before[0][1]);
  assert.equal(fields.activateDefault(), false);
  fields.restore(before);
  assert.deepEqual(fields.readExclusions(), { rain: [], snow: [] });
});

test("malformed geometry cannot partially change a weather field", () => {
  const fields = new NativePrecipitationFieldState(catalog.precipitation);
  fields.activateDefault();
  fields.apply(bounds);
  const previous = fields.snapshot();
  for (const change of [b => { b.vectorWordGroups[3][1] = 0x7fc00000; },
    b => { b.scalarFloatWords[0] = 0x7f800000; }, b => { b.vectorWordGroups[0].pop(); }]) {
    const damaged = structuredClone(bounds);
    change(damaged);
    assert.throws(() => fields.apply(damaged));
    assert.deepEqual(fields.snapshot(), previous);
  }
  assert.equal(fields.apply({ ...bounds, mode: 42 }).status, "stopped");
  assert.deepEqual(fields.snapshot(), previous);
});

test("WAIR release/recreate retains its independently owned precipitation field and snapshot", () => {
  const state = new NativeWeatherControllerState(new NativeWeatherSchedule(catalog));
  state.apply({ operationId: 0x0175, mode: 1 }, () => [86, 12, 3, 3, 8, 55, 0]);
  state.apply(bounds);
  const before = state.snapshot();
  state.apply({ operationId: 0x0175, mode: 2 });
  assert.equal(state.environmentOwner, null);
  assert.deepEqual(state.precipitationFields.snapshot(), before.precipitationFields);
  state.apply({ operationId: 0x0175, mode: 1 }, () => [86, 12, 3, 3, 9, 0, 0]);
  assert.deepEqual(state.precipitationFields.snapshot(), before.precipitationFields);
  state.restore(before);
  assert.deepEqual(state.snapshot(), before);
});
