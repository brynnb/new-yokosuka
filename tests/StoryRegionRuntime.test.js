import assert from "node:assert/strict";
import test from "node:test";
import { StoryRegionRuntime, matchesEncounterApproach } from "../play/scripts/StoryRegionRuntime.js";
import storyRegions from "../play/data/story-regions.json" with {type:"json"};
import {moveLearningRoutes} from "../tools/scripting/story-move-learning.mjs";
import investigation from "../tools/scripting/story-investigation.json" with {type:"json"};
import {createScriptEventController} from "../play/scripts/ScriptEventController.js";

test("entry movement is held through the real request boundary and handed off or released on every outcome",async()=>{
  for(const outcome of ["line","declined","rejected","cancelled","reset","timeout"]){
    const locks=new Set(),errors=[];let requestId;
    const acquire=()=>{const owner={};locks.add(owner);return()=>locks.delete(owner);};
    let releasePresentation;
    const controller=createScriptEventController({
      requestTimeoutMs:outcome==="timeout"?10:1000,
      client:{startScriptEvent:(_selector,id)=>{requestId=id;return true;},advanceScriptEvent:()=>true},
      presentation:{begin:()=>{releasePresentation=acquire();},execute:async()=>true,rollback:()=>releasePresentation?.()},
      dialogue:{show(){},showOptions(){},hide(){}},
    });
    const runtime=new StoryRegionRuntime({controller,acquireMovementLock:acquire,onError:e=>errors.push(e),
      getCharacter:()=>({id:1,playMode:"story",openingCompleted:true}),publishPresence:()=>true,
      regions:[{id:"approach",area:"TEST",min:[0,0,0],max:[2,2,2]}]});
    assert.equal(runtime.update({area:"TEST",enabled:true,playerPosition:[1,1,1]}),true);
    assert.equal(locks.size,1,`${outcome}: held before server response`);
    if(outcome==="rejected")controller.handleRejected({requestId,code:"ineligible"});
    else if(outcome==="cancelled")controller.cancel();
    else if(outcome==="reset"){runtime.reset();controller.reset();}
    else if(outcome==="timeout")await new Promise(resolve=>setTimeout(resolve,25));
    else await controller.handleYield({requestId,runId:1,event:{type:outcome},line:{text:"Hello"}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(locks.size,outcome==="line"?1:0,`${outcome}: only accepted presentation retains movement`);
    if(outcome==="line"){controller.reset();assert.equal(locks.size,0);}
    if(["line","declined","reset"].includes(outcome))assert.deepEqual(errors,[]);
    else assert.equal(errors.length,1);
  }
});

test("optional entry offers never preempt an eligible main-story route",()=>{
  const main=investigation.routes.filter(r=>r.trigger==="enter");
  for(const optional of moveLearningRoutes.filter(r=>r.trigger==="enter")){
    for(const story of main.filter(r=>r.area===optional.area))
      assert.ok(optional.priority<(story.priority??200),`${optional.id} must yield to ${story.id}`);
  }
});

test("finishing Fuku's hall conversation does not offer sleep until Ryo approaches the bed",()=>{
  const ids=["s1.jomo.post-chen-home","s1.jomo.hong-kong-savings"];
  const regions=storyRegions.regions.filter(region=>ids.includes(region.id));
  assert.equal(regions.length,2);
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,
    storyFlags:{"story.s1.master-chen-mirror.completed":true}};
  let starts=0;
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>{starts++;}},
    getCharacter:()=>character,publishPresence:()=>true,regions});
  const frame={area:"JOMO",worldId:"interior",enabled:true,playerPosition:[-17.6,0,3.48]};
  assert.equal(runtime.update(frame),true);
  character.storyFlags["story.s1.post-chen-home.completed"]=true;
  assert.equal(runtime.update(frame),false,"the same hall position must not offer sleep");
  assert.equal(starts,1);
  assert.equal(runtime.update({...frame,playerPosition:[-17.6,0,4.1]}),true,"approaching the actual bedside offers sleep");
  assert.equal(starts,2);
});

