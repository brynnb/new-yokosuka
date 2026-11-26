import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import catalog from "../play/data/story-combat.json" with { type: "json" };
import markRescue from "../play/assets/harbor/mark-after-work-intro/manifest.json" with {type:"json"};
import authoredScenes from "../play/scripts/AuthoredSceneCatalog.js";
import {createServer} from "vite";
import challenges from "../play/data/story-challenges.json" with {type:"json"};
import {MARTIAL_ARTS_MOVES, MARTIAL_ARTS_FOLLOWUP_STAGES} from "../src/MartialArtsCombat.js";
import {storyCombatContract} from "../src/StoryCombatContract.js";

test("every teaching challenge configures a real shared move, not a second combat protocol",()=>{
  const lessons=challenges.challenges.filter(c=>c.kind==="training");
  const fights=storyCombatContract(catalog).encounters;
  for(const lesson of lessons){
    const def=catalog.encounters.find(e=>e.id===lesson.id);
    assert.ok(MARTIAL_ARTS_MOVES[def.training.moveId]);
    assert.ok(MARTIAL_ARTS_MOVES[def.training.completionMoveId] || MARTIAL_ARTS_FOLLOWUP_STAGES[def.training.completionMoveId]);
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

test("each combat world composes its scheduled residents, native packages, staged scenes and fights",async t=>{
  const vite=await createServer({server:{middlewareMode:true,watch:{ignored:()=>true},ws:false,hmr:false},
    appType:"custom",logLevel:"error"});
  t.after(()=>vite.close());
  const {PlayCharacterAssembly}=await vite.ssrLoadModule("/play/characters/PlayCharacterAssembly.js");
  const assembly=new PlayCharacterAssembly({renderMatrixByKey:new Map()});
  for(const worldId of new Set(catalog.encounters.map(e=>e.worldId))){
    const definitions=await assembly.definitionsForWorld({id:worldId});
    const actors=new Set(definitions.map(actor=>actor.actorCode));
    const events=[...authoredScenes.scenes,...catalog.encounters].filter(event=>event.worldId===worldId);
    for(const event of events)for(const actor of event.actorDefinitions){
      assert.ok(actors.has(actor.actorCode),worldId+" is missing "+actor.actorCode+" for "+event.id);
    }
    if(worldId==="mfsy"){
      const goro=definitions.filter(actor=>actor.actorCode==="GORO");
      assert.equal(goro.length,1);
      assert.equal(goro[0].instanceId,"GORO:ae44a9e417c9");
      assert.equal(goro[0].modelCode,"KMB_L");
      assert.notEqual(goro[0].activityOnly,true);
    }
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

const parkFight = catalog.encounters.find(encounter => encounter.id === "s1.jd00.nozomi-park-rescue");
const disc1Root = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.resolve(import.meta.dirname, "../extracted_files");
const parkRoom = path.join(disc1Root, "data/SCENE/01/JD00/MAPINFO.BIN");

test("the park rescue fights both of the film's thugs and keeps the original fight music", () => {
  assert.equal(parkFight.worldId, "sakuragaoka");
  assert.deepEqual(parkFight.actors.map(actor => [actor.tag, actor.health]), [["AKIR",200],["ENKI",140],["NGSM",40]]);
  assert.deepEqual(parkFight.actorDefinitions.map(actor => [actor.actorCode,actor.modelCode]), [["ENKI","YAA_L"],["NGSM","YAB_L"]]);
  assert.equal(parkFight.musicTrack, "bgm013");
  assert.deepEqual(storyCombatContract(catalog).encounters.find(row => row.id === parkFight.id).outcomes, ["success","defeated","failure"]);
});

test("Disc 1 JD00 stages the default rescue fighters using these source positions and registration values",
  {skip: !existsSync(parkRoom) && "requires the extracted Disc 1 JD00 room"}, () => {
    const map = readFileSync(parkRoom);
    assert.equal(createHash("sha256").update(map).digest("hex"), parkFight.roomFight.sha256);
    // Original room code stores zero in byte 0x4f4 before the ordinary encounter.
    assert.equal(map.readUInt32LE(0x7434c), 0x4f4);
    assert.deepEqual([...map.subarray(0x73fca,0x73fd0)], [0x9c,0x34,0x00,0xe5,0x50,0x24]);
    const sources = [
      {tag:0x74e74, x:0x74eb4, y:0x74ea0, z:0x74eb0, health:map.readUInt32LE(0x75274), register:0x750a2},
      {tag:0x74e7c, x:0x74ec4, y:0x74ea0, z:0x74ec0, health:map.readUInt32LE(0x7527c), register:0x7514a},
      {tag:0x74e80, x:0x74ed4, y:0x74ea0, z:0x74ed0, health:map.readUInt8(0x751a8), register:0x7520e},
    ];
    assert.equal(map.readUInt16LE(0x751a8) >>> 8, 0xe5); // NGSM's value is an immediate MOV into r5.
    for (const [index, source] of sources.entries()) {
      const actor = parkFight.actors[index];
      assert.equal(map.readUInt16LE(source.register), 0x400b);
      assert.deepEqual([actor.tag, actor.x, actor.y, actor.z, actor.health], [
        map.toString("ascii",source.tag,source.tag+4), -map.readFloatLE(source.x),
        map.readFloatLE(source.y), map.readFloatLE(source.z), source.health,
      ]);
    }
    assert.equal(map.toString("ascii",0x81428,0x81432), "bgm013.snd");
    assert.equal(map.readUInt32LE(0x74e64), 0x25a8);
  });
