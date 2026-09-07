import assert from "node:assert/strict";
import test from "node:test";
import {
  gameDateFromWorldState,
  timeOfDayBlendForDate,
  timeOfDayBlendForHour,
  timeOfDayIndexForHour,
  timeOfDayIndexForDate,
} from "../src/WorldTime.js";

test("server time advances at the configured compressed-day rate", () => {
  const date = gameDateFromWorldState({
    gameTimeMs: Date.UTC(1986, 5, 9, 16, 20),
    serverTimeMs: 1_000,
    dayLengthMs: 96 * 60 * 1000,
    dayStartHour: 8.5,
    dayEndHour: 23.5,
  }, 61_000);
  assert.equal(date.toISOString(), "1986-06-09T16:35:00.000Z");
});

test("the clock skips 11:30 PM to 8:30 AM on the following date", () => {
  const date = gameDateFromWorldState({
    gameTimeMs: Date.UTC(1986, 5, 9, 23, 29),
    serverTimeMs: 1_000,
    dayLengthMs: 96 * 60 * 1000,
    dayStartHour: 8.5,
    dayEndHour: 23.5,
  }, 9_000);
  assert.equal(date.toISOString(), "1986-06-10T08:31:00.000Z");
});

test("morning starts directly with sunrise and evening begins at sunset", () => {
  assert.equal(timeOfDayIndexForHour(0), 3);
  assert.equal(timeOfDayIndexForHour(8.49), 3);
  assert.equal(timeOfDayIndexForHour(8.5), 1);
  assert.equal(timeOfDayIndexForHour(8.875), 0);
  assert.equal(timeOfDayIndexForHour(17.99), 0);
  assert.equal(timeOfDayIndexForHour(18.5), 1);
  assert.equal(timeOfDayIndexForHour(19.375), 2);
  assert.equal(timeOfDayIndexForHour(20.125), 3);
});

test("lighting blends continuously through the short phases", () => {
  assert.deepEqual(timeOfDayBlendForHour(18, 18), {
    fromIndex: 0,
    toIndex: 1,
    progress: 0,
    presetIndex: 0,
  });
  assert.deepEqual(timeOfDayBlendForHour(19, 18), {
    fromIndex: 1,
    toIndex: 2,
    progress: 0,
    presetIndex: 1,
  });
  const sunrise = timeOfDayBlendForHour(9);
  assert.equal(sunrise.fromIndex, 1);
  assert.equal(sunrise.toIndex, 0);
  assert.ok(sunrise.progress > 0 && sunrise.progress < 1);
});

test("sunset always starts at 6 PM regardless of the calendar date", () => {
  for (const date of ["1986-06-09", "1986-11-29"]) {
    assert.deepEqual(
      timeOfDayBlendForDate(new Date(`${date}T18:00:00Z`)),
      {
        fromIndex: 0,
        toIndex: 1,
        progress: 0,
        presetIndex: 0,
      },
    );
    assert.equal(
      timeOfDayIndexForDate(new Date(`${date}T18:30:00Z`)),
      1,
    );
  }
});