test("overlapping entry bounds share one offer but later eligibility and real re-entry still work",()=>{
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{}};
  const controller={status:"idle",start:async()=>{controller.status="options";starts++;}};
  let starts=0,published=false;
  const bounds={area:"TEST",min:[0,0,0],max:[2,2,2]};
  const runtime=new StoryRegionRuntime({controller,getCharacter:()=>character,publishPresence:()=>published,
    regions:[{...bounds,id:"story"},{...bounds,id:"optional"},{...bounds,id:"later",requiredFlags:["eligible"]}]});
  const frame={area:"TEST",worldId:"test",enabled:true,playerPosition:[1,1,1]};
  assert.equal(runtime.update(frame),false);assert.equal(runtime.inside.size,0);
  published=true;assert.equal(runtime.update(frame),true);
  assert.deepEqual([...runtime.inside],["story","optional"]);
  controller.status="idle";assert.equal(runtime.update(frame),false);assert.equal(starts,1);
  character.storyFlags.eligible=true;assert.equal(runtime.update(frame),true);assert.equal(starts,2);
  controller.status="idle";runtime.update({...frame,playerPosition:[4,1,1]});
  assert.equal(runtime.update(frame),true);assert.equal(starts,3);
});

test("an entry waits for published presence without consuming its trigger while welcome is pending", () => {
  let online = false, starts = 0;
  const runtime = new StoryRegionRuntime({ controller: { status: "idle", start: async () => starts++ },
    getCharacter: () => ({ id: 1, modeRevision: 0, playMode: "story", openingCompleted: true }),
    publishPresence: () => online, regions: [{ id: "entry", area: "TEST", min: [0, 0, 0], max: [2, 2, 2] }] });
  const frame = { area: "TEST", enabled: true, playerPosition: [1, 1, 1] };
  assert.equal(runtime.update(frame), false); assert.equal(runtime.inside.size, 0); assert.equal(starts, 0);
  online = true; assert.equal(runtime.update(frame), true); assert.equal(starts, 1);
  assert.equal(runtime.update(frame), false);
});

test("race-grid dispatch is scoped to its world even though practice shares MA00",()=>{
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{"story.s1.workday-one-race-entry.completed":true,"story.s1.chicken-race.completed":true}};
  const calls=[];
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>calls.push("race")},getCharacter:()=>character,publishPresence(){return true;}});
  const frame={area:"MA00",worldId:"ma00",enabled:true,playerPosition:[63,0,99]};
  assert.equal(runtime.update(frame),false);
  assert.equal(runtime.update({...frame,worldId:"ma00race"}),true);
  assert.equal(calls.length,1);
});

test("the bedroom only dispatches a deadline film on its personal date and during sleeping hours", () => {
  const ids = ["s1.jomo.shenhua-warning", "s1.jomo.bad-ending"];
  const regions = storyRegions.regions.filter(region => ids.includes(region.id));
  assert.equal(regions.length, 2);
  let date;
  const runtime = new StoryRegionRuntime({
    regions, getGameDate: () => date, publishPresence: () => true,
    controller: {status: "idle", start: async () => ({outcome: "declined"})},
    getCharacter: () => ({id: 1, playMode: "story", openingCompleted: true}),
  });
  for (const [when, id] of [
    ["1987-03-30T21:00:00Z", null], ["1987-03-31T19:59:00Z", null],
    ["1987-03-31T20:00:00Z", ids[0]], ["1987-04-01T20:00:00Z", null],
    ["1987-04-13T20:00:00Z", null], ["1987-04-14T20:00:00Z", ids[1]],
    ["1987-04-22T20:00:00Z", ids[1]], ["1987-04-30T20:00:00Z", null],
  ]) {
    date = new Date(when);
    const sent = runtime.update({area: "JOMO", worldId: "interior", playerPosition: [-18,0,4], enabled: true});
    assert.equal(sent, Boolean(id), when);
    assert.deepEqual([...runtime.inside], id ? [id] : [], when);
  }
});

