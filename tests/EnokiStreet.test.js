import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {StoryRegionRuntime} from "../play/scripts/StoryRegionRuntime.js";
import scenes from "../play/data/authored-story-scenes.json" with {type:"json"};
import catalog from "../play/data/story-regions.json" with {type:"json"};
import challenges from "../play/data/story-challenges.json" with {type:"json"};
import {NATIVE_DIALOGUE_PREDICATE_DATA} from "../play/data/dialogue/nativePredicateValues.generated.js";

const id="s1.d000.enoki-street";
test("the original street strip only dispatches at the eligible STEP, time and position", async () => {
  const region=catalog.regions.find(row=>row.id===id);
  const bits=new Set([30]);
  let date=new Date("1986-12-04T10:59:00Z");
  const calls=[];
  const runtime=new StoryRegionRuntime({regions:[region],controller:{status:"idle",start:async event=>calls.push(event)},
    getCharacter:()=>({id:1,playMode:"story",openingCompleted:true,storyFlags:{}}),getGameDate:()=>date,
    hasNativeFlag:index=>bits.has(index),publishPresence:()=>true});
  const frame={area:"D000",worldId:"dobuita",playerPosition:[65,0,47],enabled:true};
  assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-04T11:00:00Z");assert.equal(runtime.update(frame),false);
  bits.add(65);
  assert.equal(runtime.update({...frame,playerPosition:[65,0,40.8]}),false);
  assert.equal(runtime.update({...frame,playerPosition:[65,0,53]}),false);
  assert.equal(runtime.update(frame),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  runtime.reset(); bits.add(100);
  assert.equal(runtime.update(frame),false);
  bits.delete(100);bits.add(852);
  assert.equal(runtime.update(frame),false);
});
test("the street encounter uses the three recovered inputs, original bank and both native casts",()=>{
  const keys=challenges.challenges.find(row=>row.id===id).buttons;
  assert.deepEqual(keys,["Left","A","B"]);
  assert.equal(scenes.motionBanks.enokiStreet,"play/assets/dobuita/enoki-street/M_DEQB.MOTN");
  for (const phase of ["intro","win","miss"]){
    const s=scenes.scenes.find(row=>row.id===id+"-"+phase);
    assert.deepEqual(s.actors.map(a=>a.tag),["AKIR","ENKI","NGSM"]);
    assert.ok(s.actors.some(a=>a.motion.bank==="enokiStreet"));
  }
  const table=NATIVE_DIALOGUE_PREDICATE_DATA.storyStep;
  assert.equal(table.records.find(r=>r.bank2Bit===65).step,24);
  const yarn=readFileSync(new URL("../tools/scripting/story-enoki-street.yarn",import.meta.url),"utf8");
  assert.equal([...yarn.matchAll(/\{\{voice:E1064[A-C]\d{3}\}\}/g)].length,16);
});

const map = new URL("../extracted_files/data/SCENE/01/D000/MAPINFO.BIN",import.meta.url);
test("D000 selector literals and the DEQB input table agree with the street admission and clean path",{skip:!existsSync(map)},()=>{
  const source=readFileSync(map);
  const region=catalog.regions.find(row=>row.id===id);
  assert.deepEqual([0x77abc,0x77b1c,0x77b20,0x77b80,0x77b84].map(offset=>source.readFloatLE(offset)),region.nativeStreetStrip);
  assert.deepEqual([0x77a58,0x77a5c,0x77a60].map(offset=>source.readUInt32LE(offset)),[201,303,852]);
  const formatStep=value=>Math.floor(value/10)*100+value%10;
  assert.deepEqual(region.nativeStep.map(formatStep),[201,303]);
  for (const [i, mask] of [0x40,0x100,0x200,0x100].entries()) {
    assert.deepEqual([0,4,8,12].map(offset=>source.readUInt32LE(0xb1db4+48*i+offset)),[mask,20,16,4]);
  }
});
