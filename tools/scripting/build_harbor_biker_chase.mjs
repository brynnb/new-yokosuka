#!/usr/bin/env node
// Reviewed road data + walkthrough inputs -> ordinary scene curves and Yarn.
// No native DYNAMICS controller reconstruction or client-side story settlement.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createChasePath,curveTrack} from "../lib/AuthoredChase.mjs";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS} from "../../src/ThirdPersonControllerRules.js";

const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const source=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/mfsy.json")));
function road(code,id,hash){
  const r=source.actors.find(a=>a.actorCode===code)?.routes.find(r=>r.id===id);
  if(!r||createHash("sha256").update(JSON.stringify(r.points)).digest("hex")!==hash)throw Error(`Changed reviewed harbor road ${id}`);
  return r.points;
}
const a=road("HANA","HANA:c1c4e793a165:36000:0x19904","48256a45fb4233b1e2c485cfe35e3d42f80a539f570b4131131f252c06652674");
const b=road("DJUN","DJUN:1e57bb176be0:40200:0xb2e4","6abf094f0f8d5f4e5e244475d19fda7e0c0f25cf8587dd1b6df0b743a6d6462e");
const c=road("HTSI","HTSI:75c79eedc112:31500:0x1b9e4:secondary","6fc018263fd0b5b1deec8e5f8a615511432add1669d5e3fc668cf211ae7b4fa0");
const points=[...a.slice(0,6),...b.slice(9),...c.slice(90,128),[-96.5,0,22.3]];
const discRoot=process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2");
const native=fs.readFileSync(path.join(discRoot,"data/SCENE/03/MFSY/MBQC.PKS"));
if(sha256(native)!=="39623d989642b19fbe99f7285e8a5a852410324e3bd39b6ccbc68ece7798bcc1")throw Error("Changed MBQC source");
const original=parseIpacActivityArchive(native).members;
for(const name of ["M_MBQC.MOTN","BIKK5DYG.CHRM"]){
  if(sha256(original.find(m=>m.name===name).bytes)!==sha256(fs.readFileSync(path.join(root,"play/assets/harbor/chicken-race",name))))throw Error(`Shared chase asset differs from original MBQC/${name}`);
}
const ending=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/charlie-harbor-interrogation/manifest.json")));
const defs=Object.entries(ending.packageActors).map(([actorCode,d])=>({actorCode,...d,activityOnly:true}));
const charlie=defs.find(d=>d.actorCode==="CHRL");
const {cumulative,pose,camera}=createChasePath(points),total=cumulative.at(-2),speed=DEFAULT_THIRD_PERSON_CONTROLLER_OPTIONS.runSpeed;
const buttons=["Left","Right","A","Left","Left","A","Right","Right","Right","Left","Left","Right"];
const prefix="s1.mfsy.biker-chase.beat-",group="s1.mfsy.biker-chase";
const riding=value=>({...pose(value),y:pose(value).y+.286});
const bikePose=pose(4),sceneObjects={BIK1:{model:"BIKK5DYG",browserFilename:"BIKK5DYG.CHRM",assetPath:"play/assets/harbor/chicken-race/BIKK5DYG.CHRM",textureAssetPath:"play/assets/harbor/chicken-race/textures.bin",
  lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[bikePose.x,bikePose.y,bikePose.z],rotationDegrees:[0,bikePose.rotationY,0],scale:[1,1,1]}}};