test("a saved-day appointment re-arms after midnight without fabricating eligibility",()=>{
  let date=new Date("1986-12-23T20:00:00Z");const calls=[];
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>{calls.push(date.toISOString());return{outcome:"declined"};}},
    getCharacter:()=>character,getGameDate:()=>date,publishPresence(){return true;},
    regions:[{id:"appointment",area:"JOMO",min:[0,0,0],max:[2,2,2],completedFlag:"called",recheckOnDayChange:true}]});
  const frame={area:"JOMO",playerPosition:[1,1,1],enabled:true};
  assert.equal(runtime.update(frame),true);assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-23T23:59:00Z");assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-24T08:30:00Z");assert.equal(runtime.update(frame),true);
  assert.equal(calls.length,2);assert.deepEqual(character.storyFlags,{});
  character.storyFlags.called=true;date=new Date("1986-12-25T08:30:00Z");assert.equal(runtime.update(frame),false);
});

test("the daily allowance approach rechecks the personal day without dispatching every frame",()=>{
  const region=storyRegions.regions.find(r=>r.id==="s1.jomo.daily-allowance");
  assert.ok(region);
  let date=new Date("1986-12-03T09:00:00Z"),starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>{starts++;}},getCharacter:()=>character,
    getGameDate:()=>date,publishPresence:()=>true,regions:[region]});
  const frame={area:"JOMO",worldId:"interior",enabled:true,playerPosition:[-15.6,0,3.6]};
  assert.equal(runtime.update(frame),false,"first allowance is a prerequisite");
  character.storyFlags["story.s1.first-allowance.completed"]=true;
  assert.equal(runtime.update(frame),true);assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-04T09:00:00Z");assert.equal(runtime.update(frame),true);
  assert.equal(runtime.update(frame),false);assert.equal(starts,2);
  character.playMode="free_roam";runtime.reset();assert.equal(runtime.update(frame),false);
});

test("malformed personal-hour metadata is an error, not an invisible missing event",()=>{
  for(const hours of [[19], [19,19], [24,6], [19,NaN], "night"])
    assert.throws(()=>new StoryRegionRuntime({controller:{},getCharacter(){},publishPresence(){},regions:[{id:"broken",hours}]}),/Invalid story region hours: broken/);
});

test("reward-free room travel remains repeatable but latches until physical re-entry", async () => {
  let starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{solved:true,visited:true}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,publishPresence(){return true;},
    regions:[{id:"descent",area:"JHD0",min:[10,0,-23],max:[11,3,-21],requiredFlags:["solved"],completedFlag:"visited",repeatable:true}]});
  const frame={area:"JHD0",playerPosition:[10.3,1,-22.5],enabled:true};
  assert.equal(runtime.update(frame),true);assert.equal(runtime.update(frame),false);
  runtime.update({...frame,playerPosition:[9.5,1,-22.5]});assert.equal(runtime.update(frame),true);
  assert.equal(starts,2);
  character.playMode="free_roam";runtime.reset();assert.equal(runtime.update(frame),false);
});

test("first-visit gate advice is retired after Chen recognizes the player", () => {
  let starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,
    storyFlags:{"story.s1.warehouse-eight-overheard.completed":true,"story.s1.master-chen.completed":true}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,
    getGameDate:()=>new Date("1986-12-22T12:00:00Z"),publishPresence(){return true;},
    regions:[{id:"first-gate",area:"MFSY",min:[114,-.5,-18],max:[122,2,-7],
      requiredFlags:["story.s1.warehouse-eight-overheard.completed"],excludedFlags:["story.s1.master-chen.completed"]}]});
  assert.equal(runtime.update({area:"MFSY",playerPosition:[118,0,-12],enabled:true}),false);
  assert.equal(starts,0);
});

