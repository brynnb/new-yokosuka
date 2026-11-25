import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {ScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {jomoObjectBehavior} from "../src/JomoObjectRegistry.js";

const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url)));

test("friends' visit retains both original films, original actors, and source voices",()=>{
  const catalog=new ScriptEventPresentationCatalog();
  for(const [part,frames,voices] of [["arrival",1030,12],["departure",400,4]]){
    const manifest=read(`play/assets/hazuki/friends-visit-${part}/manifest.json`);
    const audio=read(`public/audio/world/friends-visit-${part}/manifest.json`);
    assert.equal(manifest.activities[0].activityId,"01FRE/01FRE.AUTH");
    assert.equal(manifest.activities[0].durationFrames,frames);
    assert.deepEqual(manifest.activities[0].actors,["AKIR","ITOH","SKRD"]);
    assert.equal(manifest.motionBanks[0].bank,26);assert.equal(audio.voices.length,voices);
    for(const actor of ["ITOH","SKRD"]){
      const binding=manifest.packageActors[actor].sourceBinding;
      assert.equal(binding.path,"disc2/SCENE/02/JOMO/HOUMON.PKS");
      assert.equal(createHash("sha256").update(fs.readFileSync(new URL(`../${manifest.packageActors[actor].assetPath}`,import.meta.url))).digest("hex"),binding.memberSha256);
    }
    for(const entry of [...manifest.outputs,...audio.voices,...audio.sounds]){
      const bytes=fs.readFileSync(new URL(`../${entry.path||entry.asset}`,import.meta.url));
      assert.equal(bytes.length,entry.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);
    }
    const scene=catalog.activity(`s1.jomo.friends-visit-${part}.scene`);
    assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);
  }
});

test("childhood meal uses the original timeline, source props and personal interaction",()=>{
  const manifest=read("play/assets/hazuki/childhood-meal/manifest.json");
  const audio=read("public/audio/world/childhood-meal/manifest.json");
  const region=read("play/data/story-regions.json").regions.find(x=>x.id==="s1.jomo.childhood-meal");
  const scene=new ScriptEventPresentationCatalog().activity("s1.jomo.childhood-meal.scene");
  assert.equal(manifest.activities[0].activityId,"A0122/A0122.AUTH");
  assert.equal(manifest.activities[0].durationFrames,1320);
  assert.deepEqual(manifest.activities[0].actors,["NIMR","JAKR","IWAO"]);
  assert.equal(manifest.motionBanks[0].bank,18);
  assert.deepEqual(audio.voices.map(x=>x.voiceId).sort(),["A0122A001","A0122A002","A0122B001","A0122B002","A0122B003","A0122B004"]);
  assert.equal(audio.sounds.length,2);
  for(const entry of [...manifest.outputs,...audio.voices,...audio.sounds]){
    const bytes=fs.readFileSync(new URL(`../${entry.path||entry.asset}`,import.meta.url));
    assert.equal(bytes.length,entry.byteLength);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);
  }
  assert.equal(manifest.sceneObjects.SYKJ.objectTag,"sykj");
  assert.equal(manifest.attachedObjects.GOHI.attachments[0].parentActorTag,"IWAO");
  assert.equal(manifest.attachedObjects.NINJ.attachments[0].parentActorTag,"JAKR");
  assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);
  assert.equal(scene.cutscene.worldId,"interior");
  assert.equal(region.playMode,"story");assert.equal(region.trigger,"use");
  const behavior=jomoObjectBehavior("S1_JOMO_SSTS500G.MT5","sykj");
  assert.equal(behavior.kind,"inspect");assert.equal(behavior.label,"Dining table");
});

test("Story cherry memory leases the original film and outdoor scenery",()=>{
  const m=read("play/assets/hazuki/cherry-memory/manifest.json"),original=read("play/assets/yd01/sakr/manifest.json");
  const activity=m.activities[0],source=original.activities[0];
  assert.equal(activity.activityId,"SAKR/SEQDATA0.AUTH");assert.equal(activity.sha256,source.sha256);
  assert.equal(activity.durationFrames,source.durationFrames);assert.deepEqual(activity.actors,source.actors);
  assert.deepEqual(activity.nativeHandPoseCues,source.nativeHandPoseCues);
  assert.deepEqual(activity.nativeBodyHandPoseCues,source.nativeBodyHandPoseCues);
  assert.deepEqual(activity.nativeHandComponentCues,source.nativeHandComponentCues);
  assert.equal(activity.binding.kind,"map-embedded-slot");assert.equal(activity.browserIsolatedStage,true);
  assert.equal(activity.browserIsolatedEnvironment,false);
  assert.deepEqual(activity.nativeSceneObjectStates.map(x=>x.presented),[true,true,true,true]);
  for(const entry of m.outputs){const bytes=fs.readFileSync(new URL(`../${entry.path}`,import.meta.url));
    assert.equal(bytes.length,entry.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);}
  const scene=new ScriptEventPresentationCatalog().activity("s1.jhd0.cherry-memory.scene");
  assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);assert.equal(scene.cutscene.worldId,"exterior");
  const region=read("play/data/story-regions.json").regions.find(x=>x.id==="s1.jhd0.cherry-memory");
  assert.equal(region.trigger,"enter");assert.equal(region.playMode,"story");
  assert.deepEqual(region.requiredFlags,["story.s1.first-allowance.completed"]);
});

