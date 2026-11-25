// Stage the Disc 2 MFSY bento delivery called by Hisaka's report.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseDTPK} from "../lib/dtpk.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
import {evaluateAuthCamera} from "../../src/AuthCamera.js";
import {afsMembers} from "../lib/NativeAseqAudioPack.mjs";
import {curveTrack} from "../lib/AuthoredChase.mjs";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
const root = path.resolve(import.meta.dirname, "../..");
const disc = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const generatedBy = "tools/scripting/build_hisaka_lunch_staging.mjs";
const prefix = "play/assets/harbor/hisaka-lunch";
const group = "s1.mfsy.hisaka-lunch";
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
  if (sha256(bytes)!==hash) throw Error("Changed E1061 source " + filename);
  return bytes;
}
const mapPath = "MFSY/MAPINFO.BIN";
const map = source(mapPath,"53ccad493265183650bb00aae9189be66bd2564808dfc96483dcf1944f39d988");
const packageBytes = source("MFSY/BENTO.PKS","3604d639268a3288cb1ff2d3bb8303ba0ed0b4d843655de524d7bc7f3bada298");
const textureBytes = source("MFSY/BENTO.PKF","d80443b81b7cbbe399fa1adc2c46447d63eaae0b97f275e4e32ad8518d1c9af5");
const members = new Map(parseIpacActivityArchive(packageBytes).members.map(m=>[m.name,m.bytes]));
const chrt = parseIpacActivityArchive(textureBytes).members.find(m=>m.name==="CHARA.CHRT").bytes;
const bindings = parseChrtSceneObjectBindings(chrt);
const texPath = asset("BENTO_textures.bin",Buffer.concat(extractNativeTexnPack(textureBytes,"BENTO").entries.map(e=>e.bytes)));
const models = new Map([...new Set(bindings.map(b=>b.model))].map(model=>{
  const filename=model+".CHRM";
  return [model,{model,browserFilename:filename,assetPath:asset(filename,members.get(filename)),textureAssetPath:texPath}];
}));
const props = Object.fromEntries(bindings.map(b=>[b.actorTag,models.get(b.model)]));
const motionBankPath = asset("M_BENT.MOTN",members.get("M_BENT.MOTN"));
const bank = MotnLoader.parse(members.get("M_BENT.MOTN"));
const hisaka = JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/hisaka-stand/manifest.json"))).packageActors.HISA;
const cast = {HISA:hisaka};
for (const [tag,label] of [["KEBA","Guard"],["KEBC","Guard"],["KEBD","Guard"]]) {
  cast[tag]={...props[tag],label,modelCode:props[tag].model,characterScale:1,assetFormat:"MT5"};
}
// The mono SPSD payload is Yamaha 4-bit ADPCM, two samples per byte.
const voiceSource=source("STREAM/E1061.AFS","f73cb4156b68c447d17e91f1c98ad719c35089b1b70f022f7da6ad75d678ae42");
const lengths = {};
for (const m of afsMembers(voiceSource,"E1061").filter(m=>/\.str$/i.test(m.name))) {
  if (m.bytes.toString("ascii",0,4)!=="SPSD" || m.bytes.readUInt32LE(12)+64!==m.bytes.length)
    throw Error("Changed original E1061 sound format "+m.name);
  lengths[m.name.toUpperCase().slice(5,9)]=Math.ceil(30*m.bytes.readUInt32LE(12)*2/14000);
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ny-hisaka-lunch-"));
const contactAsset="public/audio/world/hisaka-lunch/BENTOTABLE.wav";
let cameras;
try {
  // Hisaka's report restores f1yokosu.snd at 0x26a88 before calling BENTO.
  // The two hand contacts request the same A905 track, 0x1c, at 0x6a59e/0x6a636.
  const sound=source("SOUND/F1YOKOSU.SND","909ab958302a9acabe9fee3e562a7a6d1f0f7af477ae1525b94d7e76beafbeaf");
  const parsed=parseDTPK(sound);
  const command=parsed.groups.find(g=>g.descriptorHex==="a905").tracks[28];
  const entry=command.entries[0],sample=parsed.samples[entry.sampleId];
  if(command.commandHex!=="a9051c00" || !command.playable || command.entries.length!==1
      || sample.sampleId!==22 || sample.format!=="yamaha-aica-adpcm" || sample.channels!==1)
    throw Error("Unexpected native bento contact track");
  const raw=path.join(tmp,"contact.bin");
  fs.writeFileSync(raw,sound.subarray(sample.dataOffset,sample.dataOffset+sample.byteLength));
  fs.writeFileSync(raw+".txth","codec = AICA\nchannels = 1\nsample_rate = "+entry.sampleRate+"\nnum_samples = data_size\n");
  fs.mkdirSync(path.join(root,path.dirname(contactAsset)),{recursive:true});
  execFileSync(process.env.VGMSTREAM_CLI||"vgmstream-cli",["-i","-o",path.join(root,contactAsset),raw],{stdio:"pipe"});
  assets.push(contactAsset);
  const catalogFile=path.join(tmp,"cameras.json");
  const numbers=[400,401,402,403,404,405,406,407,408,409,410,420,421,422,423];
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(disc,mapPath),"--out",catalogFile,
    ...numbers.flatMap(n=>["--camera",String(n)])],{cwd:root,stdio:"pipe"});
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
const vector=(bytes,offset,read="readFloatLE")=>[0,1,2].map(i=>bytes[read](offset+4*i));
const roomPos=vector(chrt,540);
const roomAnchor=pose(roomPos[0],roomPos[2],0,roomPos[1]);
const originalPlacements=JSON.parse(fs.readFileSync(path.join(root,"play/data/mfsy-runtime-placements.json")));
const stand=originalPlacements.placements.find(p=>p.runtime?.objectTag==="FOOD");
// Captured runtime placements are in browser coordinates. ECAM consumes native X and yaw.
const food=pose(-stand.position[0],stand.position[2],-stand.rotationDegrees[1],stand.position[1]);
const furniture={};
for(const [tag,position,rotationDegrees] of [
  ["GROM",roomPos,[0,0,0]],["ISU_",vector(chrt,636),[0,chrt.readFloatLE(656),0]],
  ["MAGZ",vector(chrt,732),vector(chrt,752)],["WHIT",vector(chrt,852),[0,chrt.readFloatLE(872),0]],
]) {
  furniture[tag]={...props[tag],lifecycle:{kind:"room-script-persistent"},initialPresentation:{position,rotationDegrees,scale:[1,1,1]}};
}
const bagMarks={
  BNT1:{control:18,offset:0x99140,release:155,position:[-129.47321,1.3365,-9.3823],rotationRaw:[0,0,0]},
  BNT2:{control:12,offset:0x99158,release:236,position:[-128.541,1.3452,-9.2765],rotationRaw:[32768,Math.round(281.89999*65536/360),32768]},
};
function bags(id,state) {
  return Object.fromEntries(Object.entries(bagMarks).map(([tag,mark])=>{
    const attachments=[],worldTransforms=[];
    const bind=(frame,offset)=>({activityId:id,frame,parentActorTag:"AKIR",controlId:mark.control,
      translation:vector(map,offset),rotationRaw:vector(map,offset+12,"readUInt32LE")});
    if(state!=="table") attachments.push(bind(0,mark.offset));
    if(state==="handover"){
      if(tag==="BNT1") attachments.push(bind(2,0x99170));
      attachments.push({activityId:id,frame:mark.release,action:"detach"});
    }
    if(state!=="held") worldTransforms.push({activityId:id,frame:state==="table"?0:mark.release,
      position:mark.position,rotationRaw:mark.rotationRaw});
    return [tag,{...props[tag],attachments,worldTransforms}];
  }));
}
function clip(index,loop=false) {
  const selection=bank.sequences[index];
  if(!selection?.valueData?.complete) throw Error("Missing original BENTO motion "+index);
  return {bank:"hisakaLunch",name:selection.name,loop};
}
const standMotion={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
const actor=(tag,pose,motion,extra={})=>({tag,pose,motion,...extra});
const track=(samples)=>curveTrack(samples.map(([frame,value])=>({time:frame/30,value})));
const rStart=pose(-123.74,-10.63499,90),rStop=pose(map.readFloatLE(0x99040),map.readFloatLE(0x99044),90);
const rTable={...rStop,rotationY:158.75999};
const seated=actor("KEBA",pose(-128.05101,-8.6419,267,.861),clip(5,true));
const guards=(frames)=>{
  return [["KEBC",-11.505,0x99064,16],["KEBD",-12.685,0x99078,13]].map(([tag,z,waypoint,index])=>{
    const p=pose(-123.59,z,90),q=pose(map.readFloatLE(waypoint+4),map.readFloatLE(waypoint+8),90);
    const walkingFrames=Math.ceil(Math.hypot(q.x-p.x,q.z-p.z)/.035);
    const end=frames<walkingFrames?{...p,x:p.x+(q.x-p.x)*frames/walkingFrames,z:p.z+(q.z-p.z)*frames/walkingFrames}:q;
    const samples=frames>walkingFrames?[[0,p],[walkingFrames,q],[frames,q]]:[[0,p],[frames,end]];
    return actor(tag,p,clip(index,true),{movement:track(samples)});
  });
};
const scenes=[];
function stage(key,frames,actors,cuts,{bagState,blocking=false,room=true}={}) {
  const id=group+"."+key;
  const packageActors=Object.fromEntries(actors.filter(a=>a.tag!=="AKIR").map(a=>[a.tag,cast[a.tag]]));
  const actorDefinitions=Object.entries(packageActors).map(([actorCode,body])=>({actorCode,...body,activityOnly:true}));
  scenes.push({id,area:"MFSY",worldId:"mfsy",continuationGroup:group,continuesPrevious:false,
    durationSeconds:frames/30,waitForMotionCompletion:blocking,...(!blocking?{playThroughFinish:true}:{}),
    isolateScheduledActors:true,packageActors,actorDefinitions,actors,
    camera:shot(cuts[0][1],0,cuts[0][2]),cameraTrack:cameraTrack(cuts,frames),
    ...(room?{sceneObjects:furniture}:{}),...(bagState?{attachedObjects:bags(id,bagState)}:{}),
    provenance:"Disc 2 MFSY 0x6867c / 0x6900c, BENTO CHRT/MOTN, E1061 and native ECAM. Dialogue cuts use the original sound lengths to adapt the native coroutines to Story playback."});
}
// The native approach moves .035 units per tick while the two wrists hold different bags.
const arrival=Math.ceil(Math.hypot(rStop.x-rStart.x,rStop.z-rStart.z)/.035);
stage("approach",arrival,[actor("AKIR",rStart,clip(0,true),{baseMotion:{bank:"free",name:"AKI_AKI_WALK_LP",loop:true,movement:true},movement:track([[0,rStart],[arrival,rStop]])}),seated],[[0,400]],{bagState:"held",blocking:true});
// Voice boundaries are estimated from the original 14 kHz mono streams. The
// four dialogue stages remain open while the player reads or advances lines.
function lineTiming(ids){
  let frame=0;
  const starts=ids.map(id=>{
    const start=frame;
    if(!Number.isFinite(lengths[id]))throw Error("Missing E1061 line "+id);
    frame+=lengths[id]+6;
    return start;
  });
  return {starts,frames:frame};
}
const delivery=lineTiming(["A001","B001","A002","B002","A003"]);
stage("delivery",delivery.frames,
  [actor("AKIR",rStop,clip(0,true),{baseMotion:{bank:"free",name:"AKI_AKI_STAND_DOWN_LP",loop:true},movement:track([[0,rStop],[delivery.starts[3]-1,rStop],[delivery.starts[3],rTable],[delivery.frames,rTable]])}),seated],
  [[0,401],[delivery.starts[1],402,roomAnchor],[delivery.starts[2],403,roomAnchor],[delivery.starts[3],404]],{bagState:"held"});
// The native worker releases BNT1 on frame 0x9b and BNT2 on 0xec.
// Its camera cuts are 100/265. The owner switches to 407 after 290+100 ticks.
stage("handover",510,[actor("AKIR",rTable,clip(4),{endMotion:standMotion}),seated],
  [[0,404],[100,405],[265,406],[390,407]],{bagState:"handover",blocking:true});
scenes.at(-1).soundCues=[150,230].map(frame=>({asset:contactAsset,atSeconds:frame/30}));
const hear=lineTiming(["C001","D001","C002","C003"]);
const walkers=guards(hear.frames);
stage("overhear",hear.frames,[actor("AKIR",rTable,standMotion),seated,...walkers],[[0,408,roomAnchor],[hear.starts[3],409,roomAnchor]],{bagState:"table"});
const leave=lineTiming(["B003","A004","A005"]);
stage("leave",leave.frames,[actor("AKIR",rTable,standMotion),seated],
  [[0,409,roomAnchor],[leave.starts[2],410]],{bagState:"table"});
const report=lineTiming(["A006","E001","A007","E002","E003","A008"]);
stage("return",report.frames,[actor("AKIR",pose(0,101.8,229.99001),{bank:"free",name:"AKI_AKI_TATI_IWA_L",loop:true}),actor("HISA",pose(1.28,103.3,50),clip(6,true))],
  [[0,420,food],[report.starts[1],423,food],[report.starts[2],422,food],[report.starts[4],421,food]],{room:false});
const generated="play/data/story-hisaka-lunch.generated.json";
fs.writeFileSync(path.join(root,generated),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{hisakaLunch:motionBankPath},scenes},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...assets],{cwd:root,stdio:"inherit"});
console.log("Built "+scenes.length+" E1061 stages using original BENTO models, wrists, motions, and ECAM shots.");
