import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {ScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import authoredScenes from "../play/scripts/AuthoredSceneCatalog.js";
import {MotnLoader} from "../src/MotnLoader.js";
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url)));

test("final morning reuses three original films and distinct original actor bodies",()=>{
  const catalog=new ScriptEventPresentationCatalog();
  for(const [id,area,world,dir,frames,voices,effects] of [
    ["final-meditation","JHD0","exterior","hazuki",1150,0,17],
    ["tom-lunch-invitation","MFSY","mfsy","harbor",713,7,10],
    ["yada-dismissal","MFSY","mfsy","harbor",1720,14,8],
  ]){
    const a=catalog.activity(`s1.${area.toLowerCase()}.${id}.scene`),m=read(`play/assets/${dir}/${id}/manifest.json`),audio=read(`public/audio/world/${id}/manifest.json`);
    assert.equal(a.durableEffects,"forbidden");assert.equal(a.returnPlayerState,true);
    assert.equal(a.cutscene.worldId,world);assert.equal(a.cutscene.activity.slot,0);
    assert.equal(a.cutscene.activity.binding.activityId,m.activities[0].activityId);
    assert.equal(m.activities[0].durationFrames,frames);
    assert.equal(audio.voices.length,voices);assert.equal(audio.sounds.length,effects);
    if(id==="final-meditation")assert.equal(m.packageActors.IWAO.modelCode,"IWA_M");
    if(id==="tom-lunch-invitation")assert.equal(m.packageActors.TOM_.modelCode,"AMG_L");
    for(const asset of [...m.outputs,...audio.voices,...audio.sounds]){
      assert.equal(asset.unavailable,undefined);
      const bytes=fs.readFileSync(new URL(`../${asset.path||asset.asset}`,import.meta.url));
      assert.equal(bytes.length,asset.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),asset.sha256);
    }
  }
});

test("night chapters retain original branch/bank identities and cannot award battle results",()=>{
  const catalog=new ScriptEventPresentationCatalog();
  for(const [id,area,world,native,frames,bank,missing]of [
    ["tom-plane","mfsy","mfsy","GBTM/SEQDATA0.AUTH",932,16,[]],
    ["final-confrontation","mfbt","mfbt","TLYA/SEQDATA1.AUTH",1945,16,[]],
    ["terry-retreat","mfbt","mfbt","TLYB/SEQDATA2.AUTH",410,17,[]],
    ["final-encirclement","mfbt","mfbt","TLYC/SEQDATA3.AUTH",1020,18,["01TLYCA004","01TLYCC001"]],
  ]){
    const a=catalog.activity(`s1.${area}.${id}.scene`),m=read(`play/assets/harbor/${id}/manifest.json`),audio=read(`public/audio/world/${id}/manifest.json`);
    assert.equal(a.cutscene.worldId,world);assert.equal(a.cutscene.activity.binding.activityId,native);
    assert.equal(a.returnPlayerState,true);assert.equal(a.durableEffects,"forbidden");
    assert.equal(m.activities[0].activityId,native);assert.equal(m.activities[0].durationFrames,frames);
    assert.ok(m.motionBanks.some(b=>b.bank===bank));
    assert.deepEqual(audio.voices.filter(v=>v.unavailable).map(v=>v.voiceId),missing);
    for(const asset of [...m.outputs,...audio.voices,...audio.sounds].filter(a=>!a.unavailable)){
      const bytes=fs.readFileSync(new URL(`../${asset.path||asset.asset}`,import.meta.url));
      assert.equal(bytes.length,asset.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),asset.sha256);
    }
    if(id==="tom-plane")assert.equal(m.motionBanks.find(b=>b.bank===0).path,"play/assets/dobuita/jimmy-escaped/MOTION.BIN");
  }
  const ready=authoredScenes.scenes.find(s=>s.id==="s1.mfbt.pipe-ready"),counter=authoredScenes.scenes.find(s=>s.id==="s1.mfbt.pipe-counter");
  assert.equal(ready.waitForMotions,undefined);assert.equal(counter.waitForMotions,true);
  const bank=MotnLoader.parse(fs.readFileSync(new URL(`../${authoredScenes.motionBanks.finalCounter}`,import.meta.url)));
  for(const s of authoredScenes.scenes.filter(s=>s.actors.some(a=>a.motion.bank==="finalCounter"))){
    assert.ok(Object.values(s.camera).every(Number.isFinite));
    for(const actor of s.actors)assert.equal(bank.getSequence(actor.motion.name).valueData.complete,true);
  }
  assert.equal(ready.attachedObjects.PIPE.referenceOnly,false);
  assert.equal(ready.attachedObjects.PIPE.attachments[0].parentActorTag,"TERY");
  assert.deepEqual(counter.camera,ready.camera);
});

