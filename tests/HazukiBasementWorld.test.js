import test from "node:test";
import assert from "node:assert/strict";
import {WORLDS} from "../play/config/worlds.js";
import destinations from "../play/data/story-destinations.json" with {type:"json"};

test("basement travel uses one reviewed room/arrival and never stacks every prop at origin",()=>{
  const room=WORLDS.ydb1;
  assert.equal(room.nativeArea,"YDB1");assert.equal(room.interior,true);
  assert.equal(room.prefix,"S2_YDB1");
  for(const file of ["S2_YDB1_MAP.MT5","S2_YDB1_MAP01.MT5"])assert.equal(room.includeFile(file),true);
  for(const file of ["S2_YDB1_FUK_M.MT5","S2_YDB1_PNX02M1G.MT5","S2_YDB1_MAP02.MT5"])assert.equal(room.includeFile(file),false);
  assert.deepEqual(room.placements.map(p=>p.runtime.objectTag).sort(), ["AXE_", "BOOK", "HOKY", "KABE", "SHEF"]);
  const scroll = room.placements.find(p => p.runtime.objectTag === "BOOK");
  // Disc 2 YDB1 CHARA.CHRT record 0x1520. Browser space reflects X, yaw and roll.
  assert.equal(scroll.model, "S2_YDB1_MKIS3C3G.MT5");
  assert.deepEqual(scroll.position, [-2.803, 1.002, 7.4078].map(Math.fround));
  assert.deepEqual(scroll.rotationDegrees, [270, -180, -180]);
  assert.equal(scroll.runtime.initiallyEnabled, true);
  assert.ok(room.placements.every(p=>p.position.every(Number.isFinite)&&p.position.some(v=>v!==0)&&p.provenance));
  assert.equal(room.placements.find(p=>p.runtime.objectTag==="HOKY").runtime.initiallyEnabled,false);
  assert.equal(room.placements.find(p=>p.runtime.objectTag==="KABE").runtime.initiallyEnabled,false);
  const entry=destinations.destinations.find(d=>d.id==="s1.home.basement-entry");
  assert.equal(entry.worldId,room.id);assert.deepEqual(entry.position,room.spawn.asArray());assert.equal(entry.yaw,room.yaw);
  const exit=destinations.destinations.find(d=>d.id==="s1.home.dojo-from-basement");
  assert.equal(exit.worldId,"exterior");assert.equal(exit.entry,6);assert.ok(exit.position[0]<10.05);
});
