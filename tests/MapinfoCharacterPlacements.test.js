import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  extractMapinfoCharacterPlacements,
} from "../tools/lib/mapinfo_character_placements.js";

const mapinfoPath = ".disc-work/exact/betd/MAPINFO.BIN";

test("extracts BETD CHRS placements from serialized Character links", {
  skip: !fs.existsSync(mapinfoPath),
}, () => {
  const placements = extractMapinfoCharacterPlacements(
    fs.readFileSync(mapinfoPath),
  );
  assert.deepEqual(
    placements.slice(-6).map(({ objectTag, model }) => [objectTag, model]),
    [
      ["DORR", "DDRR1001.MT5"],
      ["DORL", "DDRR1002.MT5"],
      ["SECD", "DKTR101G.MT5"],
      ["GART", "GART201G.MT5"],
      ["KAK1", "KAKS509G.MT5"],
      ["KAK2", "KAKS505G.MT5"],
    ],
  );
  const objects = placements.slice(-6);
  assert.deepEqual(objects[0].rotationDegrees, [0, 80, 0]);
  assert.deepEqual(objects[4].rotationDegrees, [0, 90, 0]);
  assert.ok(Math.abs(objects[2].position[0] + 11.3) < 1e-5);
});
