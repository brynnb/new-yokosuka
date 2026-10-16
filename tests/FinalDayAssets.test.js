import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {ScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
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
