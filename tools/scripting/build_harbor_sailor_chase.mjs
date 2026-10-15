#!/usr/bin/env node
// Original introduction/endings + a walkthrough-led branching foot chase.
// Existing Yarn/QTE/tableau primitives own execution; no native controller.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createChasePath,curveTrack} from "../lib/AuthoredChase.mjs";
import {parseAuthMovement,evaluateAuthActor} from "../../src/AuthMovement.js";
import {DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS} from "../../src/ThirdPersonControllerRules.js";

const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const source=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/mfsy.json")));
const road=source.actors.find(a=>a.actorCode==="DJUN")?.routes.find(r=>r.id==="DJUN:1e57bb176be0:40200:0xb2e4")?.points;
if(!road||createHash("sha256").update(JSON.stringify(road)).digest("hex")!=="6abf094f0f8d5f4e5e244475d19fda7e0c0f25cf8587dd1b6df0b743a6d6462e")throw Error("Changed reviewed harbor road");
function originalPose(id,file,ending){
  const movement=parseAuthMovement(fs.readFileSync(path.join(root,`play/assets/harbor/${id}/${file}`)));
  const pose=evaluateAuthActor(movement.actors.find(a=>a.tag==="AKIR"),ending?movement.duration:0);
  // Scheduled road points are browser coordinates; authored actor/camera
  // poses are native coordinates. createChasePath performs the conversion.
  return[-pose.x,0,pose.z];
}
const start=originalPose("sailor-chase-intro","SEQDATA0.AUTH",true);
const endpoints={tony:originalPose("sailor-chase-tony","SEQDATA1.AUTH",false),smith:originalPose("sailor-chase-smith","SEQDATA0.AUTH",false)};
const group="s1.mfsy.sailor-chase",speed=DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.runSpeed,scenes=[];
const intro=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/sailor-chase-intro/manifest.json")));
// Match existing shared identities exactly; a second competing Tony/Smith
// definition must not block actor registry assembly at application startup.
const known=JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeActivityActors.json"))).worlds.dobuita;
const defs=["TONY","SMTH"].map(tag=>{
  const existing=known.find(a=>a.actorCode===tag);
  if(existing)return existing;
  return{actorCode:tag,...intro.packageActors[tag],activityOnly:true};
});
const paths=Object.fromEntries(Object.entries(endpoints).map(([id,end])=>[id,createChasePath([start,...road,end,[end[0]-2,end[1],end[2]]])]));
const common=paths.tony,total=common.cumulative.at(-2),split=total/2;
function scene(id,p,from,to,tags,first=false){
  const duration=Math.max(.25,(to-from)/speed),stations=from===to?[from,from]:[from,...p.cumulative.filter(d=>d>from&&d<to),to];
  const samples=(fn,offset=0)=>stations.map((d,i)=>({time:i===0?0:i===stations.length-1?duration:(d-from)/speed,value:fn(d+offset)}));
  const record={id:`${group}.${id}`,area:"MFSY",worldId:"mfsy",continuationGroup:group,continuesPrevious:!first,durationSeconds:duration,
    provenance:"Walkthrough-led sailor foot chase. Original DJUN road corridor joins original introduction/interrogation endpoints. Generic biped running, follow camera, held input windows, untimed fork choices and condensed route are authored, not native DYNAMICS timing or obstacle choreography.",
    actorDefinitions:first?defs:[],actors:["AKIR","TONY","SMTH"].map((tag,index)=>({tag,presented:tags.includes(tag),pose:p.pose(from+index*2),
      motion:{bank:"free",name:from===to?"AKI_AKI_STAND_LP":"AKI_AKI_RUN_LP",loop:true},endMotion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true},movement:curveTrack(samples(p.pose,index*2))})),
    camera:p.camera(from),cameraTrack:curveTrack(samples(p.camera))};
  scenes.push(record);return record.id;
}
const core=["Left","B","B","Left","A"];
for(let i=0;i<core.length;i++)scene(`common-${i+1}`,common,split*i/5,split*(i+1)/5,["AKIR","TONY","SMTH"],i===0);
scene("fork-left",common,split,split,["AKIR","TONY","SMTH"]);
const branches={tony:["Left","Right","A","Right","Left","Right"],smith:["Right","A","Left","Right","Left","Right"]};
for(const [branch,buttons]of Object.entries(branches)){
  const p=paths[branch],end=p.cumulative.at(-2);
  for(let i=0;i<buttons.length;i++)scene(`${branch}-${i+1}`,p,split+(end-split)*i/6,split+(end-split)*(i+1)/6,["AKIR",branch==="tony"?"TONY":"SMTH"]);
}
fs.writeFileSync(path.join(root,"play/data/story-harbor-sailors.generated.json"),'{\n  "schema":"new-yokosuka-authored-story-scenes-v1",\n  "generatedBy":"tools/scripting/build_harbor_sailor_chase.mjs",\n  "motionBanks":{},\n  "scenes":[\n'+scenes.map(s=>"    "+JSON.stringify(s)).join(",\n")+'\n  ]\n}\n');
let yarn='Ryo Hazuki: Tony and Smith are near Tomato. Ask them about the Long Zha. #speaker:AKIR\n-> Question the sailors\n    <<jump Intro>>\n-> Leave it for now\n    <<jump Done>>\n===\ntitle: Intro\n---\n<<start_activity "s1.mfsy.sailor-chase-intro.scene">>\n<<jump Common1>>\n';
function beat(node,id,button,next){
  yarn+=`===\ntitle: ${node}\n---\n<<play_sequence "${group}.${id}.start">>\n<<start_challenge "${group}.${button.toLowerCase()}">>\n<<if challenge_result("${group}.${button.toLowerCase()}") != "success">>\n<<play_sequence "${group}.${id}.finish">>\nRyo Hazuki: I lost them. Try following the sailors again? #speaker:AKIR\n-> Try again\n    <<jump Intro>>\n-> Leave it for now\n    <<jump Done>>\n<<else>>\n<<jump ${next}>>\n<<endif>>\n`;
}
core.forEach((button,i)=>beat(`Common${i+1}`,`common-${i+1}`,button,i===4?"FirstFork":`Common${i+2}`));
yarn+='===\ntitle: FirstFork\n---\n-> Take the left path\n    <<jump ForkLeft>>\n-> Take the right path\n    <<jump SailorFork>>\n';
beat("ForkLeft","fork-left","Left","SailorFork");
yarn+='===\ntitle: SailorFork\n---\n-> Follow Tony (left)\n    <<jump tony1>>\n-> Follow Smith (right)\n    <<jump smith1>>\n';
for(const [branch,buttons]of Object.entries(branches)){
  buttons.forEach((button,i)=>beat(`${branch}${i+1}`,`${branch}-${i+1}`,button,i===buttons.length-1?`${branch}Ending`:`${branch}${i+2}`));
  yarn+=`===\ntitle: ${branch}Ending\n---\n<<play_sequence "${group}.${branch}-6.finish">>\n<<start_activity "s1.mfsy.sailor-chase-${branch}.scene">>\n<<travel_story "s1.work.sailor-${branch}-alley">>\n{{effects}}\n<<jump Done>>\n`;
}
yarn+='===\ntitle: Done\n---\n<<complete>>\n';
fs.writeFileSync(path.join(import.meta.dirname,"story-harbor-sailor-chase.yarn"),yarn);
const filename=path.join(server,"internal/scriptcontent/commands.v1.json");let registry=fs.readFileSync(filename,"utf8");
registry=registry.split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(`"identifier":"${group}.`)).join("\n");
registry=registry.replace('"capabilities": [','"capabilities": [\n'+scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:"Private authored sailor chase beat; actual input required, no presentation reward."}))).map(c=>"    "+JSON.stringify(c)+",").join("\n"));JSON.parse(registry);fs.writeFileSync(filename,registry);
console.log(`Generated ${scenes.length} authored scenes, two sailor branches and ordinary Yarn.`);
