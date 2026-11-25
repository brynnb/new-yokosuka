import assert from "node:assert/strict";
import test from "node:test";
import {existsSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import chapter from "../play/data/story-hisaka-lunch.generated.json" with {type:"json"};
import assets from "../src/runtime-assets.generated.json" with {type:"json"};
import {createScriptEventPresentationCatalog} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {MotnLoader} from "../src/MotnLoader.js";
const stages=Object.fromEntries(chapter.scenes.map(s=>[s.id.split(".").at(-1),s]));
test("the six lunch stages bind the original guardroom, both guard models and the captured food stand",()=>{
  const catalog=createScriptEventPresentationCatalog();
  assert.deepEqual(Object.keys(stages),["approach","delivery","handover","overhear","leave","return"]);
  for(const [name,s] of Object.entries(stages)) {
    assert.equal(catalog.sequence(s.id+".start").scene.id,s.id);
    assert.equal(catalog.sequence(s.id+".finish").scene.id,s.id);
    assert.equal(s.isolateScheduledActors,true);
    for(const actor of s.actorDefinitions){
      const packaged=s.packageActors[actor.actorCode];
      for(const key of ["assetPath","textureAssetPath"]){
        assert.equal(actor[key],packaged[key]);
        assert.ok(assets.assets[actor[key]]);
      }
    }
    if(name==="return")continue;
    assert.deepEqual(Object.keys(s.sceneObjects),["GROM","ISU_","MAGZ","WHIT"]);
    assert.equal(s.sceneObjects.GROM.model,"B49M2SYG");
    assert.equal(s.packageActors.KEBA.modelCode,"KEB_L");
    for(const a of Object.values(s.sceneObjects)) assert.ok(assets.assets[a.assetPath]);
  }
  assert.deepEqual(stages.overhear.actors.map(a=>a.tag),["AKIR","KEBA","KEBC","KEBD"]);
  assert.deepEqual(stages.return.actors.map(a=>a.tag),["AKIR","HISA"]);
  assert.equal(stages.return.sceneObjects,undefined);
  // Relative ECAM 420 points at Ryo at the stand across the map.
  assert.ok(Math.abs(stages.return.camera.targetX)<.35);
  assert.ok(Math.abs(stages.return.camera.targetZ-101.8)<.35);
});
test("each bento changes from its own wrist to its original guardroom table mark",()=>{
  const expected=[["BNT1",18,155,[-129.47321,1.3365,-9.3823]],["BNT2",12,236,[-128.541,1.3452,-9.2765]]];
  for(const [tag,control,frame,position] of expected){
    for(const phase of ["approach","delivery","handover"]){
      const bag=stages[phase].attachedObjects[tag],hand=bag.attachments[0];
      assert.equal(bag.model,"FBNS301G");
      assert.equal(hand.parentActorTag,"AKIR");
      assert.equal(hand.controlId,control);
      assert.equal(hand.activityId,stages[phase].id);
    }
    const handover=stages.handover.attachedObjects[tag];
    assert.equal(handover.attachments.at(-1).action,"detach");
    assert.equal(handover.attachments.at(-1).frame,frame);
    assert.deepEqual(handover.worldTransforms[0].position,position);
    assert.equal(handover.worldTransforms[0].frame,frame);
    for(const phase of ["overhear","leave"]){
      const placed=stages[phase].attachedObjects[tag];
      assert.deepEqual(placed.attachments,[]);
      assert.deepEqual(placed.worldTransforms[0].position,position);
      assert.equal(placed.worldTransforms[0].frame,0);
    }
  }
  assert.equal(stages.handover.attachedObjects.BNT1.attachments[1].frame,2);
  assert.deepEqual(stages.handover.attachedObjects.BNT2.worldTransforms[0].rotationRaw,[32768,51318,32768]);
  assert.equal(stages.approach.actors[0].baseMotion.name,"AKI_AKI_WALK_LP");
  assert.equal(stages.handover.durationSeconds,17);
  const contact=stages.handover.soundCues;
  assert.deepEqual(contact.map(c=>Math.round(c.atSeconds*30)),[150,230]);
  assert.equal(contact[0].asset,contact[1].asset);
  assert.ok(assets.assets[contact[0].asset]);
});
test("BENTO bank and all retained body, furniture and bag assets match registered source bytes",()=>{
  const files=Object.entries(assets.assets).filter(([p])=>p.startsWith("play/assets/harbor/hisaka-lunch/"));
  assert.equal(files.length,10);
  for(const [p,record] of files) if(existsSync(p))assert.equal(createHash("sha256").update(readFileSync(p)).digest("hex"),record.sha256);
  const bankPath=chapter.motionBanks.hisakaLunch;
  if(existsSync(bankPath)){
    const bank=MotnLoader.parse(readFileSync(bankPath));
    assert.equal(bank.sequences.length,19);
    for(const s of chapter.scenes)for(const actor of s.actors)if(actor.motion.bank==="hisakaLunch")assert.ok(bank.getSequence(actor.motion.name).valueData.complete);
  }
});
