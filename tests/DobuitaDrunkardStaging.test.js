import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import stages from "../play/data/story-dobuita-drunkard.generated.json" with {type:"json"};
import original from "../tools/evidence/dobuita-drunkard-native.json" with {type:"json"};
import manifest from "../play/assets/dobuita/drunkard/manifest.json" with {type:"json"};
import assets from "../src/runtime-assets.generated.json" with {type:"json"};
import challenges from "../play/data/story-challenges.json" with {type:"json"};

const byName = n => stages.scenes.find(s => s.id === "s1.d000.drunkard." + n);
const hash = b => createHash("sha256").update(b).digest("hex");

test("all E1005 stages use the same real Dick body in both world and film and the source bottle hand", () => {
  assert.equal(stages.scenes.length,12);
  for (const scene of stages.scenes) {
    const resident=scene.actorDefinitions.find(a=>a.actorCode==="DICK");
    const packaged=scene.packageActors.DICK;
    for (const key of ["assetPath","textureAssetPath"]) {
      assert.equal(resident[key],packaged[key]);
      assert.ok(assets.assets[resident[key]]);
    }
    const hand=scene.attachedObjects.BEER.attachments[0];
    assert.equal(hand.parentActorTag,"DICK");
    assert.equal(hand.controlId,18);
  }
  for (const file of manifest.outputs) {
    assert.equal(file.sha256,assets.assets[file.path].sha256);
    if (existsSync(file.path)) assert.equal(hash(readFileSync(file.path)),file.sha256);
  }
});

test("source prompt masks, response windows, nonverbal cues and uninterrupted animation", () => {
  const names=["front","grapple","rear"];
  for(const [i,name] of names.entries()) {
    const row=original.controls.rows[i];
    const q=challenges.challenges.find(c=>c.id==="s1.d000.drunkard."+name);
    assert.deepEqual(q.buttons,[original.controls.bindings[i]]);
    assert.equal(q.windowMs,Math.round((row[2]+row[3])*1000/30));
    const scene=byName(name+"-prompt");
    assert.equal(scene.waitForMotionCompletion,false);
    assert.equal(scene.playThroughFinish,undefined);
    if(row[6]) assert.equal(byName(name+"-lead").durationSeconds,row[6]/30);
  }
  assert.deepEqual(byName("front-prompt").actors.map(a=>a.motionStartSeconds),[62/30,47/30]);
  for(const [id,voice,frame,lineFrame] of [
    ["intro","E1005B001",80,135],["rear-pass","E1005B011",22,87],["rear-miss","E1005A003",14,78],
  ]) {
    const scene=byName(id);
    assert.deepEqual(scene.voiceCue,{asset:"public/audio/world/dobuita-drunkard/"+voice+".wav",atSeconds:frame/30,dialogueAtSeconds:lineFrame/30});
    assert.ok(assets.assets[scene.voiceCue.asset]);
  }
  for(const id of ["front-pass","grapple-pass","rear-pass","rear-miss"])assert.equal(byName(id).playThroughFinish,true);
});

const originalMap = "extracted_disc2_v2/data/SCENE/02/D000/MAPINFO.BIN";
test("retail D000 contains all three recovered controller rows", {skip:!existsSync(originalMap)}, () => {
  const map=readFileSync(originalMap);
  assert.equal(hash(map),original.mapSha256);
  const first=Number(original.controls.mapOffset);
  const rows=Array.from({length:3},(_,i)=>Array.from({length:12},(_,j)=>map.readInt32LE(first+i*48+j*4)));
  assert.deepEqual(rows,original.controls.rows);
  assert.deepEqual(manifest.promptRows,rows);
});

test("grapple camera starts at 8502, retains the shot through B, and retries choose another native angle",async()=>{
  const {StagedCameraPool}=await import("../play/scripts/StagedCameraPool.js");
  const lead=byName("grapple-lead").cameraPool;
  const prompt=byName("grapple-prompt").cameraPool;
  const pass=byName("grapple-pass").cameraPool;
  const miss=byName("grapple-miss").cameraPool;
  for(const pool of [lead,prompt,pass,miss])assert.deepEqual(pool.angles.map(a=>a.cameraNumber),[8502,8515,8516]);
  for(const [random,next] of [[0,8515],[.75,8516]]) {
    const take=new StagedCameraPool(()=>random),session={};
    assert.equal(take.select(lead,session).cameraNumber,8502);
    assert.equal(take.select(prompt,session).cameraNumber,8502);
    assert.equal(take.select(miss,session).cameraNumber,8502);
    assert.equal(take.select(lead,session).cameraNumber,next);
    assert.equal(take.select(prompt,session).cameraNumber,next);
    assert.equal(take.select(pass,session).cameraNumber,next);
    assert.notEqual(take.select(lead,session).cameraNumber,next);
    assert.equal(take.select(lead,{}).cameraNumber,8502);
  }
  const moving=lead.angles.find(v=>v.cameraNumber===8515);
  assert.equal(moving.camera.positionX,Math.fround(-104.97419738769531));
  assert.ok(moving.cameraTrack);
  assert.equal(lead.angles.find(v=>v.cameraNumber===8516).cameraTrack,undefined);
  // At 149 ticks, the follow-up prompt picks up the same absolute spline.
  assert.notEqual(prompt.angles[1].camera.positionX,moving.camera.positionX);
  for(const angle of pass.angles)assert.ok(angle.cameraTrack,"all success variants cut to 8509 at frame 30");
});
