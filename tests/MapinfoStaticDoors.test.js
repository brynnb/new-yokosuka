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

const ms8sPath="extracted_disc2_v2/data/SCENE/02/MS8S/MAPINFO.BIN";
test("MS8S preserves all three repeated CHRT door image aliases and their native upper COLS hinges", {
  skip: !fs.existsSync(ms8sPath),
}, () => {
  const original=extractMapinfoStaticDoors(fs.readFileSync(ms8sPath),"S2_MS8S_",{MS8S_DOOR:"DR02_026"});
  const built=JSON.parse(fs.readFileSync("play/data/ms8s-static-doors.json","utf8"));
  assert.equal(original.nameTableOffset,0x2b4dc);
  assert.equal(original.recordsOffset,0x2b52c);
  assert.deepEqual(original.modelNames,Array(3).fill("MS8S_DOOR"));
  assert.deepEqual(original.placements,built.placements);
  const collision=JSON.parse(fs.readFileSync("public/data/native-collisions/MS8S.json","utf8"));
  const variant=collision.variants[collision.discVariants["2"]];
  const upper=variant.fields.find(field=>field.id==="0001").sections[0].records;
  const offsets=[960,616,644];
  for (const [index,door] of built.placements.entries()) {
    const segment=upper.find(record=>record.recordOffset===offsets[index]);
    assert.equal(segment.code,100);
    const [x,y,z]=door.position;
    assert.equal(y,4.28);
    assert.ok([segment.geometry.start,segment.geometry.end].some(([sx,sz])=>Math.hypot(x+sx,z+sz)<0.12));
  }
});
