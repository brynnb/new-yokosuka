#!/usr/bin/env node
// Presentation-only tableaus for the existing Yarn/QTE boundary. Original
// camera/poses and winning MOTN fragment are reused; input remains server-owned.
import fs from "node:fs";
import path from "node:path";
import {parseAuthMovement,evaluateAuthActor} from "../../src/AuthMovement.js";
import {parseAuthCamera,evaluateAuthCamera} from "../../src/AuthCamera.js";
import {parseAuthSequence} from "../../src/AuthSequence.js";
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
// The post-battle A prompt borrows the original last approach pose. Existing
// named-motion elapsedSeconds holds an exact sample: no new pose/controller
// system is needed. Outcome fragments are explicitly selected by Yarn.
const finisherPrefix="play/assets/harbor/terry-final-intro";
const finisher=JSON.parse(fs.readFileSync(path.join(root,finisherPrefix,"manifest.json")));
const finisherFile=finisher.outputs.find(o=>o.path.endsWith("/SEQDATA0.AUTH")),finisherBytes=fs.readFileSync(path.join(root,finisherFile.path));
if(sha256(finisherBytes)!==finisherFile.sha256)throw Error("Changed original final Terry approach");
const finisherMovement=parseAuthMovement(finisherBytes),finisherSequence=parseAuthSequence(finisherBytes);
const finisherBank=MotnLoader.parse(fs.readFileSync(path.join(root,finisherPrefix,"M_01TLY.MOTN")));
const frame=finisherSequence.durationFrames-1;
const lastPose=tag=>Object.fromEntries(Object.entries(evaluateAuthActor(finisherMovement.actors.find(a=>a.tag===tag),frame/30)).filter(([k])=>["x","y","z","rotationX","rotationY","rotationZ"].includes(k)));
const frozen=tag=>{
  const event=finisherSequence.motions.filter(m=>m.actorTag===tag&&m.frame<=frame).at(-1),clip=finisherBank.sequences[event?.sequenceIndex];
  const sample=Math.min(event?.endFrame,event?.startFrame+frame-event?.frame)-1;
  if(event?.motionBank!==25||!clip?.valueData.complete||!Number.isFinite(sample)||sample<0||sample>=clip.durationFrames)throw Error("Unresolved original held pose "+tag);
  return {bank:"finalTerry",name:clip.name,loop:false,elapsedSeconds:sample/30};
};
const finisherCast=["KISY","TERY"].map(actorCode=>({actorCode,...finisher.packageActors[actorCode],activityOnly:true}));
const average=["AKIR","KISY","TERY"].map(lastPose).reduce((p,a)=>({x:p.x+a.x/3,z:p.z+a.z/3}),{x:0,z:0});
// The original opening camera is above this clear floor. An arbitrary offset
// from the actors put the lens inside a container. Retain that source camera
// position/FOV, framing the held cast rather than its earlier approach target.
const finisherCamera=evaluateAuthCamera(parseAuthCamera(finisherBytes).cameras[0],0);
const finisherCommon={area:"MFBT",worldId:"mfbt",actorDefinitions:finisherCast,
  camera:{...finisherCamera,targetX:average.x,targetY:1,targetZ:average.z,roll:0},
  provenance:"Original TERY approach-end roots and exact frozen motion samples for actual A input. Original win/failure motion fragments, held roots, source opening camera reframed toward the held cast, hand/pipe binding, two-second QTE and retry are authored staging; not recovered native QTE callbacks."};
const finisherPipe=id=>({PIPE:{...finisher.sceneObjects.PIPE,referenceOnly:false,
  attachments:[{activityId:id,frame:0,parentActorTag:"TERY",controlId:18,translation:[0,0.08,0],rotationRaw:[0,0,0]}],presentation:[{activityId:id,frame:0,visible:true}]}});
