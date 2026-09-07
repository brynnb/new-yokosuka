import assert from "node:assert/strict";
import test from "node:test";

import { WORLDS } from "../play/config/worlds.js";

test("YD01 is an isolated canonical cutscene composition", () => {
  const world = WORLDS.yd01;
  assert.equal(world.nativeArea, "YD01");
  assert.equal(world.assetArea, "YD01");
  assert.equal(world.prefix, "S1_YD01");
  assert.equal(world.cutsceneOnly, true);
  assert.deepEqual(world.spawn.asArray(), [
    7.511159896850586,
    0,
    -26.878936767578125,
  ]);
  assert.equal(world.includeFile("S1_YD01_MAP.MT5"), true);
  assert.equal(world.includeFile("S1_YD01_MAP01.MT5"), true);
  assert.equal(world.includeFile("S1_YD01_MAP03.MT5"), true);
  assert.equal(world.includeFile("S1_YD01_IWA_M.MT5"), false);
  assert.equal(world.includeFile("S1_JHD0_MAP.MT5"), false);
});
