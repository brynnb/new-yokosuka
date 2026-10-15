import test from "node:test";
import assert from "node:assert/strict";
import {mergeNativeVoiceCatalogs} from "../tools/lib/NativeAseqAudioPack.mjs";

const entry=(name,bytes="voice",text="Original line")=>({member:{name,bytes:Buffer.from(bytes)},record:{speakerId:"AKIR",displayText:text},source:{manifestPath:"disc3/first.AFS"}});

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
