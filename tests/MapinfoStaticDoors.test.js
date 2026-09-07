import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  extractMapinfoStaticDoors,
} from "../tools/lib/mapinfo_static_doors.js";

const jomoPath = ".disc-work/exact/jomo/MAPINFO.BIN";
const d000Path = ".disc-work/exact/d000/MAPINFO.BIN";

test("extracts all 18 JOMO static doors", {
  skip: !fs.existsSync(jomoPath),
}, () => {
  const result = extractMapinfoStaticDoors(
    fs.readFileSync(jomoPath),
    "S1_JOMO_",
  );
  assert.equal(result.modelNames.length, 7);
  assert.equal(result.placements.length, 18);
  assert.equal(
    result.placements[14].model,
    "S1_JOMO_DR15_016.MT5",
  );
  assert.deepEqual(result.placements[14].position, [-14.886, -0.219, 6.3261]);
});

test("extracts all 120 D000 static doors", {
  skip: !fs.existsSync(d000Path),
}, () => {
  const result = extractMapinfoStaticDoors(
    fs.readFileSync(d000Path),
    "S1_D000_",
  );
  assert.equal(result.modelNames.length, 36);
  assert.equal(result.placements.length, 120);
  assert.deepEqual(
    [...new Set(result.placements.map((placement) => (
      placement.runtime.staticDoorType
    )))],
    [2, 1],
  );
  assert.equal(result.placements[0].model, "S1_D000_DR01_011.MT5");
});
