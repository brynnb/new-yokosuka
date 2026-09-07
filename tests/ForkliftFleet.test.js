import assert from "node:assert/strict";
import test from "node:test";
import { ForkliftFleet } from "../play/forklift/ForkliftFleet.js";
import {
  FORKLIFT_MODEL,
  FORKLIFT_PLAYGROUND_CARGO_SPAWNS,
  FORKLIFT_PLAYGROUND_SPAWNS,
  FORKLIFT_RACE_GRID_SPAWNS,
  FORKLIFT_RACE_SPAWNS,
  HARBOR_FORKLIFT_CONFIG,
} from "../play/config/forklifts.js";

const DETAILED_FORKLIFT_MODEL = "S3_MA00_FOKS502G.MT5";

test("fleet resolves configured models and the default fallback", () => {
  const fleet = new ForkliftFleet({
    scene: {},
    state: { currentMeshes: [] },
    effects: {},
    getWorld: () => ({
      forkliftSpawns: [{ id: "forklift-1", model: "red.MT5" }],
    }),
    setParked() {},
  });
  assert.equal(fleet.modelForId("forklift-1"), "red.MT5");
  assert.equal(fleet.modelForId("forklift-2"), DETAILED_FORKLIFT_MODEL);
  assert.equal(FORKLIFT_MODEL, DETAILED_FORKLIFT_MODEL);
});

test("harbor has no authored forklift or cargo spawns", () => {
  assert.deepEqual(HARBOR_FORKLIFT_CONFIG.forkliftSpawns, []);
  assert.equal(HARBOR_FORKLIFT_CONFIG.cargoEnabled, false);
  assert.equal(FORKLIFT_PLAYGROUND_SPAWNS.length, 5);
  assert.equal(FORKLIFT_PLAYGROUND_CARGO_SPAWNS.length, 3);
  assert.equal(FORKLIFT_RACE_SPAWNS.length, 5);
  assert.deepEqual(
    FORKLIFT_RACE_GRID_SPAWNS.map((spawn) => spawn.position.x),
    [63, 60, 57, 54, 51],
  );
  assert.ok(
    [...FORKLIFT_PLAYGROUND_SPAWNS, ...FORKLIFT_RACE_SPAWNS]
      .every(({ model }) => model === DETAILED_FORKLIFT_MODEL),
  );
});

test("dynamic race forklifts use the race model", () => {
  const raceWorld = {
    id: "ma00race",
    forkliftSpawns: FORKLIFT_RACE_SPAWNS,
  };
  const fleet = new ForkliftFleet({
    scene: {},
    state: { currentMeshes: [] },
    effects: {},
    getWorld: () => raceWorld,
    setParked() {},
  });
  assert.equal(
    fleet.modelForId("forklift-012345abcdef"),
    FORKLIFT_RACE_GRID_SPAWNS[0].model,
  );
});

test("fleet accepts only forklifts listed by the current server snapshot", () => {
  const fleet = new ForkliftFleet({
    scene: {},
    state: { currentMeshes: [] },
    effects: {},
    getWorld: () => ({ id: "ma00", forkliftSpawns: [] }),
    setParked() {},
  });
  const accepted = fleet.replaceServerSnapshot([
    { id: "forklift-1", worldId: "ma00" },
    { id: "forklift-11", worldId: "ma00race" },
  ]);

  assert.deepEqual(accepted.map(({ id }) => id), ["forklift-1"]);
  assert.equal(fleet.snapshotWorldId, "ma00");
  assert.deepEqual([...fleet.snapshotIds], ["forklift-1"]);
});
