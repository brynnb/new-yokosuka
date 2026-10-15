import assert from "node:assert/strict";
import test from "node:test";
import { StoryCombatRuntime } from "../play/scripts/StoryCombatRuntime.js";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import { PLAYER_COMBAT_CONFIG } from "../play/characters/PlayerMotionLibrary.js";

test("afternoon authoring relocates the shared formation without mirroring or distorting it",()=>{
  const source=catalog.encounters.find(e=>e.id==="s1.mfsy.mark-lunch"),placed=catalog.encounters.find(e=>e.id==="s1.mfsy.workday-one-attack");
  assert.deepEqual(placed.actors.map(a=>[a.tag,a.health]),source.actors.map(a=>[a.tag,a.health]));
  assert.deepEqual(placed.actorDefinitions,source.actorDefinitions);
  assert.deepEqual([placed.actors[0].x,placed.actors[0].y,placed.actors[0].z],placed.placement.position);
  for(let i=0;i<source.actors.length;i++)for(let j=i+1;j<source.actors.length;j++){
    const distance=(actors)=>Math.hypot(actors[i].x-actors[j].x,actors[i].z-actors[j].z);
    assert.ok(Math.abs(distance(source.actors)-distance(placed.actors))<1e-10);
  }
});

test("warehouse waves retain donor models but use explicit safe combat formation instead of cinematic grab poses",()=>{
  const source=catalog.encounters.find(e=>e.id==="s1.d000.parking-lot");
  for(const [id,count]of [["one",6],["two",5]]){
    const placed=catalog.encounters.find(e=>e.id===`s1.mfsy.workday-two-wave-${id}`);
    assert.equal(placed.actors.length,count);assert.equal(placed.actors[0].health,100);
    for(const actor of placed.actorDefinitions)assert.deepEqual(actor,source.actorDefinitions.find(a=>a.actorCode===actor.actorCode));
    for(const a of placed.actors){
      const p=placed.formation[a.tag];
      assert.deepEqual([a.x,a.y,a.z],p.map((v,i)=>v+placed.placement.position[i]));
      if(a.tag!=="AKIR")assert.ok(Math.hypot(...[0,2].map(i=>p[i]))>=2.5);
    }
  }
});

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
  return {runtime,view,calls,controller,transaction:{area:"D000"},setPrepare:fn=>{prepare=fn;},advance:()=>{now+=100;}};
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

test("combat acquisition initially faces the nearest opponent without locking camera orbit",async()=>{
  const h=harness(),player=h.view.actors[0];
  const nearest=h.view.actors.slice(1).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
  await h.runtime.show(h.view,h.transaction);
  assert.equal(h.controller.cameraYaw,Math.atan2(player.x-nearest.x,player.z-nearest.z));
  h.controller.cameraYaw=.75;h.runtime.update(h.transaction,.1);
  assert.equal(h.controller.cameraYaw,.75);h.runtime.finish(h.transaction);
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
