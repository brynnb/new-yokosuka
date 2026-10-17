import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import markRescue from "../play/assets/harbor/mark-after-work-intro/manifest.json" with {type:"json"};
import authoredScenes from "../play/scripts/AuthoredSceneCatalog.js";
import {composeScheduledActorDefinitions} from "../src/ScheduledActorDefinitionCollection.js";

test("Mark's rescue fight shares the original film's source-qualified actor models",()=>{
  const definition=catalog.encounters.find(e=>e.id==="s1.mfsy.mark-after-work");
  assert.equal(definition.actors.length,6);
  for(const actor of definition.actorDefinitions){
    const {actorCode,activityOnly,...source}=actor;assert.equal(activityOnly,true);
    const original=markRescue.packageActors[actorCode];
    const shared=authoredScenes.scenes.filter(s=>s.worldId===definition.worldId).flatMap(s=>s.actorDefinitions).find(a=>a.actorCode===actorCode);
    if(shared){assert.deepEqual(actor,shared);assert.equal(source.modelCode,original.modelCode);}
    else assert.deepEqual(source,original);
  }
  assert.ok(definition.actors.every(a=>a.y===0));
});

test("each world's authored scenes and fights compose without competing supplemental actors",()=>{
  for(const world of new Set(catalog.encounters.map(e=>e.worldId))){
    const scenes=authoredScenes.scenes.filter(s=>s.worldId===world).flatMap(s=>s.actorDefinitions);
    const fights=catalog.encounters.filter(e=>e.worldId===world).flatMap(e=>e.actorDefinitions);
    assert.doesNotThrow(()=>composeScheduledActorDefinitions([scenes,fights]),world);
  }
});

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

