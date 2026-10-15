import assert from "node:assert/strict";
import test from "node:test";
import { StoryRegionRuntime } from "../play/scripts/StoryRegionRuntime.js";

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
