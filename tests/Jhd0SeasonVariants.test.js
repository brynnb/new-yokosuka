import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERIOR_SCENES,
  ZONE_VARIANTS,
  seasonPresets,
} from "../src/constants.js";
import state from "../src/state.js";
import {
  buildHiddenSuffixes,
  updateModelVisibility,
} from "../src/variants.js";
import { resolveSceneComposition } from "../src/SceneCompositions.js";

test("asset viewer preserves the known-good BETD seasonal filtering", () => {
  const previousZone = state.currentZone;
  const previousSeason = state.currentSeason;
  try {
    state.currentZone = "BETD";
    state.currentSeason = 0;
    assert.deepEqual(
      [...buildHiddenSuffixes()].sort(),
      ["MAP04", "MAP05", "MAP07", "MAP09", "MAP11"],
    );

    state.currentSeason = 1;
    assert.deepEqual(
      [...buildHiddenSuffixes()].sort(),
      ["MAP03", "MAP05", "MAP06", "MAP08", "MAP10"],
    );
  } finally {
    state.currentZone = previousZone;
    state.currentSeason = previousSeason;
  }
});

test("selects only JHD0 summer layers in the play world's default season", () => {
  assert.equal(seasonPresets[0].name, "Summer");
  assert.equal(seasonPresets[0].index, 0);
  assert.equal(seasonPresets[1].name, "Winter");
  assert.equal(seasonPresets[1].index, 1);
  assert.equal(seasonPresets.length, 2);
  assert.deepEqual(ZONE_VARIANTS.JHD0.groups, [
    { name: "Small Plants", type: "season", variants: ["MAP08", "MAP09"] },
    { name: "Trees", type: "season", variants: ["MAP10", "MAP11"] },
    { name: "Foliage", type: "season", variants: ["MAP06", "MAP07", "MAP05"] },
  ]);
});

test("treats JHD0 as exterior so its sky remains enabled", () => {
  assert.equal(INTERIOR_SCENES.includes("JHD0"), false);
});

test("tracks Sakuragaoka MAP12 as a snow-weather overlay", () => {
  const snow = ZONE_VARIANTS.JD00.groups.find(
    (group) => group.name === "Snow",
  );
  assert.deepEqual(snow, {
    name: "Snow",
    type: "weather",
    variants: [null, null, null, "MAP12"],
  });
});

test("tracks all three Yamanose day and evening window pairs", () => {
  assert.deepEqual(
    ZONE_VARIANTS.JU00.groups.filter((group) => group.type === "time"),
    [
      { name: "Windows A", type: "time", variants: ["MAP02", "MAP02", "MAP03", "MAP03"] },
      { name: "Windows B", type: "time", variants: ["MAP04", "MAP04", "MAP05", "MAP05"] },
      { name: "Windows C", type: "time", variants: ["MAP06", "MAP06", "MAP07", "MAP07"] },
    ],
  );
});

test("tracks warehouse MAP02 as a snow-weather overlay", () => {
  const snow = ZONE_VARIANTS.MKSG.groups.find(
    (group) => group.name === "Snow",
  );
  assert.deepEqual(snow, {
    name: "Snow",
    type: "weather",
    variants: [null, null, null, "MAP02"],
  });
});

test("weather variants are selected independently from season", () => {
  const previousZone = state.currentZone;
  const previousWeather = state.currentWeatherIndex;
  try {
    state.currentZone = "JD00";
    state.currentWeatherIndex = 0;
    assert.equal(buildHiddenSuffixes().has("MAP12"), true);
    state.currentWeatherIndex = 3;
    assert.equal(buildHiddenSuffixes().has("MAP12"), false);
  } finally {
    state.currentZone = previousZone;
    state.currentWeatherIndex = previousWeather;
  }
});

test("the dedicated OP00 profile does not re-enable cutaway-owned roots", () => {
  const previous = {
    scene: state.scene,
    meshes: state.currentMeshes,
    profile: state.currentVariantProfile,
    season: state.currentSeason,
    singleModelMode: state.singleModelMode,
  };
  const root = (filename, enabled = true) => ({
    _filename: filename,
    enabled,
    setEnabled(value) { this.enabled = value; },
  });
  try {
    const cutaway = root("S1_OP00_OMADO.MT5", false);
    state.scene = {};
    state.currentMeshes = [cutaway];
    state.currentVariantProfile = resolveSceneComposition(
      "op00-introduction",
    ).variantProfile;
    state.currentSeason = 1;
    state.singleModelMode = false;
    updateModelVisibility();
    assert.equal(cutaway.enabled, false);
  } finally {
    state.scene = previous.scene;
    state.currentMeshes = previous.meshes;
    state.currentVariantProfile = previous.profile;
    state.currentSeason = previous.season;
    state.singleModelMode = previous.singleModelMode;
  }
});

test("OP00 switches its in-model snow ground surface with the season", () => {
  const previous = {
    scene: state.scene,
    meshes: state.currentMeshes,
    profile: state.currentVariantProfile,
    season: state.currentSeason,
    singleModelMode: state.singleModelMode,
  };
  const snow = {
    metadata: { mt5TextureId: "736e6f775f620000" },
    enabled: true,
    parent: null,
    setEnabled(value) { this.enabled = value; },
  };
  const root = {
    _filename: "S1_OP00_JIMENHAL.MT5",
    getDescendants: () => [snow],
  };
  snow.parent = root;
  try {
    state.scene = {};
    state.currentMeshes = [root];
    state.currentVariantProfile = resolveSceneComposition(
      "OP00",
    ).variantProfile;
    state.singleModelMode = false;

    state.currentSeason = 0;
    updateModelVisibility();
    assert.equal(snow.enabled, false);

    state.currentSeason = 1;
    updateModelVisibility();
    assert.equal(snow.enabled, true);
  } finally {
    state.scene = previous.scene;
    state.currentMeshes = previous.meshes;
    state.currentVariantProfile = previous.profile;
    state.currentSeason = previous.season;
    state.singleModelMode = previous.singleModelMode;
  }
});
