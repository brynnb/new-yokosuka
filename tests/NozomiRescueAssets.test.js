import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {ScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import scenes from "../play/scripts/AuthoredSceneCatalog.js";
import {WORLDS} from "../play/config/worlds.js";

const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url)));
const manifest=read("play/assets/harbor/nozomi-rescue/manifest.json"),audio=read("public/audio/world/nozomi-rescue/manifest.json");
test("the rescue reuses three original films and distinct pinned fighter packs",()=>{
  const catalog=new ScriptEventPresentationCatalog();
  for(const [i,part]of ["intro","deal","coda"].entries()){
    const a=catalog.activity(`s1.tery.nozomi-rescue-${part}.scene`);
    assert.equal(a.cutscene.packageId,"nozomi-rescue");assert.equal(a.cutscene.activity.slot,i);
    assert.equal(a.cutscene.activity.binding.activityId,manifest.activities[i].activityId);assert.equal(a.durableEffects,"forbidden");
  }
  assert.deepEqual(manifest.activities.map(a=>a.durationFrames),[1985,3870,180]);
  const fights=read("play/data/story-combat.json").encounters.filter(c=>c.id.endsWith("nozomi-guards"));
  assert.deepEqual(fights.map(c=>c.actors.length),[7,8]);
  for(const f of fights){
    const scene=scenes.scenes.find(s=>s.id===f.sourceScene);assert.equal(scene.worldId,f.worldId);
    assert.equal(new Set(f.actorDefinitions.map(a=>a.assetPath)).size,f.actors.length-1);
    for(const a of f.actorDefinitions){
      assert.ok(manifest.outputs.some(o=>o.path===a.assetPath));
      assert.equal(manifest.packageActors[a.actorCode],undefined,"battle-only actors must not be instantiated for films");
      assert.deepEqual(scene.actorDefinitions.find(d=>d.actorCode===a.actorCode),a);
    }
  }
});
test("missing English voices remain explicit, and generated asset identities match bytes",()=>{
  assert.deepEqual(audio.voices.filter(a=>a.unavailable).map(a=>a.nativeMember),["01TAPC026.str","01TAPH001.str"]);
  for(const a of [...manifest.outputs,...audio.voices,...audio.sounds]){
    if(a.unavailable){assert.equal(a.asset,undefined);assert.ok(a.unavailableReason);continue;}
    const bytes=fs.readFileSync(new URL(`../${a.path||a.asset}`,import.meta.url));
    assert.equal(bytes.length,a.byteLength);assert.equal(createHash("sha256").update(bytes).digest("hex"),a.sha256);
  }
});
test("warehouse world uses original structures/ground and excludes alternate broad harbor layers",()=>{
  assert.deepEqual(Array.from({length:21},(_,i)=>`S3_TERY_MAP${i?String(i).padStart(2,"0"):""}.MT5`).filter(WORLDS.tery.includeFile),["S3_TERY_MAP17.MT5","S3_TERY_MAP18.MT5","S3_TERY_MAP19.MT5"]);
});
