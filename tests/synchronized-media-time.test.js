import assert from "node:assert/strict";
import test from "node:test";
import {
  loopedMediaTimeSeconds,
  shortestLoopTimeDifferenceSeconds,
} from "../src/SynchronizedMediaTime.js";

test("maps a shared clock onto a looping media timeline", () => {
  assert.equal(loopedMediaTimeSeconds(10_000, 0, 6), 4);
  assert.equal(loopedMediaTimeSeconds(16_000, 0, 6), 4);
  assert.equal(loopedMediaTimeSeconds(-1_000, 0, 6), 5);
});

test("measures drift across a looping media boundary", () => {
  assert.ok(Math.abs(
    shortestLoopTimeDifferenceSeconds(0.1, 5.9, 6) - 0.2,
  ) < 1e-9);
  assert.ok(Math.abs(
    shortestLoopTimeDifferenceSeconds(5.9, 0.1, 6) + 0.2,
  ) < 1e-9);
});
