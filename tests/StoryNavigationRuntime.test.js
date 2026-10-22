import assert from "node:assert/strict";
import test from "node:test";
import {StoryNavigationRuntime} from "../play/scripts/StoryNavigationRuntime.js";
import catalog from "../play/data/story-navigation.json" with {type:"json"};
import {DEFAULT_CONTROL_BINDINGS} from "../play/settings/GeneralPreferences.js";

function harness(){
  const calls=[];let prepare=async()=>true,now=0;
  const actors={prepare:(...args)=>prepare(...args),begin:()=>calls.push("begin"),end:()=>calls.push("end"),applyTransform:()=>true,activeActor:()=>({model:{}})};
  const controller={cameraYaw:0,cameraDistance:6,setFirstPerson(){},updateCamera(){}};
  const runtime=new StoryNavigationRuntime({actors,motionRuntime:{loadNamedSelections:async()=>true,applyNamed:()=>true},getController:()=>controller,getBinding:key=>DEFAULT_CONTROL_BINDINGS[key],createAttachedObjects:()=>({load:async()=>true,beginActivity:()=>calls.push("prop-begin"),update:()=>true,clear:()=>calls.push("prop-clear")}),capturePlayerState:()=>"snapshot",restorePlayerState:value=>calls.push(value),onIntent:(...args)=>{calls.push(args);return true;},target:new EventTarget(),now:()=>now});
  const d=catalog.challenges[0];
  const prompt={id:d.id,token:"a".repeat(32),ready:false,navigation:{sequence:0,actors:[{tag:"AKIR",x:d.player[0],y:0,z:d.player[2],yaw:0,poseMs:0},...d.guards.map(g=>({tag:g.tag,x:g.route[0][0],y:0,z:g.route[0][1],yaw:0,poseMs:0,moving:true}))]}};
  return {runtime,prompt,calls,transaction:{area:"MKSG"},setPrepare:fn=>prepare=fn,advance:()=>now+=100};
}
test("navigation sends intent only, then restores owned actors/camera on release",async()=>{
  const h=harness();await h.runtime.show(h.prompt,h.transaction);assert.ok(h.calls.some(c=>Array.isArray(c)&&c[0]==="challenge_ready"));
  await h.runtime.show({...h.prompt,ready:true},h.transaction);
  h.runtime.active.input.held.add("KeyW");h.runtime.active.input.held.add("KeyD");h.runtime.hide(true);h.runtime.use();h.advance();h.runtime.update(h.transaction,.1);
  const input=h.calls.find(c=>Array.isArray(c)&&c[0]==="challenge_move")[2];assert.ok(Math.hypot(input.moveX,input.moveZ)<=1.00001);assert.equal(input.hide,true);assert.equal(input.use,true);
  for(const key of ["x","z","position","success","caught","flags"])assert.equal(key in input,false);
  h.runtime.finish(h.transaction);assert.equal(h.runtime.active,null);assert.equal(h.calls.at(-1),"snapshot");
});
test("cancelled navigation preparation cannot acquire under a new run",async()=>{
  const h=harness();let resolve;h.setPrepare(()=>new Promise(r=>resolve=r));const old=h.runtime.show(h.prompt,h.transaction);h.runtime.finish(h.transaction);
  h.setPrepare(async()=>true);await h.runtime.show({...h.prompt,token:"b".repeat(32)},h.transaction);resolve(true);await assert.rejects(old,/Navigation released/);
  assert.equal(h.runtime.active.token,"b".repeat(32));assert.equal(h.calls.filter(c=>c==="begin").length,1);h.runtime.finish(h.transaction);
});
test("navigation cannot acquire in the wrong area",async()=>{
  const h=harness();await assert.rejects(h.runtime.show(h.prompt,{area:"D000"}),/Invalid navigation/);assert.equal(h.runtime.active,null);
});
test("failed prop preparation restores the player without acknowledging readiness",async()=>{
  const h=harness();h.runtime.createAttachedObjects=()=>({load:async()=>{throw Error("missing flashlight");},clear:()=>h.calls.push("failed-prop-clear")});
  await assert.rejects(h.runtime.show(h.prompt,h.transaction),/missing flashlight/);
  assert.equal(h.runtime.active,null);assert.equal(h.calls.includes("begin"),false);assert.equal(h.calls.at(-1),"snapshot");
  assert.equal(h.calls.some(c=>Array.isArray(c)&&c[0]==="challenge_ready"),false);
});
test("a late prop loader releases only its cancelled owner's resources",async()=>{
  const h=harness();let resolve;
  h.runtime.createAttachedObjects=()=>({load:()=>new Promise(r=>resolve=r),clear:()=>h.calls.push("old-prop-clear")});
  const old=h.runtime.show(h.prompt,h.transaction);await new Promise(r=>setImmediate(r));
  h.runtime.finish(h.transaction);
  h.runtime.createAttachedObjects=()=>({load:async()=>true,beginActivity(){},update:()=>true,clear:()=>h.calls.push("new-prop-clear")});
  await h.runtime.show({...h.prompt,token:"b".repeat(32)},h.transaction);resolve(true);await assert.rejects(old,/Navigation released/);
  assert.equal(h.runtime.active.token,"b".repeat(32));assert.equal(h.calls.includes("new-prop-clear"),false);
  assert.equal(h.calls.filter(c=>c==="old-prop-clear").length,2);h.runtime.finish(h.transaction);
});
