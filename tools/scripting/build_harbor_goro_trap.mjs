#!/usr/bin/env node
// Nine walkthrough inputs and original paired clips -> existing Yarn, QTE and
// tableau primitives. No native DYNAMICS interpreter or presentation rewards.
import fs from "node:fs";
import path from "node:path";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03/MB9Q/MPK00.PKS");
const bytes=fs.readFileSync(source);
if(sha256(bytes)!=="70a419eb5544dade0c62f3b2ca0a8d747eaf79e11e9df5c467b728d753b22f7c")throw Error("Changed original MB9Q fight resource");
const motion=fs.readFileSync(path.join(root,"play/assets/harbor/goro-trap-aftermath/M_MB9Q2.MOTN"));
if(sha256(motion)!==sha256(parseIpacActivityArchive(bytes).members.find(m=>m.name==="M_MB9Q2.MOTN").bytes))throw Error("QTE bank differs from original");
const bank=MotnLoader.parse(motion),manifest=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/goro-trap-aftermath/manifest.json")));
const group="s1.mfsy.goro-trap",tags=["AKIR","GORO","TONY",..."ABCDEFGH".split("").map(c=>`BK${c}_`)];
const idle={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
const pose=(x,z,rotationY=0)=>({x,y:0,z,rotationX:0,rotationY,rotationZ:0});
const definition=tag=>({actorCode:tag,...manifest.packageActors[tag],activityOnly:true});
// Tony already participates in other authored harbor fights. Borrow that
// exact identity rather than competing with it through a second definition.
const tony=JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeActivityActors.json"))).worlds.dobuita.find(a=>a.actorCode==="TONY");
if(!tony||tony.modelCode!==manifest.packageActors.TONY.modelCode||sha256(fs.readFileSync(path.join(root,`play/assets/characters/${tony.modelCode}.CHRM`)))!==sha256(fs.readFileSync(path.join(root,manifest.packageActors.TONY.assetPath))))throw Error("Existing Tony is not the original MB9Q body");
const definitions=[{actorCode:"GORO",label:"Goro Mihashi",modelCode:"KMB_L",activityOnly:true},tony,...tags.filter(t=>!["AKIR","GORO","TONY"].includes(t)).map(definition)];
const camera={positionX:44.5,positionY:2.2,positionZ:79,targetX:41.4,targetY:1,targetZ:75.3,roll:0,perspective:65};
const scenes=[];
function stage(id,visible,motions={},positions={},timed=false){
  const duration=Math.max(0,...Object.values(motions).map(name=>{const s=bank.getSequence(name);if(!s?.valid)throw Error(`Missing original paired clip ${name}`);return s.durationFrames/30;}));
  const scene={id:`${group}.${id}`,area:"MFSY",worldId:"mfsy",continuationGroup:group,continuesPrevious:scenes.length>0,
    provenance:"Original MB9Q paired QTE motions after real server-validated input. Outdoor staging, model-to-fighter-role pairing, two-second input windows and camera are authored; not native DYNAMICS placement or animation/button timing. Last Left/Down/A sequence shares the original GH two-attacker motion family.",
    actorDefinitions:scenes.length?[]:definitions,
    actors:tags.map(tag=>({tag,presented:visible.includes(tag),pose:positions[tag]||pose(41.4,tag==="AKIR"?75.95:74.7,tag==="AKIR"?0:180),motion:motions[tag]?{bank:"harborTrap",name:motions[tag],loop:false}:idle})),camera,
    ...(timed?{durationSeconds:duration}:{})};
  if(timed&&duration<=0)throw Error(`Empty timed QTE beat ${id}`);scenes.push(scene);return scene.id;
}
const intro=stage("intro",["AKIR","GORO","TONY"],{},{AKIR:pose(41.4,75.95,55),GORO:pose(40.2,75.1,235),TONY:pose(40.5,73.8,180)});
const steps=[...["B","A","B","A","A","B"].map((button,i)=>({code:String.fromCharCode(65+i),buttons:[button],tags:[`BK${String.fromCharCode(65+i)}_`]})),{code:"GH",buttons:["Left","Down","A"],tags:["BKG_","BKH_"]}];
for(const step of steps){
  const visible=["AKIR",...step.tags],positions=step.code==="GH"?{BKG_:pose(40.4,74.7,180),BKH_:pose(42.4,74.7,180)}:{};
  step.prompt=stage(`${step.code.toLowerCase()}.prompt`,visible,{},positions);
  for(const [outcome,word]of [["success","SEIKOU"],["failure","SIPPAI"]]){
    const motions={AKIR:`AKI_QTE_${word}_BUKA_${step.code}_02133`};
    for(const tag of step.tags)motions[tag]=step.code==="GH"?`${tag.slice(0,3)}_QTE_SEIKOU_SIPPAI_BUKA_GH_02133`:`${tag.slice(0,3)}_QTE_${word}_BUKA_${step.code}_02133`;
    step[outcome]=stage(`${step.code.toLowerCase()}.${outcome}`,visible,motions,positions,true);
  }
}
// Each prompt starts/reuses one lease; generated file order is not execution
// order. Every scene after the intro is a transition from the current beat.
fs.writeFileSync(path.join(root,"play/data/story-harbor-goro.generated.json"),'{\n  "schema":"new-yokosuka-authored-story-scenes-v1",\n  "generatedBy":"tools/scripting/build_harbor_goro_trap.mjs",\n  "motionBanks":{"harborTrap":"play/assets/harbor/goro-trap-aftermath/M_MB9Q2.MOTN"},\n  "scenes":[\n'+scenes.map(s=>"    "+JSON.stringify(s)).join(",\n")+'\n  ]\n}\n');
let yarn=`-> Help Goro\n    <<jump Intro>>\n-> Leave it for now\n    <<jump Done>>\n===\ntitle: Intro\n---\n<<play_sequence "${intro}.start">>\n`;
for(const id of ["019RNA001","019RNB002","019RNB003","019RNC001","019RNA002","019RNA004"])yarn+=`{{voice:${id}}}\n`;
yarn+='<<jump Beat1>>\n';
for(const [i,step]of steps.entries()){
  const challenge=`${group}.${step.code==="GH"?"finisher":step.buttons[0].toLowerCase()}`;
  yarn+=`===\ntitle: Beat${i+1}\n---\n<<play_sequence "${step.prompt}.start">>\n<<start_challenge "${challenge}">>\n<<if challenge_result("${challenge}") != "success">>\n<<play_sequence "${step.failure}.start">>\n<<play_sequence "${step.failure}.finish">>\nRyo Hazuki: I could not get through their trap. Try again? #speaker:AKIR\n-> Try again\n    <<jump Intro>>\n-> Leave it for now\n    <<jump Done>>\n<<else>>\n<<play_sequence "${step.success}.start">>\n`;
  yarn+=i<steps.length-1?`<<jump Beat${i+2}>>\n`:`<<play_sequence "${step.success}.finish">>\n<<start_activity "s1.mfsy.goro-trap-aftermath.scene">>\n{{effects}}\n<<jump Done>>\n`;
  yarn+='<<endif>>\n';
}
yarn+='===\ntitle: Done\n---\n<<complete>>\n';fs.writeFileSync(path.join(import.meta.dirname,"story-harbor-goro-trap.yarn"),yarn);
const filename=path.join(server,"internal/scriptcontent/commands.v1.json");let registry=fs.readFileSync(filename,"utf8");
registry=registry.split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(`"identifier":"${group}.`)).join("\n");
registry=registry.replace('"capabilities": [','"capabilities": [\n'+scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:"Original paired Goro-trap motion with authored private staging; no outcome authority."}))).map(c=>"    "+JSON.stringify(c)+",").join("\n"));JSON.parse(registry);fs.writeFileSync(filename,registry);
console.log(`Generated ${steps.length} paired-motion beats for nine real QTE inputs; no victory from animation.`);