const scenes=buttons.map((button,index)=>{
  const start=total*index/buttons.length,end=total*(index+1)/buttons.length,duration=(end-start)/speed;
  const stations=[start,...cumulative.filter(d=>d>start&&d<end),end];
  const samples=(fn,offset=0)=>stations.map(d=>({time:d===start?0:d===end?duration:(d-start)/speed,value:fn(d+offset)}));
  return{id:`${prefix}${String(index+1).padStart(2,"0")}`,area:"MFSY",worldId:"mfsy",continuationGroup:group,continuesPrevious:index>0,durationSeconds:duration,
    provenance:`Authored harbor chase beat ${index+1}/${buttons.length}, ${button}. GameSpot p57 inputs and original HANA/DJUN/HTSI road corridors; not the native biker route, timing or camera. MBQC motorcycle/motions reuse byte-identical RACE assets. Charlie borrows the original riding loop; Ryo uses the existing run pace.`,
    actorDefinitions:index===0?[charlie]:[],sceneObjects,sceneObjectTracks:{BIK1:curveTrack(samples(pose,4))},
    actors:[{tag:"AKIR",pose:pose(start),motion:{bank:"free",name:"AKI_AKI_RUN_LP",loop:true},endMotion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true},movement:curveTrack(samples(pose))},
      {tag:"CHRL",pose:riding(start+4),motion:{bank:"chickenRace",name:"OTH_TKA_NORU_BIKE_LP_QTE",loop:true},movement:curveTrack(samples(riding,4))}],
    camera:camera(start),cameraTrack:curveTrack(samples(camera))};
});
// The original aftermath identifies three bikers, not all five free-battle
// opponents. Two existing reviewed thug models are explicit donors.
const base=JSON.parse(fs.readFileSync(path.join(root,"play/data/authored-story-scenes.json")));
const donors=["MRSK","OKYS"].map(tag=>base.scenes.flatMap(s=>s.actorDefinitions||[]).find(d=>d.actorCode===tag));
if(donors.some(d=>!d))throw Error("Missing reviewed combat donor");
const formation={AKIR:[-92,0,25],BTK_:[-89,0,21],BTH_:[-94,0,20],BTA_:[-97,0,22],MRSK:[-90,0,18],OKYS:[-95,0,18]};
scenes.push({id:"s1.mfsy.biker-thugs",area:"MFSY",worldId:"mfsy",provenance:"Authored five-thug formation near the original interrogation. Three original BAT_MBQC low-detail bodies plus two declared donor models; not a recovered native free-battle roster.",
  actorDefinitions:[...defs.filter(d=>d.actorCode!=="CHRL"),...donors],
  actors:Object.entries(formation).map(([tag,p])=>({tag,pose:{x:-p[0],y:p[1],z:p[2],rotationX:0,rotationY:0,rotationZ:0},motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}})),
  camera:{positionX:92,positionY:3,positionZ:30,targetX:92,targetY:1,targetZ:22,roll:0,perspective:60}});
fs.writeFileSync(path.join(root,"play/data/story-harbor-biker.generated.json"),'{\n  "schema":"new-yokosuka-authored-story-scenes-v1",\n  "generatedBy":"tools/scripting/build_harbor_biker_chase.mjs",\n  "motionBanks":{},\n  "scenes":[\n'+scenes.map(s=>"    "+JSON.stringify(s)).join(",\n")+'\n  ]\n}\n');
let yarn='Ryo Hazuki: Charlie and the Mad Angels are leaving on bikes. Follow them through the harbor. #speaker:AKIR\n-> Chase the bikers\n    <<jump Beat01>>\n-> Leave it for now\n    <<jump Done>>\n';
for(let i=0;i<buttons.length;i++){
  const scene=scenes[i],challenge=`${group}.${buttons[i].toLowerCase()}`;
  yarn+=`===\ntitle: Beat${String(i+1).padStart(2,"0")}\n---\n<<play_sequence "${scene.id}.start">>\n<<start_challenge "${challenge}">>\n<<if challenge_result("${challenge}") != "success">>\n<<play_sequence "${scene.id}.finish">>\nRyo Hazuki: I lost them. Try the chase again? #speaker:AKIR\n-> Try again\n    <<jump Beat01>>\n-> Leave it for now\n    <<jump Done>>\n<<else>>\n`;
  yarn+=i<buttons.length-1?`<<jump Beat${String(i+2).padStart(2,"0")}>>\n`:`<<play_sequence "${scene.id}.finish">>\n<<travel_story "{{destination}}">>\n{{effects}}\n<<jump Done>>\n`;
  yarn+='<<endif>>\n';
}
yarn+='===\ntitle: Done\n---\n<<complete>>\n';
fs.writeFileSync(path.join(import.meta.dirname,"story-harbor-biker-chase.yarn"),yarn);
const registry=path.join(server,"internal/scriptcontent/commands.v1.json");let text=fs.readFileSync(registry,"utf8");
text=text.split("\n").filter(line=>!line.includes('"kind":"sequence"')||(!line.includes(prefix)&&!line.includes('"identifier":"s1.mfsy.biker-thugs.'))).join("\n");
const capabilities=scenes.flatMap(s=>["start","finish"].map(part=>({kind:"sequence",identifier:`${s.id}.${part}`,description:`Authored harbor biker staging ${part}; presentation only.`})));
text=text.replace('"capabilities": [','"capabilities": [\n'+capabilities.map(c=>"    "+JSON.stringify(c)+",").join("\n"));JSON.parse(text);fs.writeFileSync(registry,text);
console.log(`Generated ${buttons.length} moving biker chase beats and ordinary Yarn; five-fighter staging is not a victory.`);
