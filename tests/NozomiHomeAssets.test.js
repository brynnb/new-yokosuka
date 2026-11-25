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

test("all 23 ride-home shots own the original cinematic Ryo and release both riders", async () => {
  const {createServer} = await import("vite");
  const {NullEngine, Scene, TransformNode} = await import("@babylonjs/core");
  const {NativeAseqBabylonActors} = await import("../play/events/NativeAseqBabylonPresentation.js");
  const {NativeAseqPackageActorRuntime} = await import("../play/events/NativeAseqPackageActorRuntime.js");
  const {createNativeCutsceneCharacterLoader} = await import("../play/cutscenes/NativeCutsceneCharacterLoader.js");
  const vite = await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:"custom",logLevel:"error"});
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const {NATIVE_CUTSCENE_PACKAGES} = await vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js");
    const pkg = NATIVE_CUTSCENE_PACKAGES.find(candidate => candidate.id === "nozomi-home");
    const riders = new NativeAseqPackageActorRuntime({definitions:pkg.environment.packageActors,
      instantiate:createNativeCutsceneCharacterLoader({scene,loadAsset:async file => {
        const bytes = fs.readFileSync(file);
        return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      }})});
    assert.equal(await riders.load(),2);
    const gameplayRoot = new TransformNode("ordinary-avatar",scene);
    const gameplayRender = new TransformNode("ordinary-avatar-render",scene);
    gameplayRender.parent = gameplayRoot;
    gameplayRoot.position.set(1,2,3);
    const owner = {};
    const actors = new NativeAseqBabylonActors({...pkg.actors,packageActors:riders,
      ignoredActorTags:Object.keys(pkg.environment.sceneObjects),
      getPlayerModel:()=>({root:gameplayRoot,renderRoot:gameplayRender}),
      syncPlayerTransform:()=>assert.fail("A private rider moved the exploration avatar"),
      scheduledActors:{beginActivityActors:()=>[],activityActor:()=>null,endActivityActors:()=>true},
      motionRuntime:{applyActivitySequence:()=>true}});
    for (const reason of ["complete","cancel"]) {
      assert.equal(actors.beginProgram(owner,pkg.actorTags),true);
      assert.equal(gameplayRender.isEnabled(),false);
      const ryo = actors.programActor("AKIR");
      const nozomi = actors.programActor("HRSK");
      assert.equal(ryo.model.modelCode,"YKB_M");
      assert.equal(nozomi.model.modelCode,"NZM_M");
      for (const shot of (reason === "complete" ? manifest.activities : manifest.activities.slice(0,1))) {
        assert.equal(actors.begin(owner,shot.actors),true);
        for (const [tag,record] of [["AKIR",ryo],["HRSK",nozomi]]) {
          const declared = shot.actors.includes(tag);
          assert.equal(record.model.renderRoot.isEnabled(),declared,shot.activityId+" "+tag);
          if (declared) assert.equal(actors.activeActor(tag).model,record.model);
        }
        assert.equal(gameplayRender.isEnabled(),false);
        assert.equal(actors.end(owner,reason),true);
      }
      assert.equal(actors.endProgram(owner,reason),true);
      assert.equal(ryo.model.renderRoot.isEnabled(),false);
      assert.equal(nozomi.model.renderRoot.isEnabled(),false);
      assert.equal(gameplayRender.isEnabled(),true);
      assert.deepEqual(gameplayRoot.position.asArray(),[1,2,3]);
    }
    riders.clear();
  } finally {
    scene.dispose();
    engine.dispose();
    await vite.close();
  }
});

test("the ride installs original cloth modes and replays observed mutations across 23 shots", async () => {
  const {parseNativeClothTrack}=await import("../play/characters/NativeClothTrack.js");
  const capture=read("tools/evidence/nbik-nozomi-cloth.json").originalCapture;
  const record=manifest.clothTracks.HRSK;
  const data=fs.readFileSync(record.path);
  assert.equal(createHash("sha256").update(data).digest("hex"),capture.sha256);
  assert.equal(capture.repeat.sha256,capture.sha256);
  assert.equal(manifest.packageActors.HRSK.nativeClothRuntimeMode,7);
  assert.equal(manifest.packageActors.AKIR.nativeClothRuntimeMode,8);
  assert.equal(manifest.packageActors.HRSK.nativeSecondaryMotionFlags,8);
  assert.deepEqual(manifest.activities[1].programPresentationCues.before,[{kind:"secondary-motion-global-float",mode:3,word:0x3e4ccccd}]);
  const track=parseNativeClothTrack(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
  assert.equal(track.vertexCount,40);
  assert.equal(track.frameCount,4406);
  assert.equal(track.activityOrder.length,23);
  assert.equal(track.frameAt(0,1),null);
  assert.deepEqual(track.frameAt(4,60),track.frameAt(3,252));
  assert.deepEqual(track.frameAt(4,100),track.frameAt(4,60));
  assert.notDeepEqual(track.frameAt(4,123),track.frameAt(4,100));
  assert.deepEqual(track.frameAt(20,100),track.frameAt(20,160));
});
