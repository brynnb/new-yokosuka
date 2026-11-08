#!/usr/bin/env node
// Original paired defensive motions, expressed through the shared tableau
// runtime. Button adjudication and persistent outcomes remain outside scenes.
import fs from "node:fs";
import path from "node:path";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
import {parseAuthCamera,evaluateAuthCamera} from "../../src/AuthCamera.js";

const root=path.resolve(import.meta.dirname,"../..");
const server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const asset="play/assets/dobuita/yq14/M_YQ14.MOTN";
const bytes=fs.readFileSync(path.join(root,asset));
if(sha256(bytes)!=="ff7984a495727a5f9c89eb82cc1fa0e8ca8f08b9510e40abe46d970965d15f6e")throw Error("Changed original YQ14 defensive bank");
const bank=MotnLoader.parse(bytes);
const auth=fs.readFileSync(path.join(root,"play/assets/dobuita/yq14/SEQDATA2.AUTH"));
if(sha256(auth)!=="e56fd5983791b824f1f7b1ce40629a207df87f5081b723cc7b5d18d1c2af4b58")throw Error("Changed original YQ14 camera source");
const camera=evaluateAuthCamera(parseAuthCamera(auth).cameras[0],4);
const group="s1.heartbeats.alley.defense";
const idle={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
const motion=(name,held=false)=>{
  const sequence=bank.getSequence(name);
  if(!sequence?.valid||!sequence.valueData.complete)throw Error(`Incomplete original motion ${name}`);
  return {bank:"heartbeats",name,loop:false,...(held?{elapsedSeconds:0}:{})};
};
const pose=(x,z,rotationY)=>({x,y:-1.88258,z,rotationX:0,rotationY,rotationZ:0});
const success=["AKI_KERI_SEIKOU_1QTE","TKA_KERI_SEIKOU_1QTE"];
const failure=["AKI_KERI_SIPPAI_1QTE","TKA_KERI_SIPPAI_1QTE"];
const heldAtEnd=name=>({...motion(name),elapsedSeconds:bank.getSequence(name).durationFrames/30});
const walk={bank:"free",name:"AKI_AKI_WALK_LP",loop:true};
const firstRyo=pose(-119.9,70.6,0), firstTony=pose(-119.9,69.4,180);
const firstSmith=pose(-120.85,67.58,-108.86), secondRyo=pose(-119.9,71.8,0), secondSmith=pose(-119.9,70.6,-180);
// Position the next pair gradually instead of cutting between two unrelated
// poses. The source clips, not these authored staging offsets, are original.
const track=(from,to,duration)=>({channels:Object.fromEntries(Object.keys(from).map(key=>[key,{
  times:[0,duration],values:[from[key],to[key]],tangents:[0,0],
}]))});
const scenes=[
  ["prompt",success,true],
  ["success",success,false],
  ["failure",failure,false],
].map(([part,names,held],index)=>({
  id:`${group}.${part}`,area:"D000",worldId:"dobuita",continuationGroup:group,continuesPrevious:index>0,
  actorDefinitions:[],
  provenance:"Original hash-pinned YQ14 KERI success/failure actor-motion pairs and held SEQDATA2 camera at 4 seconds. Tony role assignment and alley alignment are visually reviewed adaptations, not a decoded native QTE controller. Two-second B prompt holds the source start pose; original failure-recovery branching and Smith's native choreography remain unresolved.",
  actors:[
    {tag:"AKIR",pose:pose(-119.9,70.6,0),motion:motion(names[0],held)},
    {tag:"TONY",pose:pose(-119.9,69.4,180),motion:motion(names[1],held)},
    // Keep Smith at the original beer-scene side of the alley. His second
    // choreography is not invented from unrelated finisher/recovery clips.
    {tag:"SMTH",pose:pose(-120.85,67.58,-108.86),motion:idle},
  ],camera,
  ...(!held?{durationSeconds:Math.max(...names.map(n=>bank.getSequence(n).durationFrames))/30}:{}),
}));
const scene=(part,actors,options={})=>({
  id:`${group}.${part}`,area:"D000",worldId:"dobuita",continuationGroup:group,continuesPrevious:true,
  actorDefinitions:[],camera,
  provenance:"Authored second-attacker staging: reuses the original paired YQ14 kick motion on Smith, not a recovered second-QTE branch. Transition placement and timing are approximations.",
  actors,...options,
});
const downTony={tag:"TONY",pose:firstTony,motion:heldAtEnd(success[1])};
// The model's root is displaced at the end of the first clip. Derive its
// transition start from the motion bank rather than guessing the distance.
const firstMotion=bank.getSequence(success[0]);
const ryoEnd={...firstRyo,
  x:firstRyo.x+MotnLoader.samplePoseChannel(firstMotion,firstMotion.durationFrames,0,"tx"),
  z:firstRyo.z+MotnLoader.samplePoseChannel(firstMotion,firstMotion.durationFrames,0,"tz")};
const setupDuration=2;
scenes.push(scene("second-setup",[
  {tag:"AKIR",pose:ryoEnd,motion:walk,movement:track(ryoEnd,secondRyo,setupDuration),endMotion:motion(success[0],true)},
  downTony,
  {tag:"SMTH",pose:firstSmith,motion:walk,movement:track(firstSmith,secondSmith,setupDuration),endMotion:motion(success[1],true)},
],{durationSeconds:setupDuration}));
for(const [part,names,held] of [["second-prompt",success,true],["second-success",success,false],["second-failure",failure,false]]){
  scenes.push(scene(part,[
    {tag:"AKIR",pose:secondRyo,motion:motion(names[0],held)},downTony,
    {tag:"SMTH",pose:secondSmith,motion:motion(names[1],held)},
  ],held?{}:{durationSeconds:Math.max(...names.map(n=>bank.getSequence(n).durationFrames))/30}));
}
fs.writeFileSync(path.join(root,"play/data/story-heartbeats.generated.json"),JSON.stringify({
  schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_heartbeats_alley.mjs",
  motionBanks:{heartbeats:asset},scenes,
},null,2)+"\n");
const file=path.join(server,"internal/scriptcontent/commands.v1.json");
let registry=fs.readFileSync(file,"utf8").split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(`"identifier":"${group}.`)).join("\n");
registry=registry.replace('"capabilities": [','"capabilities": [\n'+scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:"Original YQ14 paired defensive motion with authored staging; no progress authority."}))).map(c=>"    "+JSON.stringify(c)+",").join("\n"));
JSON.parse(registry);fs.writeFileSync(file,registry);
console.log("Generated Heartbeats defensive exchanges; second-attacker staging is an authored approximation.");
