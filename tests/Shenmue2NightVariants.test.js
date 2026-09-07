import assert from "node:assert/strict";
import test from "node:test";

import { ZONE_VARIANTS } from "../src/constants.js";
import state from "../src/state.js";
import { buildHiddenSuffixes } from "../src/variants.js";

const PRINCIPAL_TIME_LAYERS = Object.freeze({
  AK00: ["MAP06", "MAP07"],
  AR02: ["MAP13", "MAP12"],
  AR03: ["MAP06", "MAP05"],
  WB00: [null, "MAP04"],
  WE00: ["MAP08", "MAP09"],
  WK00: [null, "MAP05"],
  WN00: ["MAP03", "MAP04"],
  WR00: [null, "MAP07"],
  WS00: [null, "MAP11"],
  WT00: [null, "MAP04"],
});

test("catalogs replacement pairs and additive night layers separately", () => {
  for (const [area, [dayLayer, nightLayer]] of Object.entries(PRINCIPAL_TIME_LAYERS)) {
    assert.deepEqual(ZONE_VARIANTS[area].groups, [
      {
        name: dayLayer ? "Day/night scenery" : "Night windows",
        type: "time",
        variants: [dayLayer, dayLayer, nightLayer, nightLayer],
      },
    ]);
  }
});

test("uses day layers through Sunset and night layers from Evening", () => {
  const previousZone = state.currentZone;
  const previousTime = state.currentTimeOfDay;
  try {
    for (const [area, [dayLayer, nightLayer]] of Object.entries(PRINCIPAL_TIME_LAYERS)) {
      state.currentZone = area;

      state.currentTimeOfDay = 0;
      assert.deepEqual([...buildHiddenSuffixes()], [nightLayer]);

      state.currentTimeOfDay = 1;
      assert.deepEqual([...buildHiddenSuffixes()], [nightLayer]);

      state.currentTimeOfDay = 2;
      assert.deepEqual([...buildHiddenSuffixes()], dayLayer ? [dayLayer] : []);

      state.currentTimeOfDay = 3;
      assert.deepEqual([...buildHiddenSuffixes()], dayLayer ? [dayLayer] : []);
    }
  } finally {
    state.currentZone = previousZone;
    state.currentTimeOfDay = previousTime;
  }
});

test("tracks byte-identical Shenmue II scene aliases", () => {
  const aliases = {
    AK09: ["MAP06", "MAP07"],
    AR09: ["MAP06", "MAP05"],
    ARBT: ["MAP06", "MAP07"],
    CWON: ["MAP13", "MAP12"],
    WK09: [null, "MAP05"],
    WS09: [null, "MAP11"],
  };
  for (const [area, [dayLayer, nightLayer]] of Object.entries(aliases)) {
    assert.deepEqual(
      ZONE_VARIANTS[area].groups[0].variants,
      [dayLayer, dayLayer, nightLayer, nightLayer],
    );
  }
});