const finisherActor=(tag,motion=frozen(tag))=>({tag,pose:lastPose(tag),motion});
const named=name=>{if(!finisherBank.getSequence(name)?.valueData.complete)throw Error("Missing original Terry motion "+name);return{bank:"finalTerry",name,loop:false}};
scenes.push(
  {...finisherCommon,id:"s1.mfbt.terry-finisher-ready",attachedObjects:finisherPipe("s1.mfbt.terry-finisher-ready"),actors:["AKIR","KISY","TERY"].map(tag=>finisherActor(tag))},
  {...finisherCommon,id:"s1.mfbt.terry-finisher-win",durationSeconds:272/30,attachedObjects:finisherPipe("s1.mfbt.terry-finisher-win"),actors:[
    finisherActor("AKIR",named("AKI_AT2_SEIKOU_MIGURUSIIZO_KISVSTLY_0100")),finisherActor("KISY"),finisherActor("TERY",named("OTH_TLY_AT2_SEIKOU_MIGURUSIIZO_KISVSTLY_0100"))]},
  {...finisherCommon,id:"s1.mfbt.terry-finisher-failure",durationSeconds:220/30,attachedObjects:finisherPipe("s1.mfbt.terry-finisher-failure"),actors:[
    finisherActor("AKIR",named("AKI_QNG_TETUPIPE_KS_QTE")),finisherActor("KISY"),finisherActor("TERY",named("OTH_TLY_QNG_TETUPIPE_KT_QTE"))]},
);
// Native free-spar timing is deliberately condensed to the shared challenge.
// Hold the exact end-of-demonstration samples; never fake a successful throw
// or use movie completion as input authority.
const swallowPrefix="play/assets/harbor/swallow-lesson";
const swallow=JSON.parse(fs.readFileSync(path.join(root,swallowPrefix,"manifest.json")));
const swallowFile=swallow.outputs.find(o=>o.path.endsWith("/SEQDATA1.AUTH")),swallowBytes=fs.readFileSync(path.join(root,swallowFile.path));
if(sha256(swallowBytes)!==swallowFile.sha256)throw Error("Changed original Swallow Flip demonstration");
const swallowMovement=parseAuthMovement(swallowBytes),swallowSequence=parseAuthSequence(swallowBytes);
const swallowBank=MotnLoader.parse(fs.readFileSync(path.join(root,swallowPrefix,"M_01CHY.MOTN")));
const swallowFrame=swallowSequence.durationFrames-1;
const swallowActors=["AKIR","KISY","TAIJ"].map(tag=>{
  const pose=Object.fromEntries(Object.entries(evaluateAuthActor(swallowMovement.actors.find(a=>a.tag===tag),swallowFrame/30)).filter(([k])=>["x","y","z","rotationX","rotationY","rotationZ"].includes(k)));
  const event=swallowSequence.motions.filter(m=>m.actorTag===tag&&m.frame<=swallowFrame).at(-1),clip=swallowBank.sequences[event?.sequenceIndex];
  const sample=Math.min(event?.endFrame,event?.startFrame+swallowFrame-event?.frame)-1;
  if(event?.motionBank!==16||!clip?.valueData.complete||!Number.isFinite(sample)||sample<0||sample>=clip.durationFrames)throw Error("Unresolved original Swallow Flip held sample "+tag);
  return{tag,pose,motion:{bank:"swallowPractice",name:clip.name,loop:false,elapsedSeconds:sample/30}};
});
const swallowCenter=swallowActors.reduce((p,a)=>({x:p.x+a.pose.x/3,z:p.z+a.pose.z/3}),{x:0,z:0});
scenes.push({id:"s1.mend.swallow-ready",area:"MEND",worldId:"mend",
  actorDefinitions:["KISY","TAIJ"].map(actorCode=>({actorCode,...swallow.packageActors[actorCode],activityOnly:true})),actors:swallowActors,
  camera:{positionX:swallowCenter.x+4,positionY:3,positionZ:swallowCenter.z+5,targetX:swallowCenter.x,targetY:1,targetZ:swallowCenter.z,roll:0,perspective:55},
  provenance:"Exact original M0W0 demonstration-end roots and motion samples held during actual shared Down/X/A input. Wide camera, sequential back/punch and two-second windows are authored; original timing-based free-spar physics is not reconstructed."});
fs.writeFileSync(path.join(root,"play/data/story-final-day.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_final_day.mjs",motionBanks:{tomPractice:`${prefix}/M_0001.MOTN`,finalCounter:`${confrontationPrefix}/M_01_H.MOTN`,finalTerry:`${finisherPrefix}/M_01TLY.MOTN`,swallowPractice:`${swallowPrefix}/M_01CHY.MOTN`},scenes},null,2)+"\n");
console.log("Generated final-day practice/counter staging; no input or outcome authority.");
