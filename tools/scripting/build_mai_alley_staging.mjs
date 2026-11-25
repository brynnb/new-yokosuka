// Build the original E1036 actors, shots, prop bindings and QTE continuations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {MotnLoader} from "../../src/MotnLoader.js";
import {evaluateAuthCamera} from "../../src/AuthCamera.js";
import {afsMembers} from "../lib/NativeAseqAudioPack.mjs";
import {parseNativeSrfRecords} from "../../src/NativeLipSync.js";
import {curveTrack} from "../lib/AuthoredChase.mjs";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
const root = path.resolve(import.meta.dirname, "../..");
const disc = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const generatedBy = "tools/scripting/build_mai_alley_staging.mjs";
const prefix = "play/assets/harbor/mai-alley";
const group = "s1.mfsy.mai-alley";
const assets = [];
function asset(filename, bytes) {
  const dest = prefix + "/" + filename;
  fs.mkdirSync(path.join(root,prefix),{recursive:true});
  fs.writeFileSync(path.join(root,dest),bytes);
  assets.push(dest);
  return dest;
}
function source(filename,hash) {
  const bytes = fs.readFileSync(path.join(disc,filename));
  if (sha256(bytes)!==hash) throw Error("Changed E1036 source " + filename);
  return bytes;
}
const mapPath = "MFSY/MAPINFO.BIN";
const map = source(mapPath,"53ccad493265183650bb00aae9189be66bd2564808dfc96483dcf1944f39d988");
const packageBytes = source("MFSY/MSQB.PKS","aa75f92d72a074bdddc179995ba466596df315a51de64d6c7f431f2f21670a6a");
const textureBytes = source("MFSY/MSQB.PKF","36e7430279e2a05855e4ae15c0482d2192c7b3d4502ddbc44ef16b03a54f9a60");
const members = parseIpacActivityArchive(packageBytes).members;
const member = name => {
  const result = members.find(m=>m.name===name);
  if (!result) throw Error("Missing original MSQB " + name);
  return result.bytes;
};
const bank = MotnLoader.parse(member("M_MSQB.MOTN"));
const motionBankPath = asset("M_MSQB.MOTN",member("M_MSQB.MOTN"));
const bindings = parseChrtSceneObjectBindings(parseIpacActivityArchive(textureBytes).members.find(m=>m.name==="CHARA.CHRT").bytes);
const texPath = asset("MSQB_textures.bin",Buffer.concat(extractNativeTexnPack(textureBytes,"MSQB").entries.map(e=>e.bytes)));
const props = Object.fromEntries([["SORI","BUKS701G"],["KAKU","MKZ0201G"]].map(([tag,model])=>{
  if (bindings.find(b=>b.actorTag===tag)?.model!==model) throw Error("Changed original prop "+tag);
  const filename = model+".CHRM";
  return [tag,{browserFilename:filename,assetPath:asset(filename,member(filename)),textureAssetPath:texPath}];
}));
const h = JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/hisaka-stand/manifest.json")));
const tags = ["AKIR","HINA","ISYM","NMNO"];
const cast = Object.fromEntries(tags.slice(1).map(tag=>[tag,h.packageActors[tag]]));
const definitions = Object.entries(cast).map(([actorCode,{label,modelCode}])=>({actorCode,label,modelCode,activityOnly:true}));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),"ny-mai-cameras-"));
let cameras;
const nonverbal = {};
try {
  const bank = afsMembers(source("STREAM/E1036.AFS","fbaa25c6345c95d40c6d64ad2bd077b7ca72c5c60fc966afc85f4ca0a8986aaf"), "E1036");
  const speech = bank.filter(m=>/\.str$/i.test(m.name));
  const lines = parseNativeSrfRecords(bank.find(m=>/\.srf$/i.test(m.name)).bytes);
  if (!process.env.VGMSTREAM_CLI || speech.length!==lines.length) throw Error("E1036 requires original speech records and VGMSTREAM_CLI");
  for (const id of ["E1036A008","E1036A009","E1036D004"]) {
    const index = speech.findIndex(m=>m.name.toUpperCase()===id+".STR");
    if (index<0 || lines[index].displayText.trim()) throw Error("Unexpected nonverbal record "+id);
    const input=path.join(tmp,id+".str"), dest="public/audio/world/mai-alley/"+id+".wav";
    fs.mkdirSync(path.dirname(path.join(root,dest)),{recursive:true});
    fs.writeFileSync(input,speech[index].bytes);
    execFileSync(process.env.VGMSTREAM_CLI,["-i","-o",path.join(root,dest),input],{stdio:"pipe"});
    const wave=fs.readFileSync(path.join(root,dest));
    if (wave.toString("ascii",0,4)!=="RIFF" || wave.toString("ascii",8,12)!=="WAVE") throw Error("Invalid "+id);
    nonverbal[id]=dest;
    assets.push(dest);
  }
  const catalogFile = path.join(tmp,"cameras.json");
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(disc,mapPath),"--out",catalogFile,
    ...Array.from({length:41},(_,i)=>["--camera",String(8000+i)]).flat()],{cwd:root,stdio:"pipe"});
  cameras = new Map(JSON.parse(fs.readFileSync(catalogFile)).records.map(r=>[r.cameraNumber,
    {channels:Object.fromEntries(Object.entries(r.curves).map(([k,v])=>[k,{times:v.times,values:v.values,tangents:v.slopes}]))}]));
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
const pose=(x,z,rotationY,y=0)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
function relative(origin,x,z,rotationY,y=0) {
  const a=origin.rotationY*Math.PI/180;
  return pose(origin.x+Math.cos(a)*x+Math.sin(a)*z,origin.z-Math.sin(a)*x+Math.cos(a)*z,origin.rotationY+rotationY,origin.y+y);
}
function shot(number,t,anchor) {
  const s=evaluateAuthCamera(cameras.get(number),t);
  if (anchor) for (const key of ["position","target"]) {
    const p=relative(anchor,s[key+"X"],s[key+"Z"],0,s[key+"Y"]);
    s[key+"X"]=p.x;s[key+"Y"]=p.y;s[key+"Z"]=p.z;
  }
  return s;
}
function cameraTrack(cuts,durationFrames) {
  const samples=[];
  for(const [i,[frame,id,anchor]] of cuts.entries()) {
    const first=frame/30, last=(cuts[i+1]?.[0] ?? durationFrames)/30 - (cuts[i+1] ? .0001 : 0);
    for(let t=first;t<last;t+=.2) samples.push({time:t,value:shot(id,t-first,anchor)});
    samples.push({time:last,value:shot(id,last-first,anchor)});
  }
  const track=curveTrack(samples);
  for(const c of Object.values(track.channels)) for(let i=1;i<c.times.length;i++)
    if(c.times[i]-c.times[i-1]<.0002) c.tangents[i]=c.tangents[i-1]=0;
  return track;
}
const mapCamera=(id,anchor)=>[0,id,anchor];
const r1=pose(136.1,53.4,160),r2=pose(136.1,53.4,340),r3=pose(136.1,53.4,210);
const mai=pose(135,55.1,325),rena=pose(136.2,56.3,355),yumiko=pose(137.4,55.5,30);
const introPos=[pose(135,53.8,185),pose(134.9,55.1,0),rena,yumiko];
const firstPos=[r1,pose(134.8,56.2,0),relative(r1,-.9,-1,240),yumiko];
const secondPos=[r2,firstPos[1],relative(r2,0,-1.4,180),yumiko];
const finalPos=[r3,firstPos[1],secondPos[2],relative(r3,.17,-1.29,90)];
const intro=[11,52,28,44], first=[13,52,26,44], second=[14,52,27,44], last=[15,52,18,43];
const scenes=[];
const motion=(index,loop=false)=>{
  const clip=bank.sequences[index];
  if (!clip?.valueData?.complete) throw Error("Missing original MSQB motion "+index);
  return {bank:"maiAlley",name:clip.name,loop};
};
function scene(key,positions,motions,cuts,frames,{starts={},loops=[],blocking=false,pipe,razor=true,movement={},cue}={}) {
  const id=group+"."+key;
  const attach=(tag,actor,translation,rotationRaw)=>({...props[tag],attachments:[{activityId:id,frame:0,parentActorTag:actor,controlId:18,translation,rotationRaw}]});
  const attachedObjects={};
  if(razor) attachedObjects.SORI=attach("SORI","ISYM",[.081,.054,-.036],[0,28763,12906]);
  if(pipe==="NMNO") attachedObjects.KAKU=attach("KAKU","NMNO",[.034,.015,-.041],[0,28763,12906]);
  if(pipe==="AKIR") attachedObjects.KAKU=attach("KAKU","AKIR",[-.011,-.089,.186],[0,43326,7736]);
  scenes.push({id,area:"MFSY",worldId:"mfsy",continuationGroup:group,continuesPrevious:false,durationSeconds:frames/30,waitForMotionCompletion:blocking,
    ...(!blocking && !key.endsWith("-prompt") ? {playThroughFinish:true} : {}),
    actorDefinitions:definitions,packageActors:cast,isolateScheduledActors:true,actors:tags.map((tag,i)=>({tag,pose:positions[i],motion:motion(motions[i],loops.includes(i)),
      ...(starts[i]?{motionStartSeconds:starts[i]/30}:{}),...(movement[i]?{movement:curveTrack(movement[i])}:{})})),
    camera:shot(cuts[0][1],0,cuts[0][2]),cameraTrack:cameraTrack(cuts,frames),attachedObjects,
    ...(cue?{voiceCue:cue}:{}),provenance:"Disc 2 MFSY E1036, MSQB paired motions and native ECAM shots. Compact cuts adapt the native coroutines to Story dialogue and input. MAPINFO and record sources are in tools/evidence/hisaka-harbor-native.json."});
}
// Native paired command cases 1–30 in 0x7b8ec consume the 12-word records at 0x99fac.
scene("intro",introPos,intro,[[0,8000],[60,8001],[150,8036],[280,8002],[340,8003]],430,{loops:[1,2,3]});
scene("first-prompt",firstPos,first,[mapCamera(8005,r1)],24,{loops:[1,3]});
scene("first-pass",firstPos,first,[mapCamera(8006)],90,{starts:{0:24,2:24},loops:[1,3]});
scene("first-miss",firstPos,[5,46,19,44],[mapCamera(8033)],90,{loops:[3],blocking:true});
scene("second-prompt",secondPos,second,[mapCamera(8007)],24,{starts:{0:12,2:12},loops:[1,3]});
scene("second-miss",secondPos,[6,46,20,44],[[0,8015],[45,8017]],74,{loops:[3]});
scene("second-retry-prompt",secondPos,second,[mapCamera(8017)],24,{starts:{0:12,2:12},loops:[1,3]});
scene("second-pass",secondPos,[14,47,27,39],[mapCamera(8007)],100,{starts:{0:36,2:36},loops:[3]});
scene("final-prompt",finalPos,last,[mapCamera(8008,r3)],24,{pipe:"NMNO",loops:[1,2]});
scene("final-miss",finalPos,[1,46,18,31],[[0,8022],[30,8025]],80,{pipe:"NMNO",blocking:true,loops:[2]});
scene("final-retry-prompt",finalPos,last,[mapCamera(8025)],24,{pipe:"NMNO",loops:[1,2]});
scene("final-retry-miss",finalPos,[2,46,18,32],[[0,8034],[30,8026]],50,{pipe:"NMNO",blocking:true,loops:[2]});
scene("final-last-prompt",finalPos,last,[mapCamera(8026)],24,{pipe:"NMNO",loops:[1,2]});
scene("win",finalPos,[15,48,18,43],[[0,8009],[235,8010,pose(136.71,52.81,230)]],363,{pipe:"NMNO",loops:[2]});
scene("win-conversation",[pose(135.38,54.55,145),mai,secondPos[2],finalPos[3]],[12,45,25,42],[[0,8011],[148,8012],[300,8014]],375,{pipe:"AKIR",loops:[0,1,2,3]});
scene("lose-razor",secondPos,[9,46,24,38],[[0,8016],[70,8020],[165,8018]],360);
scene("lose",finalPos,[7,16,22,34],[[0,8035],[45,8023]],390,{pipe:"NMNO"});
const byKey = key => scenes.find(s=>s.id===group+"."+key);
function changeMotion(key, tag, changes) {
  byKey(key).actors.find(actor=>actor.tag===tag).motionCues=changes.map(([frame,index,loop=false,start=0])=>
    ({atSeconds:frame/30,motion:motion(index,loop),...(start?{startSeconds:start/30}:{})}));
}
function cutPose(key, tag, frame, next) {
  const scene=byKey(key), actor=scene.actors.find(a=>a.tag===tag), before=actor.pose;
  const keys=[{time:0,value:before},{time:frame/30-.0001,value:before},{time:frame/30,value:next},{time:scene.durationSeconds,value:next}];
  actor.movement=curveTrack(keys);
  for(const c of Object.values(actor.movement.channels)) c.tangents.fill(0);
}
changeMotion("intro","HINA",[[45,50],[105,52,true]]);
cutPose("intro","AKIR",280,r1);
byKey("first-prompt").actors[0].motionStartSeconds=10/30;
byKey("first-prompt").actors[2].motionStartSeconds=10/30;
changeMotion("first-miss","HINA",[[10,46]]);
changeMotion("second-miss","HINA",[[10,46]]);
cutPose("second-miss","ISYM",45,relative(r2,-.1,-1.1,180));
cutPose("second-miss","HINA",45,pose(firstPos[1].x,firstPos[1].z,270));
for(const key of ["final-miss","final-retry-miss"]) changeMotion(key,"HINA",[[30,46]]);
for(const key of ["final-prompt","final-retry-prompt","final-last-prompt"]) {
  for(const index of [0,3]) byKey(key).actors[index].motionStartSeconds=30/30;
}
changeMotion("win","HINA",[[150,48]]);
changeMotion("win","NMNO",[[300,42,true]]);
cutPose("win","AKIR",235,pose(136.71,52.81,230));
cutPose("win","HINA",235,mai);
byKey("win").cameraTrack=cameraTrack([[0,8008,r3],[10,8009],[235,8010,pose(136.71,52.81,230)]],363);
byKey("win").camera=shot(8008,0,r3);
changeMotion("lose-razor","ISYM",[[35,23],[165,21,false,45]]);
changeMotion("lose-razor","AKIR",[[15,9,false,25],[45,9,false,55],[165,8,true]]);
changeMotion("lose","AKIR",[[95,7]]);
changeMotion("lose","ISYM",[[95,22]]);
const sound = (id, frame) => ({asset:nonverbal["E1036"+id],atSeconds:frame/30});
byKey("second-miss").soundCues = [sound("A008",25)];
byKey("win").soundCues = [sound("D004",180)];
byKey("lose-razor").soundCues = [sound("A009",15),sound("A008",85)];
const generated="play/data/story-mai-alley.generated.json";
fs.writeFileSync(path.join(root,generated),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{maiAlley:motionBankPath},scenes},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...assets],{cwd:root,stdio:"inherit"});
console.log("Built "+scenes.length+" E1036 stages, "+bank.sequences.length+" native clips and "+assets.length+" runtime files.");
