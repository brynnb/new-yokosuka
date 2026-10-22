import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {mergeNativeVoiceCatalogs,registerNativeAseqMusic} from "../tools/lib/NativeAseqAudioPack.mjs";

const entry=(name,bytes="voice",text="Original line")=>({member:{name,bytes:Buffer.from(bytes)},record:{speakerId:"AKIR",displayText:text},source:{manifestPath:"disc3/first.AFS"}});

test("another scene reuses the exact music identity without renaming the shared track",()=>{
  const root=fs.mkdtempSync("/var/tmp/ny-native-music-test-");
  try{
    const dir=path.join(root,"public/music");fs.mkdirSync(dir,{recursive:true});
    const sourceId="1".repeat(64),bankHash="2".repeat(64),source={id:sourceId,bankSha256:bankHash,file:"BGM013.SND",group:0,track:0};
    fs.writeFileSync(path.join(dir,"fixture.ogg"),"fixture: identity registration does not decode audio");
    fs.writeFileSync(path.join(dir,"asset-viewer-manifest.json"),JSON.stringify({tracks:{[sourceId]:{ogg_url:"/music/fixture.ogg",durationSeconds:180,source}}}));
    const filename=path.join(dir,"manifest.json");fs.writeFileSync(filename,JSON.stringify({tracks:{}}));
    registerNativeAseqMusic(root,{id:"bgm013",sourceId,bankHash,label:"Original shared label"});
    registerNativeAseqMusic(root,{id:"bgm013",sourceId,bankHash,label:"Another scene"});
    const m=JSON.parse(fs.readFileSync(filename));assert.equal(m.tracks.bgm013.label,"Original shared label");
    assert.deepEqual(m.tracks.bgm013.source,source);
    m.tracks.bgm013.url="/music/a-different-recording.ogg";fs.writeFileSync(filename,JSON.stringify(m));
    assert.throws(()=>registerNativeAseqMusic(root,{id:"bgm013",sourceId,bankHash,label:"Another scene"}),/Conflicting shared music identity/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("native voices resolve exact names across explicitly supplied archives",()=>{
  const a=entry("01CTSAA001.str"),b=entry("01CTSBB007.str");
  const result=mergeNativeVoiceCatalogs([[a],[b]]);
  assert.equal(result.get("01CTSAA001.STR"),a);assert.equal(result.get("01CTSBB007.STR"),b);
  assert.equal(result.has("01CTSBB001.STR"),false);
});

test("duplicate native identities must agree on bytes and subtitle metadata",()=>{
  const first=entry("LINE.str"),second=entry("line.STR");
  first.record.recordOffset=0;second.record.recordOffset=120;
  assert.equal(mergeNativeVoiceCatalogs([[first],[second]]).size,1);
  assert.throws(()=>mergeNativeVoiceCatalogs([[entry("LINE.str")],[entry("LINE.str","different")]]),/Ambiguous native voice/);
  assert.throws(()=>mergeNativeVoiceCatalogs([[entry("LINE.str")],[entry("LINE.str","voice","Different line")]]),/Ambiguous native voice/);
});
