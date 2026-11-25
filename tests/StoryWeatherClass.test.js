import test from "node:test";
import assert from "node:assert/strict";
import {storyWeatherClassAt,nativeForecastClass} from "../play/world/StoryWeatherClass.js";
import {StoryRegionRuntime} from "../play/scripts/StoryRegionRuntime.js";
import catalog from "../play/data/story-regions.json" with {type:"json"};

test("personal native forecast prioritizes positive snow, rain, cloud in retail mode 10 order",()=>{
  for(const [channels,expected] of [
    [[1,1,1],3],[[1,1,0],2],[[1,0,0],1],[[0,0,0],0],
  ]) {
    const [cloud,rain,snow]=channels;
    assert.equal(nativeForecastClass({cloud,rain,snow}),expected);
  }
  for (const [day,hour,expected] of [[4,12,0],[8,15,1],[8,12,2],[11,12,3]]) {
    assert.equal(storyWeatherClassAt(new Date(Date.UTC(1986,11,day,hour))),expected);
  }
});

test("Mai's alley accepts snow and overcast, rejects rain, and rechecks while Ryo remains in the lane",async()=>{
  const region=catalog.regions.find(r=>r.id==="s1.mfsy.mai-alley");
  assert.equal(region.nativeWeatherMask,11);
  const flags={};
  const character={id:1,playMode:"story",openingCompleted:true,storyFlags:flags};
  let date=new Date("1986-12-08T12:00:00Z");
  const starts=[];
  const runtime=new StoryRegionRuntime({regions:[region],getGameDate:()=>date,getCharacter:()=>character,
    publishPresence:()=>true,controller:{status:"idle",start:async()=>starts.push(date.toISOString())}});
  const frame={area:region.area,worldId:region.worldId,playerPosition:region.min.map((v,i)=>(v+region.max[i])/2),enabled:true};
  assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-08T15:00:00Z");
  assert.equal(runtime.update(frame),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts.length,1);
  runtime.reset();
  date=new Date("1986-12-11T12:00:00Z");
  assert.equal(runtime.update(frame),true);
});

test("retail E1036 requests the native clock classification and admits mask 11",async t=>{
  const {existsSync,readFileSync}=await import("node:fs");
  const mapPath="extracted_disc2_v2/data/SCENE/02/MFSY/MAPINFO.BIN",exePath=".disc-work/exact/1ST_READ.BIN";
  if(!existsSync(mapPath)||!existsSync(exePath)) return t.skip("requires locally extracted MFSY and executable");
  const map=readFileSync(mapPath),exec=readFileSync(exePath),word=address=>exec.readUInt16LE(address-0x0c010000);
  assert.deepEqual([...map.subarray(0x95f28,0x95f2d)],[8,30,23,29,11]);
  assert.equal(map.readUInt32LE(0x74570),0x275);
  assert.equal(map.readUInt32LE(0x74574),0x176);
  assert.deepEqual([0xc17296c,0xc172976,0xc172980].map(word),[0xff35,0xfe35,0xf435]);
  assert.deepEqual([0xc172974,0xc17297c,0xc172986,0xc17298a].map(word),[0xe503,0xe502,0xe501,0xe500]);
});