test("Fuku's travel advice waits until the player crosses the real room threshold",()=>{
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,
    storyFlags:{"story.s1.hong-kong-savings.completed":true}};
  let starts=0;
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,publishPresence(){return true;}});
  assert.equal(runtime.update({area:"JOMO",playerPosition:[-21.89,0,.31],enabled:true}),false); // door-opening alignment, still in hall
  assert.equal(runtime.update({area:"JOMO",playerPosition:[-22.09458,0,-1.100586],enabled:true}),true);
  assert.equal(starts,1);
});

test("completed bedroom advice does not retire the later earned contribution",()=>{
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{
    "story.s1.hong-kong-savings.completed":true,"story.s1.fuku-travel-advice.completed":true}};
  const calls=[];
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async event=>calls.push(event)},getCharacter:()=>character,publishPresence(){return true;}});
  const frame={area:"JOMO",playerPosition:[-22,0,-1.1],enabled:true};
  assert.equal(runtime.update(frame),false);
  character.storyFlags["story.s1.airfare-quoted"]=true;
  assert.equal(runtime.update(frame),true);assert.equal(calls.length,1);
  runtime.reset();character.storyFlags["story.s1.fuku-travel-funds.completed"]=true;
  assert.equal(runtime.update(frame),false);
});

test("personal time opens the night gate without requiring physical re-entry",()=>{
  let date=null;const calls=[];
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{}};
  const region={id:"night",area:"TEST",hours:[19,24],min:[0,0,0],max:[2,2,2]};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>calls.push(date.getTime())},getCharacter:()=>character,getGameDate:()=>date,publishPresence(){return true;},regions:[region]});
  const frame={area:"TEST",playerPosition:[1,1,1],enabled:true};
  assert.equal(runtime.update(frame),false); // Clock has not arrived yet.
  date=new Date("1986-12-16T18:59:59Z");assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-16T19:00:00Z");assert.equal(runtime.update(frame),true);assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-17T00:00:00Z");assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-17T19:00:00Z");assert.equal(runtime.update(frame),true);
  assert.equal(calls.length,2);
});

test("time-gated investigation regions match their server windows and the ambush re-arms at night",()=>{
  // These windows mirror the official Yarn gates. The client controls dispatch
  // only: the server still owns date, inventory and final eligibility checks.
  // Only entry regions dispatch automatically. Talk/use routes may share an
  // ungated proximity region with an independently timed Yarn interaction.
  const gated=investigation.routes.filter(route=>route.trigger==="enter"&&route.bounds&&route.hours);
  assert.ok(gated.length>10);
  for(const route of gated){
    const region=storyRegions.regions.find(item=>item.id===route.bounds);
    assert.ok(region,`${route.id} has a dispatch region`);
    assert.deepEqual(region.hours,route.hours,route.id);
  }
  // This earlier event uses its own official-script source, not the catalog.
  assert.deepEqual(storyRegions.regions.find(region=>region.id==="s1.d000.heartbeats-alley")?.hours,[19,24]);
  const region=storyRegions.regions.find(item=>item.id==="s1.d000.arcade-ambush");
  let date=new Date("1986-12-04T18:59:59Z"),starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{
    "story.s1.heartbeats-bar.completed":true,"notebook.s1.charlie-evening":true}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,
    getGameDate:()=>date,publishPresence:()=>true,regions:[region]});
  const frame={area:"D000",worldId:"dobuita",playerPosition:[-19.76,0,29.2],enabled:true};
  assert.equal(runtime.update(frame),false);assert.equal(starts,0);
  date=new Date("1986-12-04T19:00:00Z");assert.equal(runtime.update(frame),true);assert.equal(starts,1);
  assert.equal(runtime.update(frame),false);assert.equal(starts,1);
});

test("overnight dispatch uses the same inclusive-start exclusive-end rule",()=>{
  let date=new Date("1986-12-16T21:59:59Z"),starts=0;
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>({id:1,modeRevision:0,playMode:"story",openingCompleted:true}),getGameDate:()=>date,publishPresence(){return true;},regions:[{id:"overnight",area:"TEST",hours:[22,6],min:[0,0,0],max:[2,2,2]}]});
  const frame={area:"TEST",playerPosition:[1,1,1],enabled:true};
  assert.equal(runtime.update(frame),false);date=new Date("1986-12-16T22:00:00Z");assert.equal(runtime.update(frame),true);
  date=new Date("1986-12-17T05:59:59Z");assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-17T06:00:00Z");assert.equal(runtime.update(frame),false);assert.equal(starts,1);
});