test("seventy-man assets pin original pooled bodies and the corrected shared boss identities",()=>{
  const catalog=new ScriptEventPresentationCatalog(),m=read("play/assets/harbor/seventy-man/manifest.json");
  const rescue=read("play/assets/harbor/nozomi-rescue/manifest.json");
  assert.equal(m.generatedBy,"tools/scripting/build_final_battle.mjs");
  assert.equal(m.actorDefinitions.length,12);assert.equal(m.outputs.length,10);
  for(const a of m.outputs){const bytes=fs.readFileSync(new URL(`../${a.path}`,import.meta.url));assert.equal(bytes.length,a.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),a.sha256);}
  for(const [tag,model]of [["TERY","ACS_M"],["STSI","KMA_L"],["MRSK","PPL_L"],["PEDR","JNC_L"]])assert.equal(rescue.packageActors[tag].modelCode,model);
  for(const id of ["seventy-man","seventy-man-victory"]){
    const s=authoredScenes.scenes.find(s=>s.id===`s1.mfbt.${id}`);assert.ok(s);
    assert.doesNotThrow(()=>catalog.sequence(`${s.id}.start`));assert.doesNotThrow(()=>catalog.sequence(`${s.id}.finish`));
    assert.ok(Object.values(s.camera).every(Number.isFinite));
    for(const a of s.actors){assert.ok(Object.values(a.pose).every(Number.isFinite));assert.equal(a.motion.bank,"free");assert.equal(a.motion.name,"AKI_AKI_STAND_LP");}
  }
});

test("Tom's optional lesson keeps source branches, original motions and the independent farewell",()=>{
  const catalog=new ScriptEventPresentationCatalog(),lesson=read("play/assets/harbor/tom-lesson/manifest.json");
  const farewell=read("play/assets/harbor/tom-farewell/manifest.json");
  for(const [part,slot,source]of [["offer",0,"0"],["decline",1,"1"],["accept",2,"2"],["demo",3,"7"],["success",4,"8"],["stop",5,"9"]]){
    const a=catalog.activity(`s1.mfsy.tom-lesson-${part}.scene`);
    assert.equal(a.cutscene.activity.slot,slot);
    assert.equal(a.cutscene.activity.binding.activityId,`M0W1/SEQDATA${source}.AUTH`);
    assert.equal(a.cutscene.activity.binding.activityId,lesson.activities[slot].activityId);
    assert.equal(a.durableEffects,"forbidden");assert.equal(a.returnPlayerState,true);
  }
  assert.equal(catalog.activity("s1.mfsy.tom-farewell.scene").cutscene.activity.binding.activityId,"M0W1/SEQDATAB.AUTH");
  for(const m of [lesson,farewell]){
    assert.equal(m.packageActors.TOM_.assetPath,"play/assets/harbor/tom-lunch-invitation/AMG_L.CHRM");
    assert.equal(m.sceneObjects.RADI.referenceOnly,true);
    const id=m===lesson?"tom-lesson":"tom-farewell",audio=read(`public/audio/world/${id}/manifest.json`);
    const missing=audio.voices.filter(a=>a.unavailable);
    assert.deepEqual(missing.map(a=>a.voiceId),m===lesson?[]:["01TOMBB013"]);
    for(const a of [...m.outputs,...audio.voices,...audio.sounds].filter(a=>!a.unavailable)){
      const bytes=fs.readFileSync(new URL(`../${a.path||a.asset}`,import.meta.url));
      assert.equal(bytes.length,a.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),a.sha256);
    }
  }
  const practice=authoredScenes.scenes.find(s=>s.id==="s1.mfsy.tom-practice");
  const kick=authoredScenes.scenes.find(s=>s.id==="s1.mfsy.tom-practice-kick");
  assert.equal(practice.durationSeconds,undefined);assert.equal(kick.durationSeconds,4);
  assert.deepEqual(practice.camera,kick.camera);
  const bank=MotnLoader.parse(fs.readFileSync(new URL(`../${authoredScenes.motionBanks.tomPractice}`,import.meta.url)));
  for(const scene of [practice,kick]){
    assert.equal(scene.actorDefinitions[0].actorCode,"TOM_");
    assert.equal(scene.actorDefinitions[0].activityOnly,true);
    assert.ok(Object.values(scene.camera).every(Number.isFinite));
    for(const actor of scene.actors){
      assert.ok(Object.values(actor.pose).every(Number.isFinite));
      if(actor.motion.bank==="tomPractice")assert.equal(bank.getSequence(actor.motion.name).valueData.complete,true);
    }
  }
  assert.equal(kick.actors[0].motion.name,"AKI_DEKIRU_TORNADO_KICK_B_0100");
});
