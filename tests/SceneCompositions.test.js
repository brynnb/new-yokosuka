import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENE_COMPOSITIONS,
  residentSceneAsset,
  resolveSceneComposition,
  timedMapLayersForSource,
} from "../src/SceneCompositions.js";

test("catalog defines the dedicated OP00 stage and six outdoor families", () => {
  assert.deepEqual(Object.keys(SCENE_COMPOSITIONS.families), [
    "op00-cinematic",
    "op02-cinematic",
    "hazuki-grounds",
    "yamanose",
    "sakuragaoka",
    "dobuita",
    "new-yokosuka-harbor",
    "old-warehouse-district",
  ]);
});

test("BETD winter resolves exactly one member of every seasonal group", () => {
  const result = resolveSceneComposition("BETD", {
    season: "winter",
  }, { includeInactiveVariants: false });
  assert.deepEqual([...result.filenames].sort(), [
    "S1_BETD_MAP.MT5",
    "S1_BETD_MAP01.MT5",
    "S1_BETD_MAP02.MT5",
    "S1_BETD_MAP04.MT5",
    "S1_BETD_MAP07.MT5",
    "S1_BETD_MAP09.MT5",
    "S1_BETD_MAP11.MT5",
  ].sort());
});

test("OP00 uses only its dedicated native stage and authored objects", () => {
  const result = resolveSceneComposition("op00-introduction", {
    season: "summer",
    seasonIndex: 0,
    weather: "clear",
    weatherIndex: 0,
  });
  assert.equal(result.family, "op00-cinematic");
  assert.equal(result.source, "OP00");
  assert.equal(result.context.season, "winter");
  assert.equal(result.context.seasonIndex, 1);
  assert.equal(result.context.weather, "snow");
  assert.equal(result.context.weatherIndex, 3);
  for (const filename of [
    "S1_OP00_OMO.MT5",
    "S1_OP00_JIMENHAL.MT5",
    "S1_OP00_NAIB.MT5",
    "S1_OP00_OMADO.MT5",
    "S1_OP00_OOSAKI.MT5",
    "S1_OP00_JYUU.MT5",
    "S1_OP00_DDRR1001.MT5",
    "S1_OP00_DRGS502G.MT5",
  ]) {
    assert.equal(result.filenames.has(filename), true);
  }
  assert.equal(result.filenames.has("S1_OP00_NIWAKAL.MT5"), false);
  for (const filename of [
    "S1_BETD_MAP.MT5",
    "S1_BETD_MAP01.MT5",
    "S1_BETD_MAP02.MT5",
    "S1_BETD_MAP03.MT5",
    "S1_BETD_MAP04.MT5",
    "S1_BETD_MAP06.MT5",
    "S1_BETD_MAP07.MT5",
    "S1_BETD_MAP08.MT5",
    "S1_BETD_MAP09.MT5",
    "S1_BETD_MAP10.MT5",
    "S1_BETD_MAP11.MT5",
  ]) {
    assert.equal(result.filenames.has(filename), false);
  }
});

test("OP00 resolves mutually exclusive warm and winter ground presentation", () => {
  const summer = resolveSceneComposition("OP00", {
    seasonIndex: 0,
  }, { includeInactiveVariants: false });
  const winter = resolveSceneComposition("OP00", {
    seasonIndex: 1,
  }, { includeInactiveVariants: false });
  assert.equal(summer.filenames.has("S1_OP00_JIMENHAL.MT5"), true);
  assert.equal(summer.filenames.has("S1_OP00_NIWAKAL.MT5"), true);
  assert.equal(winter.filenames.has("S1_OP00_JIMENHAL.MT5"), true);
  assert.equal(winter.filenames.has("S1_OP00_NIWAKAL.MT5"), false);
  assert.deepEqual(winter.variantProfile.surfaceGroups, [{
    name: "Snow-covered ground",
    type: "season",
    assets: ["JIMENHAL"],
    variants: [null, ["736e6f775f620000"]],
  }]);
});

test("resident and timed-layer compatibility views derive from the catalog", () => {
  assert.equal(residentSceneAsset("JD00", "S1_JD00_MAP12.MT5"), true);
  assert.equal(residentSceneAsset("JD00", "S1_JD00_MAP13.MT5"), false);
  assert.deepEqual(timedMapLayersForSource("JU00").dayEveningPairs, [
    [2, 3],
    [4, 5],
    [6, 7],
  ]);
  assert.deepEqual(timedMapLayersForSource("MFSY").dayEveningPairs, [
    [2, 4],
    [8, 6],
    [12, 14],
    [17, 13],
  ]);
  assert.equal(timedMapLayersForSource("MKSG"), null);
});
