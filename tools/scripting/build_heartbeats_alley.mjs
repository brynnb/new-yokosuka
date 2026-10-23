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
const scenes=[
  ["prompt",success,true],
  ["success",success,false],
  ["failure",failure,false],
].map(([part,names,held],index)=>({
  id:`${group}.${part}`,area:"D000",worldId:"dobuita",continuationGroup:group,continuesPrevious:index>0,
  actorDefinitions:[],
  provenance:"Original hash-pinned YQ14 KERI success/failure actor-motion pairs and held SEQDATA2 camera at 4 seconds. Tony role assignment and alley alignment are visually reviewed adaptations, not a decoded native QTE controller. Two-second B prompt holds the source start pose; original failure-recovery branching and Smith's second defensive exchange remain unresolved.",
  actors:[
    {tag:"AKIR",pose:pose(-119.9,70.6,0),motion:motion(names[0],held)},
    {tag:"TONY",pose:pose(-119.9,69.4,180),motion:motion(names[1],held)},
    // Keep Smith at the original beer-scene side of the alley. His second
    // choreography is not invented from unrelated finisher/recovery clips.
    {tag:"SMTH",pose:pose(-120.85,67.58,-108.86),motion:idle},
  ],camera,
  ...(!held?{durationSeconds:Math.max(...names.map(n=>bank.getSequence(n).durationFrames))/30}:{}),
}));
fs.writeFileSync(path.join(root,"play/data/story-heartbeats.generated.json"),JSON.stringify({
  schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_heartbeats_alley.mjs",
  motionBanks:{heartbeats:asset},scenes,
},null,2)+"\n");
const file=path.join(server,"internal/scriptcontent/commands.v1.json");
let registry=fs.readFileSync(file,"utf8").split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(`"identifier":"${group}.`)).join("\n");
registry=registry.replace('"capabilities": [','"capabilities": [\n'+scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:"Original YQ14 paired defensive motion with authored staging; no progress authority."}))).map(c=>"    "+JSON.stringify(c)+",").join("\n"));
JSON.parse(registry);fs.writeFileSync(file,registry);
console.log("Generated Heartbeats first defensive exchange; second-attacker choreography remains unverified.");
