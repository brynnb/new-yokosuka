import test from "node:test";
import assert from "node:assert/strict";
import {
  worldLoadWorkCount,
} from "../play/world/WorldLoadProgress.js";
import {
  shenmue2WorldSceneRecords,
} from "../play/world/Shenmue2SceneRecords.js";
import {
  assetContainerTopLevelNodes,
} from "../play/world/GlbWorld.js";
import {
  clearWorldSceneBeforeLighting,
} from "../src/rendering/SceneResources.js";

test("world geometry is disposed before clustered lighting", () => {
  const calls = [];
  const state = {
    currentMeshes: [{
      metadata: {},
      dispose() {
        calls.push("mesh");
      },
    }],
    loader: {
      textureCache: new Map([["texture", { dispose: () => calls.push("texture") }]]),
      materialCache: new Map([["material", {}]]),
    },
    mt7Loader: { clearCaches: () => calls.push("mt7") },
  };

  clearWorldSceneBeforeLighting(state, {
    clear() {
      calls.push("lighting");
      assert.deepEqual(state.currentMeshes, []);
    },
  });

  assert.deepEqual(calls, ["mesh", "texture", "mt7", "lighting"]);
});

test("GLB loading finds Babylon's generated mesh conversion root", () => {
  const root = { name: "__root__", parent: null };
  const mesh = { name: "Floor", parent: root };
  const transform = { name: "Screen", parent: root };

  assert.deepEqual(assetContainerTopLevelNodes({
    rootNodes: [],
    meshes: [root, mesh],
    transformNodes: [transform],
  }), [root]);
});

test("world loader counts unique placement assets and remaining work", () => {
  assert.equal(worldLoadWorkCount({
    placements: [
      { model: "A.MT5" },
      { model: "A.MT5" },
      { model: "B.MT5" },
    ],
  }, [{}, {}, {}], 2), 7);
});

test("Shenmue II worlds load authored MPK00 map and prop layers", () => {
  const world = {
    prefix: "S2DC_D1_WB01_MPK00",
  };
  const models = [
    {
      filename: "S2DC_D1_WB01_MPK00_MAP.MT7",
      kind: "MAPM",
      sourceMember: "MAP.MAPM",
    },
    {
      filename: "S2DC_D1_WB01_MPK00_MAP01.MT7",
      kind: "MAPM",
      sourceMember: "MAP01.MAPM",
    },
    {
      filename: "S2DC_D1_WB01_MPK00_PROP.MT7",
      kind: "PROP",
      sourceMember: "PROP.PROP",
    },
    {
      filename: "S2DC_D1_WB01_MPK00_PROP01.MT7",
      kind: "PROP",
      sourceMember: "PROP01.PROP",
    },
    {
      filename: "S2DC_D1_WB01_MPK00_BTKU2B1G.MT7",
      kind: "CHRM",
      sourceMember: "BTKU2B1G.CHRM",
    },
    {
      filename: "S2DC_D1_WB01_0025A_MALT200I.MT7",
      kind: "CHRM",
      sourceMember: "MALT200I.CHRM",
    },
  ];

  assert.deepEqual(
    shenmue2WorldSceneRecords({ models }, world).map(
      ({ sourceMember }) => sourceMember,
    ),
    ["MAP.MAPM", "MAP01.MAPM", "PROP.PROP", "PROP01.PROP"],
  );
});
