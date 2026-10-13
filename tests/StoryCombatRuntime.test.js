import assert from "node:assert/strict";
import test from "node:test";
import { StoryCombatRuntime } from "../play/scripts/StoryCombatRuntime.js";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import { PLAYER_COMBAT_CONFIG } from "../play/characters/PlayerMotionLibrary.js";

function harness() {
  const calls=[],target=new EventTarget();let now=1000,prepare=async()=>{};
  const controller={cameraYaw:0,cameraDistance:2,setFirstPerson(){},updateCamera(){}};
  const bindings={cancel:"KeyX",combatHand:"KeyJ",combatLeg:"KeyK",combatThrow:"KeyL",combatGuard:"KeyI",run:"ShiftLeft",moveForward:"KeyW",moveBackward:"KeyS",moveLeft:"KeyA",moveRight:"KeyD"};
  const runtime=new StoryCombatRuntime({
    actors:{prepare:(...args)=>prepare(...args),begin:()=>calls.push("begin"),end:()=>calls.push("end"),
      applyTransform:(_owner,tag,pose)=>(calls.push([tag,pose]),true),activeActor:tag=>({model:{tag}})},
    motionRuntime:{loadNamedSelections:async()=>{},applyNamed:()=>true},getController:()=>controller,getBinding:action=>bindings[action],
    capturePlayerState:()=>"snapshot",restorePlayerState:snapshot=>calls.push(snapshot),
    onIntent:(...args)=>(calls.push(args),true),target,now:()=>now,
  });
  const definition=catalog.encounters.find(d=>d.id==="s1.d000.parking-lot");
  const view={id:definition.id,token:"a".repeat(32),ready:false,sequence:0,
    actors:definition.actors.map(actor=>({...actor,yaw:0,maxHealth:actor.health,pose:"stance",poseMs:0}))};
  return {runtime,view,calls,transaction:{area:"D000"},setPrepare:fn=>{prepare=fn;},advance:()=>{now+=100;}};
}

test("combat presentation sends only bounded intents and restores its owned pose",async()=>{
  const h=harness();await h.runtime.show(h.view,h.transaction);
  assert.equal(h.calls.some(call=>Array.isArray(call)&&call[0]==="combat_ready"),true);
  await h.runtime.show({...h.view,ready:true},h.transaction);
  h.runtime.active.input.held.add("KeyW");h.runtime.active.input.held.add("KeyD");h.runtime.action("leg");h.advance();
  h.runtime.update(h.transaction,.1);
  const input=h.calls.find(call=>Array.isArray(call)&&call[0]==="combat_input")[2];
  assert.equal(input.action,"leg");assert.ok(Math.hypot(input.moveX,input.moveZ)<=1.00001);
  assert.equal("health" in input,false);assert.equal("position" in input,false);assert.equal("success" in input,false);
  h.runtime.finish(h.transaction);assert.equal(h.runtime.active,null);assert.equal(h.calls.at(-1),"snapshot");
});

test("cancelled actor preparation cannot acquire beneath a newer combat",async()=>{
  const h=harness();let resolve;h.setPrepare(()=>new Promise(r=>{resolve=r;}));
  const old=h.runtime.show(h.view,h.transaction);h.runtime.finish(h.transaction);
  h.setPrepare(async()=>{});const next={area:"D000"};await h.runtime.show({...h.view,token:"b".repeat(32)},next);
  const before=h.calls.length;resolve();await assert.rejects(old,{name:"AbortError"});
  assert.equal(h.calls.length,before);assert.equal(h.runtime.active.transaction,next);h.runtime.finish(next);
});

test("a combat catalog entry cannot acquire in a different world area",async()=>{
  const h=harness();await assert.rejects(h.runtime.show(h.view,{area:"JOMO"}),/No combat presentation/);
  assert.equal(h.runtime.active,null);assert.deepEqual(h.calls,[]);
});

test("guard and hit reactions retain their fight bank even during a moving frame",async()=>{
  const h=harness(),selected=[];
  h.runtime.motionRuntime.applyNamed=(model,motion)=>(selected.push({tag:model.tag,...motion}),true);
  await h.runtime.show(h.view,h.transaction);
  for(const [pose,bank,name]of[
    ["walk","free","AKI_AKI_WALK_LP"],
    ["guard","fight",PLAYER_COMBAT_CONFIG.guard],
    ["hit","fight",PLAYER_COMBAT_CONFIG.reactions.hit],
    ["defeated","fight",PLAYER_COMBAT_CONFIG.reactions.defeated],
  ]){
    const view={...h.view,actors:h.view.actors.map(actor=>({...actor,pose,moving:true}))};
    await h.runtime.show(view,h.transaction);selected.length=0;
    assert.equal(h.runtime.update(h.transaction,.1),true);
    assert.equal(selected.length,view.actors.length);
    assert.ok(selected.every(selection=>selection.bank===bank&&selection.name===name));
  }
  h.runtime.finish(h.transaction);
});
