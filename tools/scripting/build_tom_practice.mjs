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
fs.writeFileSync(path.join(root,"play/data/story-final-day.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_tom_practice.mjs",motionBanks:{tomPractice:`${prefix}/M_0001.MOTN`},scenes},null,2)+"\n");
console.log("Generated original Tom practice tableaus; no input or outcome authority.");
