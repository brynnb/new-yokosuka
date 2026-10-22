import assert from "node:assert/strict";
import test from "node:test";
import {StoryDrivingRuntime} from "../play/scripts/StoryDrivingRuntime.js";
import catalog from "../play/data/story-driving.json" with {type:"json"};
import {DEFAULT_CONTROL_BINDINGS} from "../play/settings/GeneralPreferences.js";

function harness(){
  const calls=[];let prepare=async()=>true,loadObjects=async()=>true;
  const transforms=[];
  const actors={prepare:(...args)=>prepare(...args),begin:()=>calls.push("actors-begin"),end:()=>calls.push("actors-end"),applyTransform:(_owner,tag,pose)=>{transforms.push({tag,pose});return true;},activeActor:()=>({model:{}})};
  const objects=()=>({load:()=>loadObjects(),begin:()=>calls.push("bike-begin"),end:()=>calls.push("bike-end"),applyTransform:(_owner,tag,pose)=>{transforms.push({tag,pose});return true;},clear:()=>calls.push("bike-clear")});
  const controller={setFirstPerson(){},updateCamera(){}};
  const runtime=new StoryDrivingRuntime({actors,motionRuntime:{loadNamedSelections:async()=>true,applyNamed:()=>true},getController:()=>controller,getBinding:key=>DEFAULT_CONTROL_BINDINGS[key],capturePlayerState:()=>"snapshot",restorePlayerState:s=>calls.push(s),createSceneObjects:objects,onIntent:(...args)=>{calls.push(args);return true;},target:new EventTarget()});
  const d=catalog.challenges[0],prompt={id:d.id,token:"a".repeat(32),ready:false,driving:{worldId:d.worldId,sequence:0,speed:0,actor:{tag:"AKIR",x:d.player[0],y:d.player[1],z:d.player[2],yaw:d.player[3]}}};
  return {runtime,calls,prompt,transforms,transaction:{area:"NBIK"},setPrepare:fn=>prepare=fn,setObjectLoad:fn=>loadObjects=fn};
}
test("motorcycle prepares original assets before ready, sends controls only and restores ownership",async()=>{
  const h=harness();await h.runtime.show(h.prompt,h.transaction);
  assert.deepEqual(h.calls.slice(0,3),["actors-begin","bike-begin",["challenge_ready",h.prompt.token]]);
  assert.equal(h.transforms[0].pose.x,-h.prompt.driving.actor.x);assert.deepEqual(h.transforms[0].pose,h.transforms[1].pose);
  await h.runtime.show({...h.prompt,ready:true},h.transaction);
  h.runtime.active.input.held.add("KeyW");h.runtime.active.input.held.add("KeyD");h.runtime.update(h.transaction,.1);
  const input=h.calls.find(c=>Array.isArray(c)&&c[0]==="challenge_move")[2];assert.deepEqual(input,{sequence:1,throttle:1,brake:0,steering:1});
  h.runtime.control("throttle",false);h.runtime.control("brake",true);h.runtime.active.input.held.clear();h.runtime.update(h.transaction,.1);
  assert.equal(h.calls.at(-1)[2].brake,1);
  assert.equal(h.runtime.finish(h.transaction),true);assert.equal(h.runtime.active,null);assert.equal(h.calls.at(-1),"snapshot");assert.ok(h.calls.includes("bike-end"));assert.ok(h.calls.includes("actors-end"));
});
test("failed and cancelled motorcycle preparation never acknowledge ready or steal a newer run",async()=>{
  const h=harness();h.setObjectLoad(async()=>{throw Error("missing motorcycle");});
  await assert.rejects(h.runtime.show(h.prompt,h.transaction),/missing motorcycle/);
  assert.equal(h.runtime.active,null);assert.equal(h.calls.some(c=>Array.isArray(c)&&c[0]==="challenge_ready"),false);assert.equal(h.calls.at(-1),"snapshot");
  let resolve;h.setPrepare(()=>new Promise(r=>resolve=r));const old=h.runtime.show(h.prompt,h.transaction);h.runtime.finish(h.transaction);
  h.setPrepare(async()=>true);h.setObjectLoad(async()=>true);await h.runtime.show({...h.prompt,token:"b".repeat(32)},h.transaction);
  resolve(true);await assert.rejects(old,/Driving released/);assert.equal(h.runtime.active.token,"b".repeat(32));h.runtime.finish(h.transaction);
});
test("cancelled in-flight bike loader disposes only its own resources",async()=>{
  const h=harness();let resolve;h.setObjectLoad(()=>new Promise(r=>resolve=r));const old=h.runtime.show(h.prompt,h.transaction);
  await new Promise(r=>setImmediate(r));h.runtime.finish(h.transaction);
  h.setObjectLoad(async()=>true);await h.runtime.show({...h.prompt,token:"b".repeat(32)},h.transaction);
  resolve(true);await assert.rejects(old,/Driving released/);assert.equal(h.runtime.active.token,"b".repeat(32));
  assert.equal(h.calls.filter(c=>c==="actors-begin").length,1);assert.equal(h.calls.filter(c=>c==="bike-clear").length,2);h.runtime.finish(h.transaction);
});
test("motorcycle cannot acquire an unrelated area or actor",async()=>{
  const h=harness();await assert.rejects(h.runtime.show(h.prompt,{area:"JD00"}),/Invalid driving/);assert.equal(h.runtime.active,null);
});
