#!/usr/bin/env node
// Presentation-only tableaus for the existing Yarn/QTE boundary. Original
// camera/poses and winning MOTN fragment are reused; input remains server-owned.
import fs from "node:fs";
import path from "node:path";
import {parseAuthMovement,evaluateAuthActor} from "../../src/AuthMovement.js";
import {parseAuthCamera,evaluateAuthCamera} from "../../src/AuthCamera.js";
import {MotnLoader} from "../../src/MotnLoader.js";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";
const root=path.resolve(import.meta.dirname,"../.."),prefix="play/assets/harbor/tom-lesson";
const m=JSON.parse(fs.readFileSync(path.join(root,prefix,"manifest.json")));
const file=m.outputs.find(o=>o.path.endsWith("/SEQDATA7.AUTH")),bytes=fs.readFileSync(path.join(root,file.path));
if(sha256(bytes)!==file.sha256)throw Error("Changed original Tom demonstration");
const movement=parseAuthMovement(bytes),camera=parseAuthCamera(bytes),time=(416-1)/30;
const pose=tag=>Object.fromEntries(Object.entries(evaluateAuthActor(movement.actors.find(a=>a.tag===tag),time)).filter(([k])=>["x","y","z","rotationX","rotationY","rotationZ"].includes(k)));
const bank=MotnLoader.parse(fs.readFileSync(path.join(root,prefix,"M_0001.MOTN")));
for(const name of ["OTH_TOM_TALK_LP_0100","AKI_DEKIRU_TORNADO_KICK_B_0100"]){if(!bank.getSequence(name)?.valueData?.complete)throw Error("Missing original practice motion "+name);}
const common={area:"MFSY",worldId:"mfsy",actorDefinitions:[{actorCode:"TOM_",...m.packageActors.TOM_,activityOnly:true}],
  provenance:"Held end-of-SEQDATA7 poses/camera for actual Up/Up/A/A challenge. Four-second winning fragment is MOTN index1 frames0..119, before SEQDATA8 resumes at120. Held root, generic input window and normal idle between inputs are authored, not native player training physics.",
  camera:evaluateAuthCamera(camera.cameras[0],time)};
const actor=(tag,motion)=>({tag,pose:pose(tag),motion});
const tom={bank:"tomPractice",name:"OTH_TOM_TALK_LP_0100",loop:true};
const scenes=[
  {...common,id:"s1.mfsy.tom-practice",actors:[actor("AKIR",{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}),actor("TOM_",tom)]},
  {...common,id:"s1.mfsy.tom-practice-kick",durationSeconds:120/30,actors:[actor("AKIR",{bank:"tomPractice",name:"AKI_DEKIRU_TORNADO_KICK_B_0100",loop:false}),actor("TOM_",tom)]},
];
// The later counter has original character motions but no standalone AUTH.
// Hold the following TLYB shot's roots; choreography is authored, not
// a recovered native controller or an outcome inferred from animation.
const confrontationPrefix="play/assets/harbor/final-confrontation";
const confrontation=JSON.parse(fs.readFileSync(path.join(root,confrontationPrefix,"manifest.json")));
const retreat=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/terry-retreat/manifest.json")));
const original=retreat.outputs.find(o=>o.path.endsWith("/SEQDATA2.AUTH")),retreatBytes=fs.readFileSync(path.join(root,original.path));
if(sha256(retreatBytes)!==original.sha256)throw Error("Changed original Terry retreat");
const counterMovement=parseAuthMovement(retreatBytes);
const counterBank=MotnLoader.parse(fs.readFileSync(path.join(root,confrontationPrefix,"M_01_H.MOTN")));
const counterPose=tag=>Object.fromEntries(Object.entries(evaluateAuthActor(counterMovement.actors.find(a=>a.tag===tag),0)).filter(([k])=>["x","y","z","rotationX","rotationY","rotationZ"].includes(k)));
const counterActor=(tag,name,loop=false)=>{
  if(!counterBank.getSequence(name)?.valueData.complete)throw Error("Missing original counter motion "+name);
  return {tag,pose:counterPose(tag),motion:{bank:"finalCounter",name,loop}};
};
const cast=["KISY","TERY"].map(actorCode=>({actorCode,...retreat.packageActors[actorCode],activityOnly:true}));
const center=counterMovement.actors.reduce((p,a)=>{const v=evaluateAuthActor(a,0);return{x:p.x+v.x/3,z:p.z+v.z/3};},{x:0,z:0});
const counterCommon={area:"MFBT",worldId:"mfbt",actorDefinitions:cast,
  // TLYB's close-up belongs to the later chase, not these earlier motions.
  // A declared wide shot keeps the three original roots and moving bodies in
  // view rather than cropping Terry/pipe outside an unrelated native camera.
  camera:{positionX:center.x-6,positionY:3,positionZ:center.z+7,targetX:center.x,targetY:1,targetZ:center.z,roll:0,perspective:55},
  provenance:"Original MFBT/KISY M_01_H collapse/rescue motions; roots borrowed from TLYB start. Shared timed nonlethal spar, held input pose, wide camera, hand binding and choreography are authored approximations, not native-controller reconstruction."};
const pipe=id=>({PIPE:{...confrontation.sceneObjects.PIPE,referenceOnly:false,
  attachments:[{activityId:id,frame:0,parentActorTag:"TERY",controlId:18,translation:[0,0.08,0],rotationRaw:[0,0,0]}],
  presentation:[{activityId:id,frame:0,visible:true}]}});
scenes.push(
  {...counterCommon,id:"s1.mfbt.mutual-collapse",waitForMotions:true,actors:[
    counterActor("AKIR","AKI_AIUTI_TAORERU_KISYOTASUKERU2"),counterActor("KISY","KIS_AIUTI_TAORERU_KISYOTASUKERU2")]},
  {...counterCommon,id:"s1.mfbt.pipe-ready",attachedObjects:pipe("s1.mfbt.pipe-ready"),actors:[
    counterActor("AKIR","AKI_TASUKERU_KAMAE_LP_KISYOTASUKERU",true),counterActor("KISY","OTH_KIS_TASUKERU_KAMAE_LP_KISYOTASUKERU",true),
    counterActor("TERY","OTH_TLY_WATASU_BOU_TACHI_LP_KISYOTASUKERU",true)]},
  {...counterCommon,id:"s1.mfbt.pipe-counter",waitForMotions:true,attachedObjects:pipe("s1.mfbt.pipe-counter"),actors:[
    counterActor("AKIR","AKI_TASUKERU_KISYOTASUKERU"),counterActor("KISY","OTH_KIS_TASUKERU_KISYOTASUKERU"),
    counterActor("TERY","OTH_TLY_QOK_QNG_NAGURU_TETUPIPE_KISYOTASUKERU2")]},
);
fs.writeFileSync(path.join(root,"play/data/story-final-day.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_final_day.mjs",motionBanks:{tomPractice:`${prefix}/M_0001.MOTN`,finalCounter:`${confrontationPrefix}/M_01_H.MOTN`},scenes},null,2)+"\n");
console.log("Generated final-day practice/counter staging; no input or outcome authority.");
