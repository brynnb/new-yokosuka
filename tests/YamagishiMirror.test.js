import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {parseAuthSequence} from "../src/AuthSequence.js";
import {createScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import manifest from "../play/assets/sakuragaoka/yamagishi-mirror/manifest.json" with {type:"json"};
import audio from "../public/audio/world/yamagishi-mirror/manifest.json" with {type:"json"};
import evidence from "../tools/evidence/yamagishi-mirror-callback-ir.json" with {type:"json"};
import registry from "../src/runtime-assets.generated.json" with {type:"json"};
import regions from "../play/data/story-regions.json" with {type:"json"};
import {NATIVE_DIALOGUE_PREDICATE_DATA} from "../play/data/dialogue/nativePredicateValues.generated.js";

const routeId="s1.jd00.yamagishi-mirror";
const film=manifest.activities[0];
const clip=readFileSync("play/assets/sakuragaoka/yamagishi-mirror/SEQDATA7.AUTH");

test("Yamagishi's park talk selects the original 2742-frame INYO film",()=>{
  const event=createScriptEventPresentationCatalog().activity(routeId+".scene");
  assert.equal(event.cutscene.packageId,"yamagishi-mirror");
  assert.equal(event.cutscene.worldId,"sakuragaoka");
  assert.equal(event.cutscene.activity.binding.activityId,"INYO/SEQDATA7.AUTH");
  assert.equal(createHash("sha256").update(clip).digest("hex"),"5c79620ef5e54aa9da39db0cb871c279282a8c0acc1dc319494c3e0a90e0a301");
  const original=parseAuthSequence(clip);
  assert.equal(film.durationFrames,original.durationFrames);
  assert.deepEqual(film.actors,["AKIR","YAMA","COP_"]);
  assert.equal(film.durationFrames,2742);
  assert.equal(film.commandCounts.voice,22);
  assert.equal(audio.voices.length,22);
  assert.equal(audio.sounds.length,4);
  for(const recording of audio.voices){
    assert.ok(recording.lipSync.cues.length>0&&recording.displayText&&recording.asset);
    assert.ok(registry.assets[recording.asset]);
  }
});

test("the source cup and separate mirror use distinct models and timed original wrist transforms",()=>{
  const mirror=manifest.attachedObjects.PNXM;
  assert.equal(manifest.sceneObjects.COP_.source.model,"CUPK300G");
  assert.equal(mirror.source.model,"PNX02M6G");
  assert.deepEqual(mirror.attachments.map(a=>[a.frame,a.parentActorTag,a.controlId]),[[556,"AKIR",18],[678,"YAMA",18],[2336,"AKIR",18]]);
  assert.deepEqual(mirror.presentation.map(a=>[a.frame,a.visible]),[[556,true],[2642,false]]);
  assert.deepEqual(mirror.attachments.map(a=>a.rotationRaw),Array.from({length:3},()=>[49152,0,0]));
  assert.ok(Math.abs(mirror.attachments[0].translation[0]-.153)<1e-6);
  assert.ok(Math.abs(mirror.attachments[1].translation[0]-.14)<1e-6);
  assert.equal(manifest.handAssets.YAMA.handModelCode??manifest.handAssets.YAMA.handCode,"YMG");
  assert.equal(film.nativeHandPoseCues.length,16);
  assert.equal(film.nativeFaceClipCues.length,9);
  assert.equal(film.nativeFaceControllerCues.length,2);
});

test("original approach and STEP boundaries remain attached to the normal park conversation",()=>{
  const route=JSON.parse(readFileSync("tools/scripting/story-investigation.json")).routes.find(r=>r.id==="yamagishi-mirror");
  const region=regions.regions.find(r=>r.id===routeId);
  assert.deepEqual([region.min[0],region.max[0],region.min[2],region.max[2]],[-27,-16,-18,-2]);
  assert.equal(region.horizontalOnly,true);
  assert.deepEqual(route.hours,[8.5,19]);
  assert.equal(route.actor,"YAMA");
  assert.deepEqual(route.nativeEffects,[{address:"2:817",value:1}]);
  const rows=Object.values(NATIVE_DIALOGUE_PREDICATE_DATA.storyStep).find(Array.isArray);
  assert.deepEqual(route.excludedNativeFlags,["2:817",...rows.filter(row=>row.step>=192).map(row=>"2:"+row.bank2Bit)]);
  const owner=evidence.supportingFunctions.find(f=>f.id==="0x5dbdc");
  assert.ok(owner.blocks.flatMap(b=>b.actions).some(a=>a.callFileOffset==="0x5dc20"&&a.arguments[1].value===817));
});
