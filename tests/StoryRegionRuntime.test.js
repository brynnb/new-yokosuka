import assert from "node:assert/strict";
import test from "node:test";
import { StoryRegionRuntime } from "../play/scripts/StoryRegionRuntime.js";

test("malformed personal-hour metadata is an error, not an invisible missing event",()=>{
  for(const hours of [[19], [19,19], [24,6], [19,NaN], "night"])
    assert.throws(()=>new StoryRegionRuntime({controller:{},getCharacter(){},publishPresence(){},regions:[{id:"broken",hours}]}),/Invalid story region hours: broken/);
});

test("personal time opens the night gate without requiring physical re-entry",()=>{
  let date=null;const calls=[];
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,storyFlags:{}};
  const region={id:"night",area:"TEST",hours:[19,24],min:[0,0,0],max:[2,2,2]};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>calls.push(date.getTime())},getCharacter:()=>character,getGameDate:()=>date,publishPresence(){},regions:[region]});
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
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>({id:1,modeRevision:0,playMode:"story",openingCompleted:true}),getGameDate:()=>date,publishPresence(){},regions:[{id:"overnight",area:"TEST",hours:[22,6],min:[0,0,0],max:[2,2,2]}]});
  const frame={area:"TEST",playerPosition:[1,1,1],enabled:true};
  assert.equal(runtime.update(frame),false);date=new Date("1986-12-16T22:00:00Z");assert.equal(runtime.update(frame),true);
  date=new Date("1986-12-17T05:59:59Z");assert.equal(runtime.update(frame),false);
  date=new Date("1986-12-17T06:00:00Z");assert.equal(runtime.update(frame),false);assert.equal(starts,1);
});

test("use-only proximity bounds do not automatically call a telephone",()=>{
  let starts=0;
  const character={id:1,modeRevision:0,playMode:"story",openingCompleted:true,
    storyFlags:{"story.s1.xia-letter-translation.completed":true}};
  const runtime=new StoryRegionRuntime({controller:{status:"idle",start:async()=>starts++},getCharacter:()=>character,publishPresence(){}});
  assert.equal(runtime.update({area:"D000",playerPosition:[-38,0,10],enabled:true}),false);
  assert.equal(runtime.update({area:"JOMO",playerPosition:[-15.5,0,2],enabled:true}),false);
  assert.equal(starts,0);
});

test("dojo entry waits for the previous milestone even when already inside", () => {
  const character = { id: 1, modeRevision: 0, playMode: "story", openingCompleted: true, storyFlags: {} };
  let starts = 0;
  const runtime = new StoryRegionRuntime({ controller: { status: "idle", start: async () => { starts++; } },
    getCharacter: () => character, publishPresence() {} });
  const frame = { area: "JHD0", playerPosition: [4.6, 1, -20], enabled: true };
  assert.equal(runtime.update(frame), false);
  character.storyFlags["story.s1.first-allowance.completed"] = true;
  assert.equal(runtime.update(frame), true);
  assert.equal(starts, 1);
});

test("the hallway trigger waits for eligibility, publishes presence first, and dispatches once per entry", async () => {
  const calls = [], character = { id: 1, modeRevision: 0, playMode: "story", openingCompleted: false };
  const controller = { status: "idle", start: async (selector, context) => { calls.push([selector, context]); return { outcome: "started" }; } };
  const runtime = new StoryRegionRuntime({ controller, getCharacter: () => character, publishPresence: () => calls.push("presence") });
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
    publishPresence() {}, onError: () => errors++ });
  const frame = { area: "JOMO", playerPosition: [-16.75, 0, 1], enabled: true };
  runtime.update(frame); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 1); assert.equal(errors, 1);
  runtime.reset(); runtime.update(frame);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
});
