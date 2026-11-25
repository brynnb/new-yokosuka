import {createServer} from "vite";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {parseAuthSequence} from "../src/AuthSequence.js";
import {evaluateAuthCurve} from "../src/AuthSpline.js";
import {createScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import manifest from "../play/assets/harbor/goro-guard-distraction/manifest.json" with {type:"json"};
import audio from "../public/audio/world/goro-guard-distraction/manifest.json" with {type:"json"};
import staged from "../play/data/story-goro-guard.generated.json" with {type:"json"};
import regions from "../play/data/story-regions.json" with {type:"json"};
import destinations from "../play/data/story-destinations.json" with {type:"json"};
import registry from "../src/runtime-assets.generated.json" with {type:"json"};

const routeId="s1.mfsy.goro-guard-distraction";
const intro=staged.scenes[0];
const film=manifest.activities[0];

test("the harbor activity selects the original 930-frame GKYU guard distraction",()=>{
  const selected=createScriptEventPresentationCatalog().activity(routeId+".scene").cutscene;
  assert.equal(selected.packageId,"goro-guard-distraction");
  assert.equal(selected.activity.binding.activityId,"GKYU/SEQDATA2.AUTH");
  const bytes=readFileSync("play/assets/harbor/goro-guard-distraction/SEQDATA2.AUTH");
  assert.equal(createHash("sha256").update(bytes).digest("hex"),"40e9c9e4f423f170f913399e50d7833c49d9188cf49502aaec28c3d17c2a4191");
  assert.equal(parseAuthSequence(bytes).durationFrames,930);
  assert.equal(film.durationFrames,930);
  assert.deepEqual(film.commandCounts,{camera:1,move:5,motion:9,sound:25,voice:8});
  assert.deepEqual([...film.actors].sort(),["AKIR","GORO","KEBJ","KEBK","NGSM"]);
  assert.deepEqual(Object.fromEntries(Object.entries(manifest.packageActors).map(([tag,actor])=>[tag,actor.modelCode])),
    {GORO:"KMB_L",NGSM:"YAB_L",KEBJ:"KVJ_L",KEBK:"KVK_L"});
  assert.deepEqual(audio.voices.map(v=>v.voiceId),["01GARB001","01GARB002","01GARB003","01GARB004","01GARC001","01GARD001","01GARD002","01GARE001"]);
  assert.equal(audio.sounds.length,11);
  for(const recording of [...audio.voices,...audio.sounds]){
    assert.ok(registry.assets[recording.asset],recording.asset);
    assert.equal(createHash("sha256").update(readFileSync(recording.asset)).digest("hex"),recording.sha256);
  }
});

test("Ryo and Goro's four-line lead-in holds the original mark until the reset on frame 170",()=>{
  assert.deepEqual(intro.dialogueCues.map(cue=>[cue.voiceId,Math.round(cue.atSeconds*30)]),
    [["E1081B001",0],["E1081A001",100],["E1081B002",230],["E1081A002",360]]);
  assert.equal(intro.musicPackageId,"goro-guard-distraction");
  assert.equal(intro.durationSeconds*30,440);
  const goro=intro.actors.find(actor=>actor.tag==="GORO");
  assert.equal(intro.actors.find(actor=>actor.tag==="AKIR").pose.x,-112.6);
  assert.equal(evaluateAuthCurve(goro.movement.channels.x,100/30),-105.4);
  assert.equal(evaluateAuthCurve(goro.movement.channels.x,169/30),-105.4);
  assert.equal(evaluateAuthCurve(goro.movement.channels.x,170/30),-108.9);
  assert.deepEqual(goro.motionCues.map(cue=>Math.round(30*cue.atSeconds)),[170,183,203,260]);
  assert.ok(registry.assets[staged.motionBanks.goroGuardIntro]);
});

test("the distraction has its own harbor approach and enters the original lower doorway",()=>{
  const area=regions.regions.find(r=>r.id===routeId);
  assert.deepEqual(area.nativeApproach.center,[-114.5,0,108.45]);
  assert.equal(area.nativeApproach.radius,8);
  const climb=regions.regions.find(r=>r.id==="s1.mfsy.warehouse-eight-window");
  assert.ok(climb.excludedFlags.includes("story.s1.goro-guard-distraction.completed"));
  assert.ok(climb.excludedNativeFlags.includes(240));
  const door=destinations.destinations.find(d=>d.id==="s1.harbor.warehouse-eight-guard-entry");
  assert.equal(door.area,"MS8S");
  assert.equal(door.entry,1);
  assert.deepEqual(door.position,[-8.3100004196167,0,135.75999450683594]);
  assert.equal(door.yaw,-225*Math.PI/180);
});

test("the GKYU package resolves all original Goro face assets at its playback entry point", async () => {
  const vite=await createServer({server:{middlewareMode:true,watch:{ignored:()=>true},ws:false,hmr:false},appType:"custom",logLevel:"error"});
  try {
    const {NATIVE_CUTSCENE_PACKAGES}=await vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js");
    const pack=NATIVE_CUTSCENE_PACKAGES.find(candidate=>candidate.id==="goro-guard-distraction");
    const face=pack.presentation.facialAssets.GORO;
    assert.equal(face.bodyModelCode, pack.environment.packageActors.GORO.modelCode);
    for(const asset of [face.model,face.table,face.poses]){
      assert.ok(pack.assets[asset.path], asset.path);
      assert.equal(createHash("sha256").update(readFileSync(asset.path)).digest("hex"), asset.sha256);
      assert.ok(registry.assets[asset.path], asset.path);
    }
    const cues=audio.voices.filter(voice=>voice.speakerId==="GORO");
    assert.deepEqual(cues.map(voice=>voice.lipSync.cues.length), [10,29,6,16]);
  } finally {
    await vite.close();
  }
});
