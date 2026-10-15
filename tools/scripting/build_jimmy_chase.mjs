#!/usr/bin/env node
// Walkthrough button order + original road waypoints; deliberately authored
// chase beats, not recovered DYNAMICS/opcode execution or Jimmy's native path.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS} from "../../src/ThirdPersonControllerRules.js";

const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const buttons=["Left","Right","Left","Right","Left","Right","A","Left","Left","Right","Left","Right","A"];
const prefix="s1.d000.jimmy-chase.beat-",group="s1.d000.jimmy-chase";
const source=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/dobuita.json")));
const routeId="MTRI:e18c81dc1131:59400:0x4af60";
const road=source.actors.find(a=>a.actorCode==="MTRI")?.routes.find(r=>r.id===routeId)?.points.slice(34,80).reverse();
if(!road||createHash("sha256").update(JSON.stringify(road)).digest("hex")!=="ed8fd50b876e089584c436bfecead4df7f0ad836ef155b43c9a66d2b85cb2b83")throw Error("Changed reviewed Dobuita road route");
// Source AUTH supplies both ends; a civilian road route supplies a walkable
// intermediate corridor. This is not claimed to be the original chase route.
const points=[[71.554931640625,0,79.96207427978516],...road.slice(0,-1),[-8.479000091552734,0,29.3179988861084],[-12.5339994430542,0,29.57900047302246]];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+distance(points[i-1],points[i]));
const total=cumulative.at(-2),speed=DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.runSpeed;
function at(value){
  value=Math.max(0,Math.min(cumulative.at(-1),value));let i=1;while(i<cumulative.length-1&&cumulative[i]<value)i++;
  const t=(value-cumulative[i-1])/(cumulative[i]-cumulative[i-1]);return points[i].map((v,k)=>points[i-1][k]+(v-points[i-1][k])*t);
}
function pose(value){
  const p=at(value),q=at(Math.min(cumulative.at(-1),value+.05)),dx=q[0]-p[0],dz=q[2]-p[2];
  return{x:-p[0],y:p[1],z:p[2],rotationX:0,rotationY:180-Math.atan2(dx,dz)*180/Math.PI,rotationZ:0};
}
function camera(value){
  const p=at(value),q=at(value+.05),length=Math.hypot(q[0]-p[0],q[2]-p[2])||1,dx=(q[0]-p[0])/length,dz=(q[2]-p[2])/length;
  return{positionX:-(p[0]-dx*4+dz*1.2),positionY:p[1]+2.2,positionZ:p[2]-dz*4-dx*1.2,
    targetX:-(p[0]+dx*2),targetY:p[1]+1.1,targetZ:p[2]+dz*2,roll:0,perspective:65};
}
function track(samples){
  return{channels:Object.fromEntries(Object.keys(samples[0].value).map(key=>{
    const values=samples.map(x=>x.value[key]);
    // Avoid a full spin when a road heading crosses the 0/360-degree seam.
    if(key==="rotationY")for(let i=1;i<values.length;i++)values[i]=values[i-1]+Math.atan2(Math.sin((values[i]-values[i-1])*Math.PI/180),Math.cos((values[i]-values[i-1])*Math.PI/180))*180/Math.PI;
    return[key,{times:samples.map(x=>x.time),values,tangents:values.map((v,i)=>{
      const a=Math.max(0,i-1),b=Math.min(values.length-1,i+1);return(values[b]-values[a])/(samples[b].time-samples[a].time);
    })}];
  }))};
}
const scenes=buttons.map((button,index)=>{
  const start=total*index/buttons.length,end=total*(index+1)/buttons.length,duration=(end-start)/speed;
  const stations=[start,...cumulative.filter(d=>d>start&&d<end),end];
  const samples=(fn,offset=0)=>stations.map(d=>({time:d===start?0:d===end?duration:(d-start)/speed,value:fn(d+offset)}));
  return{id:`${prefix}${String(index+1).padStart(2,"0")}`,area:"D000",worldId:"dobuita",continuationGroup:group,continuesPrevious:index>0,durationSeconds:duration,
    provenance:`Authored chase beat ${index+1}/${buttons.length}, ${button}; original MTRI road corridor ${routeId}, not Jimmy's native route. Existing Ryo run pace, generic biped running, follow camera and held input beat are adaptations.`,
    actorDefinitions:index===0?[{actorCode:"JIMY",label:"Jimmy Yan",modelCode:"JIM_M",activityOnly:true}]:[],
    actors:[{tag:"AKIR",pose:pose(start),motion:{bank:"free",name:"AKI_AKI_RUN_LP",loop:true},endMotion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true},movement:track(samples(pose))},
      {tag:"JIMY",pose:pose(start+3.5),motion:{bank:"free",name:"AKI_AKI_RUN_LP",loop:true},endMotion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true},movement:track(samples(pose,3.5))}],
    camera:camera(start),cameraTrack:track(samples(camera))};
});
// Generated curves are reviewed through this compiler, not thousands of
// single-number diff lines. Keep one deterministic scene record per line.
fs.writeFileSync(path.join(root,"play/data/story-jimmy-chase.generated.json"),'{\n  "schema":"new-yokosuka-authored-story-scenes-v1",\n  "generatedBy":"tools/scripting/build_jimmy_chase.mjs",\n  "motionBanks":{},\n  "scenes":[\n'+scenes.map(s=>"    "+JSON.stringify(s)).join(",\n")+'\n  ]\n}\n');
const failed=scene=>`<<play_sequence "${scene.id}.finish">>\n<<start_activity "s1.d000.jimmy-escaped.scene">>\n-> Try again\n    <<jump Attempt>>\n-> Leave it for now\n    <<jump Done>>`;
let yarn=`// Generated by tools/scripting/build_jimmy_chase.mjs\n-> Knock at Asia Travel\n    <<jump Attempt>>\n-> Leave it for now\n    <<jump Done>>\n===\ntitle: Attempt\n---\n<<start_activity "s1.d000.jimmy-knock.scene">>\n<<jump Beat01>>\n`;
for(let i=0;i<scenes.length;i++){
  const s=scenes[i],number=String(i+1).padStart(2,"0"),challenge=`s1.d000.jimmy-chase.${buttons[i].toLowerCase()}`;
  yarn+=`===\ntitle: Beat${number}\n---\n<<play_sequence "${s.id}.start">>\n<<start_challenge "${challenge}">>\n<<if challenge_result("${challenge}") != "success">>\n${failed(s)}\n<<else>>\n`;
  yarn+=i<scenes.length-1?`<<jump Beat${String(i+2).padStart(2,"0")}>>\n`:`<<play_sequence "${s.id}.finish">>\n<<start_activity "s1.d000.jimmy-caught.scene">>\n<<travel_story "{{destination}}">>\n{{effects}}\n<<complete>>\n`;
  yarn+="<<endif>>\n";
}
yarn+="===\ntitle: Done\n---\n<<complete>>\n";
fs.writeFileSync(path.join(import.meta.dirname,"story-jimmy-chase.yarn"),yarn);
// Preserve the hand-maintained registry's formatting and unrelated records.
const registry=path.join(server,"internal/scriptcontent/commands.v1.json");let text=fs.readFileSync(registry,"utf8");
text=text.split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(prefix)).join("\n");
const capabilities=scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:`Authored continuous Jimmy chase beat ${part}; presentation only.`})));
text=text.replace('"capabilities": [','"capabilities": [\n'+capabilities.map(c=>"    "+JSON.stringify(c)+",").join("\n"));
JSON.parse(text);fs.writeFileSync(registry,text);
console.log(`Generated ${scenes.length} moving chase beats, shared Left/Right/A challenges and ordinary Yarn.`);
