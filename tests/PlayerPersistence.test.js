import assert from "node:assert/strict";
import test from "node:test";
import {
  isPersistentPlayerWorld,
  PlayerPersistence,
} from "../play/state/PlayerPersistence.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("persistence can use its default constructor contract", () => {
  assert.doesNotThrow(() => new PlayerPersistence());
});

test("legacy local player locations are removed", () => {
  const storage = memoryStorage();
  storage.setItem("new-yokosuka.play.location.v1", JSON.stringify({
    map: "yard",
    position: [1, 2, 3],
  }));
  new PlayerPersistence({ storage });
  assert.equal(storage.getItem("new-yokosuka.play.location.v1"), null);
});

test("cutscene-only worlds are excluded from authoritative persistence", () => {
  assert.equal(isPersistentPlayerWorld({ id: "op00", cutsceneOnly: true }), false);
  assert.equal(isPersistentPlayerWorld({ id: "dobuita" }), true);
  assert.equal(isPersistentPlayerWorld(null), false);
});

test("run toggle state survives a new persistence instance", () => {
  const storage = memoryStorage();
  const createPersistence = () => new PlayerPersistence({
    storage,
    worlds: {},
    characters: new Map(),
  });

  const firstPage = createPersistence();
  assert.equal(firstPage.readRunToggle(), false);
  assert.equal(firstPage.saveRunToggle(true), true);

  const refreshedPage = createPersistence();
  assert.equal(refreshedPage.readRunToggle(), true);
  assert.equal(refreshedPage.saveRunToggle(false), true);
  assert.equal(createPersistence().readRunToggle(), false);
});

test("debug run speed survives refresh and rejects invalid values", () => {
  const storage = memoryStorage();
  const createPersistence = () => new PlayerPersistence({
    storage,
    worlds: {},
    characters: new Map(),
  });

  assert.equal(createPersistence().readDebugRunSpeed(), 1);
  assert.equal(createPersistence().saveDebugRunSpeed(3.25), true);
  assert.equal(createPersistence().readDebugRunSpeed(), 3.25);

  storage.setItem("new-yokosuka.play.debug-run-speed.v1", "50");
  assert.equal(createPersistence().readDebugRunSpeed(), 1);
  assert.equal(createPersistence().saveDebugRunSpeed(Number.NaN), false);
});

test("debug NPC walk speed survives refresh and rejects invalid values", () => {
  const storage = memoryStorage();
  const createPersistence = () => new PlayerPersistence({
    storage,
    worlds: {},
  });

  assert.equal(createPersistence().readDebugNpcWalkSpeed(), 1);
  assert.equal(createPersistence().saveDebugNpcWalkSpeed(1.17), true);
  assert.equal(createPersistence().readDebugNpcWalkSpeed(), 1.17);

  storage.setItem("new-yokosuka.play.debug-npc-walk-speed.v1", "0.99");
  assert.equal(createPersistence().readDebugNpcWalkSpeed(), 1);
  assert.equal(
    storage.getItem("new-yokosuka.play.debug-npc-walk-speed.v1"),
    "1",
  );

  storage.setItem("new-yokosuka.play.debug-npc-walk-speed.v1", "3");
  assert.equal(createPersistence().readDebugNpcWalkSpeed(), 1);
  assert.equal(createPersistence().saveDebugNpcWalkSpeed(0.25), false);
});

test("forklift tuning rejects values outside supported ranges", () => {
  const storage = memoryStorage();
  const persistence = new PlayerPersistence({
    storage,
    worlds: {},
    characters: new Map(),
  });
  storage.setItem(
    "new-yokosuka.play.debug-forklift-physics.v1",
    JSON.stringify({
      tireGrip: 999,
      springRate: 10,
      shockDamping: 999,
      rollStiffness: 140,
    }),
  );
  const values = persistence.readForkliftTuning({
    centerOfMassHeight: 0.3,
    springRate: 150,
    shockDamping: 175,
    loadInfluence: 65,
    tireGrip: 100,
    brakeForce: 100,
    driveForce: 100,
    steeringResponse: 50,
    highSpeedSteering: 35,
    rollStiffness: 100,
  });
  assert.equal(values.tireGrip, 100);
  assert.equal(values.springRate, 150);
  assert.equal(values.shockDamping, 175);
  assert.equal(values.rollStiffness, 140);
});

test("all forklift tuning controls survive a local-storage round trip", () => {
  const storage = memoryStorage();
  const persistence = new PlayerPersistence({
    storage,
    worlds: {},
  });
  const values = {
    centerOfMassHeight: 0.47,
    springRate: 185,
    shockDamping: 205,
    loadInfluence: 80,
    tireGrip: 165,
    brakeForce: 125,
    driveForce: 115,
    steeringResponse: 145,
    highSpeedSteering: 70,
    rollStiffness: 135,
  };

  assert.equal(persistence.saveForkliftTuning(values), true);
  assert.deepEqual(persistence.readForkliftTuning({}), values);
});