test("dojo friendship memory uses the original plaque and HIHY package",()=>{
  const scene=new ScriptEventPresentationCatalog().activity("s1.jhd0.dojo-friendship-memory.scene");
  const manifest=read("play/assets/hazuki/hihy/manifest.json"),audio=read("public/audio/world/hihy/manifest.json");
  assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);
  assert.equal(scene.cutscene.packageId,"hihy");assert.equal(scene.cutscene.worldId,"exterior");
  assert.deepEqual(scene.cutscene.activity.binding,{primaryPointer:388275,secondaryPointer:388280});
  assert.equal(manifest.activities[0].activityId,"HIHY/SEQDATA5.AUTH");assert.equal(audio.voices.length,13);
  const region=read("play/data/story-regions.json").regions.find(x=>x.id==="s1.jhd0.dojo-friendship-memory");
  assert.equal(region.trigger,"use");assert.equal(region.playMode,"story");assert.deepEqual(region.requiredFlags,["story.s1.first-dojo.completed"]);
  assert.equal(jomoObjectBehavior("S1_JHD0_GART201G.MT5","GART").label,"Dojo principles");
});

test("kitten roof and medicine retain the original films and medicine binding",()=>{
  const manifest=read("play/assets/yamanose/kitten-roof/manifest.json"),audio=read("public/audio/world/kitten-roof/manifest.json");
  assert.deepEqual(manifest.activities.map(a=>a.activityId),["CATA3/SEQDATA0.AUTH","CATA3/SEQDATA1.AUTH"]);
  assert.deepEqual(manifest.activities.map(a=>a.durationFrames),[1157,870]);
  assert.equal(manifest.sceneObjects.DRUG.model,"NANHIL0G");assert.equal(audio.voices.length,22);
  const catalog=new ScriptEventPresentationCatalog();
  for(const id of ["s1.ju00.kitten-roof.scene","s1.ju00.kitten-medicine.scene"]){const scene=catalog.activity(id);assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);assert.equal(scene.cutscene.worldId,"yamanose");}
});

test("the kitten and Nozomi shrine film uses its own original sequence and audio",()=>{
  const manifest=read("play/assets/yamanose/kitten-nozomi/manifest.json"),audio=read("public/audio/world/kitten-nozomi/manifest.json");
  assert.equal(manifest.activities[0].activityId,"CATA2/SEQDATA0.AUTH");
  assert.equal(manifest.activities[0].durationFrames,1617);
  assert.deepEqual(manifest.activities[0].actors,["AKIR","CATM","HRSK"]);
  assert.equal(audio.voices.length,12);
  assert.equal(audio.sources.stream.path,"disc2/SCENE/02/STREAM/01MUT.AFS");
  assert.equal(audio.sources.soundBank.path,"disc2/SCENE/02/SOUND/A1_RYODK.SND");
  const scene=new ScriptEventPresentationCatalog().activity("s1.ju00.kitten-nozomi.scene");
  assert.equal(scene.durableEffects,"forbidden");assert.equal(scene.returnPlayerState,true);
  assert.equal(scene.cutscene.worldId,"yamanose");
});

test("the altar film uses the Disc 2 lilies, their two textures and the Ryo/Ine-san voice bank", () => {
  const manifest = read("play/assets/hazuki/nozomi-flowers/manifest.json");
  const audio = read("public/audio/world/nozomi-flowers/manifest.json");
  const [activity] = manifest.activities;
  assert.equal(activity.activityId, "01BTU/FLOWERS.AUTH");
  assert.equal(activity.binding.nativeSlot, 36);
  assert.equal(activity.durationFrames, 1248);
  assert.deepEqual(activity.actors, ["AKIR", "HANA", "INE_"]);
  assert.deepEqual(activity.nativeFaceControllerCues.map(cue => cue.frame), [30, 48, 51, 55]);
  assert.equal(manifest.sceneObjects.HANA.model, "BUTM409G");
  assert.equal(manifest.sceneObjects.BASE.model, "BUTM408G");
  assert.equal(manifest.sceneObjects.BASE.objectTag, "HANA");
  const textures = fs.readFileSync(new URL(`../${manifest.sceneObjects.HANA.textureAssetPath}`, import.meta.url));
  const textureIds = [];
  for (let offset = 0; offset < textures.length; offset += 12 + textures.readUInt32LE(offset + 8)) {
    textureIds.push(textures.subarray(offset, offset + 8).toString("hex"));
  }
  assert.deepEqual(textureIds.sort(), ["af89b3616464365f", "eca9c861ab38365f"]);
  assert.deepEqual(audio.voices.map(v => v.speakerId), ["AKIR", "AKIR", "INE_", "INE_", "INE_"]);
  assert.ok(audio.voices.every(v => v.displayText && v.lipSync));
  assert.equal(audio.sounds.length, 10);
  for (const entry of [...manifest.outputs, ...audio.voices, ...audio.sounds]) {
    const bytes = fs.readFileSync(new URL(`../${entry.path || entry.asset}`, import.meta.url));
    assert.equal(bytes.length, entry.byteLength);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  }
});
