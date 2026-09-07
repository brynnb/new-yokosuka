import assert from "node:assert/strict";
import test from "node:test";

import { ASSET_VIEWER_MAIN_VIEWS, shenmueInteriorViews } from "../src/AssetViewerMainViews.js";
import { resolveSceneComposition } from "../src/SceneCompositions.js";

test("interior shortcuts require a named available destination and use one scenario", () => {
  const views = shenmueInteriorViews([
    "S2_DURN_MAP.MT5", "S1_DURN_MAP.MT5", "S1_DURN_PROP.MT5",
    "S2_YDB1_ROOM.MT5", "S1_D000_MAP.MT5", "S1_UNKNOWN_MAP.MT5",
    "S1_DCBN_MAP.MT5", "S1_DGCT_textures.bin",
  ], {DURN: "Lapis Fortune Teller", YDB1: "Hazuki Residence Basement", D000: "Dobuita", DGCT: "YOU Arcade"});
  assert.deepEqual(views, [
    {prefix: "S2_YDB1", label: "Hazuki Residence Basement", interior: true},
    {prefix: "S1_DURN", label: "Lapis Fortune Teller", interior: true},
  ]);
});

test("asset viewer exposes a winter OP00 stage and each native component", () => {
  const view = ASSET_VIEWER_MAIN_VIEWS.find(
    candidate => candidate.composition === "OP00",
  );
  assert.equal(view.label, "OP00 Introduction Stage");
  assert.equal(view.prefix, "S1_OP00");
  assert.equal(view.composition, "OP00");
  assert.equal(view.initialSeasonIndex, 1);
  assert.equal(view.initialWeatherIndex, 3);
  assert.deepEqual(
    view.components.map(component => component.filename),
    [
      "S1_OP00_OMO.MT5",
      "S1_OP00_JIMENHAL.MT5",
      "S1_OP00_NAIB.MT5",
      "S1_OP00_NIWAKAL.MT5",
      "S1_OP00_OMADO.MT5",
      "S1_OP00_OOSAKI.MT5",
      "S1_OP00_JYUU.MT5",
    ],
  );
  assert.deepEqual(
    [...resolveSceneComposition(view.composition, {
      seasonIndex: view.initialSeasonIndex,
      weatherIndex: view.initialWeatherIndex,
    }, {
      includeInactiveVariants: false,
    }).filenames].sort(),
    [
      "S1_OP00_JIMENHAL.MT5",
      "S1_OP00_JYUU.MT5",
      "S1_OP00_NAIB.MT5",
      "S1_OP00_OMADO.MT5",
      "S1_OP00_OMO.MT5",
      "S1_OP00_OOSAKI.MT5",
    ],
  );
});