test("use-only proximity bounds do not automatically call a telephone",()=>{
  let starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,
    storyFlags:{"story.s1.xia-letter-translation.completed":true}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,publishPresence(){return true;}});
  assert.equal(runtime.update({area:"D000",playerPosition:[-38,0,10],enabled:true}),false);
  assert.equal(runtime.update({area:"JOMO",playerPosition:[-15.5,0,2],enabled:true}),false);
  assert.equal(starts,0);
});

test("home scrolls require using their placed objects and never interrupt a room approach",()=>{
  const routes=moveLearningRoutes.filter(route=>["twin-blades-scroll","shadow-reaper-scroll"].includes(route.id));
  assert.deepEqual(routes.map(route=>[route.trigger,route.object]),[["use","imk1"],["use","bkgu"]]);
  const regions=storyRegions.regions.filter(region=>routes.some(route=>route.bounds===region.id));
  assert.equal(regions.length,2);assert.ok(regions.every(region=>region.trigger==="use"));
  let starts=0;
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},
    getCharacter:()=>({id:1,modeRevision:0,playMode:"story",openingCompleted:true}),publishPresence:()=>true,regions});
  for(const region of regions){
    const point=region.min.map((value,index)=>(value+region.max[index])/2);
    assert.equal(runtime.update({area:"JOMO",worldId:"interior",playerPosition:point,enabled:true}),false);
  }
  assert.equal(starts,0);
});

test("dojo entry waits for the previous milestone even when already inside", () => {
  const character = { id: 1, modeRevision: 0, playMode: "story", openingCompleted: true, storyFlags: {} };
  let starts = 0;
  const runtime = new StoryRegionRuntime({ controller: { status: "idle", start: async () => { starts++; } },
    getCharacter: () => character, publishPresence() { return true; } });
  const frame = { area: "JHD0", playerPosition: [4.6, 1, -20], enabled: true };
  assert.equal(runtime.update(frame), false);
  character.storyFlags["story.s1.first-allowance.completed"] = true;
  assert.equal(runtime.update(frame), true);
  assert.equal(starts, 1);
});

test("the hallway trigger waits for eligibility, publishes presence first, and dispatches once per entry", async () => {
  const calls = [], character = { id: 1, modeRevision: 0, playMode: "story", openingCompleted: false };
  const controller = { status: "idle", start: async (selector, context) => { calls.push([selector, context]); return { outcome: "started" }; } };
  const runtime = new StoryRegionRuntime({ controller, getCharacter: () => character, publishPresence: () => { calls.push("presence"); return true; } });
  const frame = { area: "JOMO", playerPosition: [-16.75, 0, 1], enabled: true };
  assert.equal(runtime.update(frame), false);
  character.openingCompleted = true;
  assert.equal(runtime.update({ ...frame, playerPosition: [-17.6, 0, 4.1] }), false);
  controller.status = "running";
  assert.equal(runtime.update(frame), false);
  controller.status = "idle";
  assert.equal(runtime.update({ ...frame, playerPosition: { x: -16.75, y: 0, z: 1 } }), true);
  assert.deepEqual(calls, ["presence", [{ kind: "enter" }, { area: "JOMO" }]]);
  assert.equal(runtime.update(frame), false);
  runtime.update({ ...frame, playerPosition: [0, 0, 0] });
  character.storyFlags = { "story.s1.first-allowance.completed": true };
  assert.equal(runtime.update(frame), false);
  character.playMode = "free_roam";
  assert.equal(runtime.update(frame), false);
});

