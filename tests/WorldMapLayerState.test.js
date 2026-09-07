import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateTimedMapLayerStates,
  WorldMapLayerState,
} from "../src/rendering/WorldMapLayerState.js";
import { numberedMapLayer } from "../src/rendering/NativeMapLayerState.js";
import { WORLDS } from "../play/config/worlds.js";

function at(hour, minute = 0) {
  return new Date(Date.UTC(1986, 5, 9, hour, minute));
}

const neighborhoodLayers = {
  modelPrefix: "S1_JD00",
  dayEveningPairs: [[2, 3], [4, 5], [6, 7]],
};

test("Sakuragaoka window pairs use even layers by day and odd layers at evening", () => {
  const day = evaluateTimedMapLayerStates(neighborhoodLayers, at(16));
  assert.deepEqual(
    [...day.entries()],
    [[2, 1], [3, 0], [4, 1], [5, 0], [6, 1], [7, 0]],
  );

  const evening = evaluateTimedMapLayerStates(neighborhoodLayers, at(22));
  assert.deepEqual(
    [...evening.entries()],
    [[2, 0], [3, 1], [4, 0], [5, 1], [6, 0], [7, 1]],
  );
});

test("harbor uses its identified day and evening layer pairs", () => {
  const harborLayers = WORLDS.mfsy.timedMapLayers;
  assert.deepEqual(harborLayers.dayEveningPairs, [
    [2, 4],
    [8, 6],
    [12, 14],
    [17, 13],
  ]);
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(harborLayers, at(16)).entries()],
    [
      [2, 1], [4, 0], [8, 1], [6, 0], [12, 1], [14, 0],
      [17, 1], [13, 0],
    ],
  );
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(harborLayers, at(22)).entries()],
    [
      [2, 0], [4, 1], [8, 0], [6, 1], [12, 0], [14, 1],
      [17, 0], [13, 1],
    ],
  );
  assert.deepEqual(
    WORLDS.ma00.timedMapLayers.dayEveningPairs,
    harborLayers.dayEveningPairs,
  );
  assert.equal(WORLDS.ma00.nativeArea, "MA00");
  assert.equal(WORLDS.ma00.collisionArea, "MFSY");
  assert.equal(WORLDS.ma00race.nativeArea, "MA00");
  assert.equal(WORLDS.ma00race.collisionArea, undefined);
});

test("warehouse spatial tiles are not treated as timed variants", () => {
  assert.equal(WORLDS.mksg.timedMapLayers, undefined);
});

test("Shenmue II playable areas expose the reviewed time-layer table", () => {
  const expected = {
    s2ak00: { pairs: [[6, 7]], nightOnly: [] },
    s2ar02: { pairs: [[13, 12]], nightOnly: [] },
    s2ar03: { pairs: [[6, 5]], nightOnly: [] },
    s2wb00: { pairs: [], nightOnly: [4] },
    s2we00: { pairs: [[8, 9]], nightOnly: [] },
    s2wk00: { pairs: [], nightOnly: [5] },
    s2wn00: { pairs: [[3, 4]], nightOnly: [] },
    s2wr00: { pairs: [], nightOnly: [7] },
    s2ws00: { pairs: [], nightOnly: [11] },
    s2wt00: { pairs: [], nightOnly: [4] },
  };

  for (const [worldId, layers] of Object.entries(expected)) {
    const definition = WORLDS[worldId].timedMapLayers;
    assert.deepEqual(definition.dayEveningPairs, layers.pairs, worldId);
    assert.deepEqual(definition.nightOnlyLayers, layers.nightOnly, worldId);
  }
});

test("Shenmue II uses day layers through sunset and night layers from evening", () => {
  const pair = WORLDS.s2ak00.timedMapLayers;
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(pair, at(18, 30)).entries()],
    [[6, 1], [7, 0]],
  );
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(pair, at(22)).entries()],
    [[6, 0], [7, 1]],
  );

  const additive = WORLDS.s2wb00.timedMapLayers;
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(additive, at(18, 30)).entries()],
    [[4, 0]],
  );
  assert.deepEqual(
    [...evaluateTimedMapLayerStates(additive, at(22)).entries()],
    [[4, 1]],
  );
});

test("map layer recognition supports Shenmue II MT7 filenames", () => {
  assert.equal(
    numberedMapLayer(
      "S2DC_D1_AK00_MPK00_MAP07.MT7",
      "S2DC_D1_AK00_MPK00",
    ),
    7,
  );
});

test("world map layer runtime switches loaded meshes without reloading", () => {
  const enabled = new Map();
  const meshes = [2, 3, 4, 5, 6, 7].map((layer) => ({
    _filename: `S1_JD00_MAP0${layer}.MT5`,
    parent: null,
    isDisposed: () => false,
    setEnabled(value) {
      enabled.set(layer, value);
    },
  }));
  const runtime = new WorldMapLayerState();
  const world = {
    nativeArea: "JD00",
    timedMapLayers: neighborhoodLayers,
  };

  assert.equal(runtime.load(world, meshes, at(16)), true);
  assert.deepEqual(
    [...enabled.entries()],
    [[2, true], [3, false], [4, true], [5, false], [6, true], [7, false]],
  );

  runtime.update(at(22));
  assert.deepEqual(
    [...enabled.entries()],
    [[2, false], [3, true], [4, false], [5, true], [6, false], [7, true]],
  );
});

test("world map layer runtime switches Shenmue II MT7 roots", () => {
  const enabled = new Map();
  const meshes = [6, 7].map((layer) => ({
    _filename: `S2DC_D1_AK00_MPK00_MAP0${layer}.MT7`,
    parent: null,
    isDisposed: () => false,
    setEnabled(value) {
      enabled.set(layer, value);
    },
  }));
  const runtime = new WorldMapLayerState();

  assert.equal(runtime.load(WORLDS.s2ak00, meshes, at(16)), true);
  assert.deepEqual([...enabled.entries()], [[6, true], [7, false]]);

  runtime.update(at(22));
  assert.deepEqual([...enabled.entries()], [[6, false], [7, true]]);
});

test("activeLayerForMesh follows descendants and rejects inactive layers", () => {
  const runtime = new WorldMapLayerState();
  const activeRoot = { parent: null };
  const inactiveRoot = { parent: null };
  runtime.layerByRoot.set(activeRoot, 13);
  runtime.layerByRoot.set(inactiveRoot, 14);
  runtime.states.set(13, 1);
  runtime.states.set(14, 0);

  assert.equal(
    runtime.activeLayerForMesh({ parent: { parent: activeRoot } }),
    13,
  );
  assert.equal(runtime.activeLayerForMesh({ parent: inactiveRoot }), null);
  assert.equal(runtime.activeLayerForMesh({ parent: null }), null);
});

test("authored script state overrides the clock until the scene clears", () => {
  const enabled = new Map();
  const meshes = [2, 3].map((layer) => ({
    _filename: `S1_JD00_MAP0${layer}.MT5`,
    parent: null,
    isDisposed: () => false,
    setEnabled(value) {
      enabled.set(layer, value);
    },
  }));
  const runtime = new WorldMapLayerState();
  runtime.load({
    nativeArea: "JD00",
    timedMapLayers: neighborhoodLayers,
  }, meshes, at(16));

  runtime.setScriptState(2, 0);
  runtime.update(at(17));
  assert.equal(enabled.get(2), false);
  assert.deepEqual(runtime.scriptState(2), { present: true, value: 0 });

  runtime.clear();
  assert.deepEqual(runtime.scriptState(2), { present: false, value: null });
});
