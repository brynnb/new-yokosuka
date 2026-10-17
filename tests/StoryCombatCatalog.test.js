import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import markRescue from "../play/assets/harbor/mark-after-work-intro/manifest.json" with {type:"json"};
import authoredScenes from "../play/scripts/AuthoredSceneCatalog.js";
import {composeScheduledActorDefinitions} from "../src/ScheduledActorDefinitionCollection.js";
import challenges from "../play/data/story-challenges.json" with {type:"json"};
import {MARTIAL_ARTS_MOVES, MARTIAL_ARTS_FOLLOWUP_STAGES} from "../src/MartialArtsCombat.js";
import {storyCombatContract} from "../src/StoryCombatContract.js";

test("every teaching challenge configures a real shared move, not a second combat protocol",()=>{
  const lessons=challenges.challenges.filter(c=>c.kind==="training");
  const fights=storyCombatContract(catalog).encounters;
  for(const lesson of lessons){
    const def=catalog.encounters.find(e=>e.id===lesson.id);
    assert.ok(MARTIAL_ARTS_MOVES[def.training.moveId]);
    assert.ok(MARTIAL_ARTS_FOLLOWUP_STAGES[def.training.completionMoveId]);
    if(def.training.attackMoveId)assert.ok(MARTIAL_ARTS_MOVES[def.training.attackMoveId]);
    assert.equal(def.timeoutMs,0);
    assert.equal(fights.some(f=>f.id===lesson.id),false);
  }
  assert.equal(catalog.encounters.filter(e=>e.training).length,lessons.length);
  assert.ok(fights.every(f=>f.timeoutMs===undefined));
});

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