test("a failed scene can retry after re-entry or reconnect without dispatching every frame", async () => {
  let attempts = 0, errors = 0;
  const runtime = new StoryRegionRuntime({ controller: { status: "idle", start: async () => { attempts++; throw Error("offline"); } },
    getCharacter: () => ({ id: 1, modeRevision: 0, playMode: "story", openingCompleted: true }),
    publishPresence() { return true; }, onError: () => errors++ });
  const frame = { area: "JOMO", playerPosition: [-16.75, 0, 1], enabled: true };
  runtime.update(frame); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 1); assert.equal(errors, 1);
  runtime.reset(); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
});

test("owned actor staging cannot create a fake exit and replay after cancellation",()=>{
  let starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true};
  const controller={status:"idle",start:async()=>{starts++;controller.status="running";}};
  const region={id:"encounter",area:"TEST",min:[0,0,0],max:[2,2,2]};
  const runtime=new StoryRegionRuntime({controller,getCharacter:()=>character,publishPresence(){return true;},regions:[region]});
  const frame={area:"TEST",playerPosition:[1,1,1],enabled:true};
  assert.equal(runtime.update(frame),true);
  assert.equal(runtime.update({...frame,playerPosition:[9,1,9]}),false); // Private combat/camera pose.
  assert.equal(runtime.inside.has(region.id),true);
  controller.status="idle";
  assert.equal(runtime.update(frame),false); // Restored approach is not a new entry.
  assert.equal(starts,1);
  runtime.update({...frame,playerPosition:[9,1,9]}); // Real gameplay movement.
  assert.equal(runtime.update(frame),true);assert.equal(starts,2);
  controller.status="running";character.modeRevision++;
  runtime.update(frame);assert.equal(runtime.inside.size,0); // Real context changes still fence ownership.
});

test("optional encounter regions use the original three-dimensional distance, bearing and separate player-facing gate", () => {
  const stand = {center:[2,0,103.8],radius:8,bearing:8192,tolerance:16384};
  assert.equal(matchesEncounterApproach(stand, [-3,0,105], 0), true);
  assert.equal(matchesEncounterApproach(stand, [-3,0,105], Math.PI), true);
  assert.equal(matchesEncounterApproach(stand, [0,0,102], 0), false);
  assert.equal(matchesEncounterApproach(stand, [-3,9,105], 0), false);
  const bar = {center:[-115.480003,.1,98.703003],radius:3,bearing:0,tolerance:32768,
    facing:[35589,57435],plane:[-2.4,-178.651]};
  assert.equal(matchesEncounterApproach(bar, [115.48,.1,100.05], -4), true);
  assert.equal(matchesEncounterApproach(bar, [115.48,.1,100.05], 0), false);
  assert.equal(matchesEncounterApproach(bar, [116,.1,98.7], -4), false);
  assert.equal(matchesEncounterApproach(bar, [115.48,4,100.05], -4), false);
});

test("Mai's alley uses both horizontal coordinates even on sloped ground", () => {
  const region = storyRegions.regions.find(item => item.id === "s1.mfsy.mai-alley");
  const runtime = new StoryRegionRuntime({
    controller: { status: "idle", start: async () => {} },
    getCharacter: () => ({ id: 1, playMode: "story", openingCompleted: true }),
    getGameDate: () => new Date("1986-12-04T12:00:00Z"),
    publishPresence: () => true,
    regions: [region],
  });
  const enter = (x, y, z) => runtime.update({ area: "MFSY", worldId: "mfsy", enabled: true, playerPosition: [x, y, z] });
  assert.equal(enter(-127, 0, 20), false);
  assert.equal(enter(-125, 0, 43), false);
  assert.equal(enter(-125, 7, 20), true);
});

