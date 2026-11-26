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
  const steps=challenges.challenges.find(row=>row.id===id).steps;
  assert.deepEqual(steps.map(step=>step.buttons),[["Left"],["A"],["B"]]);
  assert.deepEqual(steps.map(step=>step.recoveryButton),["Left","A","A"]);
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
test("D000 selector literals and the DEQB input table agree with the street admission, clean and recovery inputs",{skip:!existsSync(map)},()=>{
  const source=readFileSync(map);
  const region=catalog.regions.find(row=>row.id===id);
  assert.deepEqual([0x77abc,0x77b1c,0x77b20,0x77b80,0x77b84].map(offset=>source.readFloatLE(offset)),region.nativeStreetStrip);
  assert.deepEqual([0x77a58,0x77a5c,0x77a60].map(offset=>source.readUInt32LE(offset)),[201,303,852]);
  const formatStep=value=>Math.floor(value/10)*100+value%10;
  assert.deepEqual(region.nativeStep.map(formatStep),[201,303]);
  for (const [i, mask] of [0x40,0x100,0x200,0x100].entries()) {
    assert.deepEqual([0,4,8,12].map(offset=>source.readUInt32LE(0xb1db4+48*i+offset)),[mask,20,16,4]);
  }

  const steps=challenges.challenges.find(row=>row.id===id).steps;
  const buttonsByMask=new Map([[0x40,"Left"],[0x100,"A"],[0x200,"B"]]);
  const promptSites=[[0x95bda,0x95d8c],[0x961ba,0x96324],[0x968c2,0x96a8c]];
  for(const [i,pair] of promptSites.entries()){
    const buttons=pair.map(site=>{
      const load=source.readUInt16LE(site-2);
      assert.equal(load>>>8,0xd1); // mov.l @(disp,pc),r1
      assert.equal(source.readUInt16LE(site),0x0103); // bsrf r1
      const targetLiteral=((site+2)&~3)+(load&255)*4;
      assert.equal(site+4+source.readInt32LE(targetLiteral),0x9191c);
      const rowInstruction=source.readUInt16LE(site-14);
      assert.equal(rowInstruction>>>8,0xe6); // mov #row,r6
      const record=0xb1db4+48*(rowInstruction&255);
      const inputFrames=source.readUInt32LE(record+8)+source.readUInt32LE(record+12);
      assert.equal(steps[i].windowMs,Math.round(1000*inputFrames/30));
      return buttonsByMask.get(source.readUInt32LE(record));
    });
    assert.deepEqual(buttons,[steps[i].buttons[0],steps[i].recoveryButton]);
  }
  // The prompt reads input duration separately from the icon duration.
  assert.equal(source.readUInt32LE(0x9160c)+0x1338,0x91b58);
  assert.equal(source.subarray(0x91b64,0x91b6c).toString("hex"),"e555e7566c355224");
  assert.equal(source.subarray(0x91b72,0x91b7a).toString("hex"),"e655e7566c355224");
  assert.equal(source.readUInt16LE(0x91c1a),0x54e0); // input ticks from local word 0
  assert.equal(source.readUInt16LE(0x91c1e),0x55e4); // input mask from argument 0
});
