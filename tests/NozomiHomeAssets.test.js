import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {ScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url)));
const manifest=read("play/assets/harbor/nozomi-home/manifest.json"),audio=read("public/audio/world/nozomi-home/manifest.json");
test("ride home uses one existing exact-activity program with all original tracks",()=>{
  const cutscene=new ScriptEventPresentationCatalog().activity("s1.nbik.nozomi-home.scene").cutscene;
  const index=read("play/data/events/nativeEventProgramIndex.generated.json"),d=index.programs.find(p=>p.id===cutscene.program.programId);
  const p=read(`public${d.asset.path}`);
  assert.equal(cutscene.program.entryFunction,"$activity-sequence");assert.equal(cutscene.worldId,"nbik-home");
  assert.deepEqual(p.preview.activities.map(a=>a.activityId),manifest.activities.map(a=>a.activityId));
  assert.equal(manifest.activities.length,23);assert.equal(manifest.activities.reduce((n,a)=>n+a.durationFrames,0),4661);
  assert.equal(manifest.packageActors.HRSK.modelCode,"NZM_M");
  assert.equal(index.programs.some(p=>p.id==="disc1-jomo-room-initialization-0x88b70"),false);
});
test("all original ride-home voices, engine effects and local outputs resolve",()=>{
  assert.deepEqual(audio.voices.map(v=>v.voiceId),["01BIKEBA001","01BIKEBB001"]);assert.equal(audio.sounds.length,2);
  for(const a of [...manifest.outputs,...audio.voices,...audio.sounds]){
    assert.equal(a.unavailable,undefined);const b=fs.readFileSync(new URL(`../${a.path||a.asset}`,import.meta.url));
    assert.equal(b.length,a.byteLength);assert.equal(createHash("sha256").update(b).digest("hex"),a.sha256);
  }
  const music=read("public/music/manifest.json").tracks["nozomi-home"];
  assert.equal(music.source.format,"CDDA");assert.equal(music.source.track,5);assert.equal(music.source.sampleFormat,"s16le");
  assert.ok(Math.abs(music.durationSeconds-124.78666666666666)<.001);
  const runtime=read("src/runtime-assets.generated.json").assets;
  for(const file of ["public/music/manifest.json",`public${music.url}`]){
    const bytes=fs.readFileSync(new URL(`../${file}`,import.meta.url));
    assert.equal(bytes.length,runtime[file].size);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),runtime[file].sha256);
  }
});
