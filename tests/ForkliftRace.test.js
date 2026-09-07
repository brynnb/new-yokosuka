import assert from "node:assert/strict";
import test from "node:test";
import {
  ForkliftRaceSession,
  formatRaceTime,
  readForkliftRaceBest,
  saveForkliftRaceBest,
} from "../src/ForkliftRace.js";

test("race gates must be crossed in order for every lap", () => {
  const race = new ForkliftRaceSession({
    checkpoints: [
      { x: 10, z: 0, radius: 2 },
      { x: 20, z: 0, radius: 2 },
    ],
    laps: 2,
    countdownSeconds: 0,
  });
  race.start();
  race.update({ x: 0, z: 0 }, 0);
  race.update({ x: 20, z: 0 }, 1);
  assert.equal(race.checkpoint, 0, "cutting to gate two must not count");
  race.update({ x: 10, z: 0 }, 1);
  race.update({ x: 20, z: 0 }, 1);
  assert.equal(race.lap, 2);
  race.update({ x: 10, z: 0 }, 1);
  race.update({ x: 20, z: 0 }, 1);
  assert.equal(race.status, "finished");
  assert.equal(race.elapsedMs, 5000);
});

test("race time and best time formatting are stable", () => {
  assert.equal(formatRaceTime(65_432), "01:05.432");
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(saveForkliftRaceBest(70_000, storage), 70_000);
  assert.equal(saveForkliftRaceBest(72_000, storage), 70_000);
  assert.equal(saveForkliftRaceBest(65_000, storage), 65_000);
  assert.equal(readForkliftRaceBest(storage), 65_000);
});

test("race time continues on foot without advancing checkpoints", () => {
  const race = new ForkliftRaceSession({
    checkpoints: [{ x: 0, z: 0, radius: 2 }],
    laps: 1,
    countdownSeconds: 0,
  });
  race.start();
  race.update(null, 0);
  race.update(null, 2);
  assert.equal(race.status, "racing");
  assert.equal(race.elapsedMs, 2000);
  assert.equal(race.checkpoint, 0);
});