test("Fuku’s hall offers accept named and native milestones and respect both expiry flags", () => {
  const offers = [
    ["s1.jomo.fuku-translated-letter", [155, 180], "story.s1.fuku-letter-gate.completed", 190],
    ["s1.jomo.fuku-after-jimmy", [400], "story.s1.jimmy-interrogation.completed", 410],
  ];
  for (const [id, bits, receipt, expiry] of offers) {
    const region = storyRegions.regions.find(entry => entry.id === id);
    const flags = {}, native = new Set();
    const runtime = new StoryRegionRuntime({
      regions: [region], controller: { status: "idle", start: async () => true },
      getCharacter: () => ({id: 10, playMode: "story", openingCompleted: true, storyFlags: flags}),
      getGameDate: () => new Date("1986-12-04T20:00:00Z"),
      hasNativeFlag: bit => native.has(bit), publishPresence: () => true,
    });
    const enter = () => runtime.update({ area: "JOMO", worldId: "interior", playerPosition: [-15, 0, 2], enabled: true });
    assert.equal(enter(), false);
    for (const bit of bits) native.add(bit);
    assert.equal(enter(), true);
    runtime.reset();
    native.delete(bits[0]);
    flags[receipt] = true;
    assert.equal(enter(), true);
    runtime.reset();
    native.add(expiry);
    assert.equal(enter(), false);
  }
});


test("both Warehouse No. 8 listening entrances require a native height above four metres", () => {
  for (const id of ["s1.ms8s.warehouse-eight-office", "s1.ms8s.warehouse-eight-overheard"]) {
    const region = storyRegions.regions.find(region => region.id === id);
    for (const [height, expected] of [[3.5, false], [4, false], [4 + 2 ** -23, false],
      [4 + 2 ** -21, true], [4.275, true]]) {
      assert.equal(matchesEncounterApproach(region.nativeApproach, [-19.1, height, 137.16], 0),
        expected, id + " at " + height);
    }
  }
});

test("the two park entrances check original heading, STEP, street encounter, weather and player control", () => {
  for (const [variant, position, start, end] of [
    ["main",[-18,0,4],0x0e38,0x71c7],
    ["alternate",[-11,0,11],0xc71c,0x2aaa],
  ]) {
    const region = storyRegions.regions.find(entry => entry.id === "s1.jd00.nozomi-park-rescue-"+variant);
    const bits = new Set([100,852]);
    const legacyFlags = {};
    let day = 4, ready = true;
    const runtime = new StoryRegionRuntime({
      regions:[region], controller:{status:"idle",start:async()=>true},
      getCharacter:()=>({id:1,playMode:"story",openingCompleted:true,storyFlags:legacyFlags}),
      getGameDate:()=>new Date(Date.UTC(1986,11,day,12)),
      hasPrimaryControl:()=>ready, hasNativeFlag:bit=>bits.has(bit), publishPresence:()=>true,
    });
    const enter = turn => runtime.update({area:"JD00",worldId:"sakuragaoka",playerPosition:position,
      playerYaw:-(turn+.25)*2*Math.PI/65536,enabled:true});
    for (const [turn, allowed] of [[start-1,false],[start,true],[end,true],[end+1,false],[0,start>end]]) {
      runtime.reset();
      assert.equal(enter(turn),allowed,variant+" raw yaw "+turn);
    }
    runtime.reset(); ready=false; assert.equal(enter(start),false);
    ready=true; bits.delete(852); assert.equal(enter(start),false);
    bits.add(852); bits.delete(100); bits.add(90); assert.equal(enter(start),false);
    bits.add(100); bits.add(801); assert.equal(enter(start),false);
    bits.delete(801); day=8; assert.equal(enter(start),false);
    day=11; assert.equal(enter(start),true);
    bits.delete(100);
    legacyFlags["story.s1.parking-lot-ambush.completed"] = true;
    runtime.reset(); assert.equal(enter(start), true, "legacy ambush admits the park");
    for (const receipt of ["story.s1.charlie-tattoo-confrontation.completed", "story.s1.chinese-letter.completed"]) {
      legacyFlags[receipt] = true;
      runtime.reset(); assert.equal(enter(start), false, "later saved event closes the park");
      delete legacyFlags[receipt];
    }
    bits.add(155);
    runtime.reset(); assert.equal(enter(start), false, "later native STEP outranks the ambush receipt");
  }
});
