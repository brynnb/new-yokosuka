// Compile the MK80 room's two scroll readings from its native timed callbacks.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {MotnLoader} from "../../src/MotnLoader.js";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const directory=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02/MK80");
const prefix="play/assets/harbor/warehouse-scrolls";
const generatedBy="tools/scripting/build_warehouse_scroll_staging.mjs";
const outputs=[];
function read(name,digest) {
  const bytes=fs.readFileSync(path.join(directory,name));
  if(sha256(bytes)!==digest)throw Error("Changed MK80 source "+name);
  return bytes;
}
function asset(name,bytes) {
  const file=prefix+"/"+name;
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),bytes);
  outputs.push({path:file,byteLength:bytes.length,sha256:sha256(bytes)});
  return file;
}
const map=read("MAPINFO.BIN","a7199bfad279dc3737acb90bfc9bd7579f674fc5257a747b4e0fc402e612ba59");
const bankBytes=read("M_MK80.BIN","25960758af2078ac26fe6736b5f34bf12149c59a35a0ff6a4dfb23579733d897");
const bank=MotnLoader.parse(bankBytes);
if(bank.sequences.length!==4||bank.sequences.some(s=>!s.valueData.complete))throw Error("Incomplete MK80 motion bank");
const motionPath=asset("M_MK80.BIN",bankBytes);
const models={};
for(const [model,digest] of Object.entries({
  MAP:"73ff4e8824cafaefeba6b7d1a23d7969b5095c1085fb609c81303f1ecc2fd83f",
  MKCS304G:"c1fece44a7096608945b5959e8ca4a7ecc804eeb54819e85cccc5ee267466177",
  MKIS303G:"f9505b1b8264302835a3c9e04fe5b7cf031213dc2fc3cc92e5d5597be1dc8692",
  MKIS304G:"3da1f9a9e82a9259c30973654697e9b7c474f7e300ff61b50072b641018b4b87",
  MKIS3C3G:"3156951689ab8cc3ddf5f7560bc4c47495c195fa22fec98c3977825ba581cfef",
})) {
  const bytes=read(model+".MT5",digest);
  models[model]={model,browserFilename:model+".MT5",assetPath:asset(model+".MT5",bytes),
    textureAssetPath:asset(model+"_textures.bin",Buffer.concat(extractNativeTexnPack(bytes,model).entries.map(entry=>entry.bytes)))};
}
const bindings=parseChrtSceneObjectBindings(map.subarray(map.indexOf("CHRS")));
const stage={...models.MAP,lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[0,0,0],rotationDegrees:[0,0,0],scale:[1,1,1]}};
const cast={KISY:{label:"Gui Zhang",modelCode:"KIS_M",browserFilename:"KIS_M.CHRM",assetFormat:"MT5",characterScale:1,
  assetPath:"play/assets/harbor/master-chen/KIS_M.CHRM",textureAssetPath:"play/assets/harbor/master-chen/textures.bin"}};
const dataBase=8+map.readUInt32LE(0x18);
function immediate(address,reg) {
  const op=map.readUInt16LE(address);
  if((op>>8&15)!==reg)throw Error("Changed MK80 register at "+address.toString(16));
  if(op>>12===14)return (op<<24)>>24;
  if(op>>12!==13)throw Error("Expected MK80 immediate at "+address.toString(16));
  return map.readUInt32LE(((address+4)&~3)+(op&255)*4);
}
function callback(call,target) {
  if(map.readUInt16LE(call)!==0x0103 || ((call+4+immediate(call-2,1))>>>0)!==target)
    throw Error("Changed MK80 callback "+call.toString(16));
}
const specs=[
  {id:"poetry-reading",archive:"SA1109",motion:0,startFrame:0,duration:2602,relative:[-2.6861,-2.5717],
    cameraCalls:Array.from({length:13},(_,i)=>0x4a0c+i*24),
    voiceCalls:[...Array.from({length:16},(_,i)=>0x4b40+i*20),...Array.from({length:7},(_,i)=>0x4e1c+i*20)],
    props:[["MKC4",832,868,[160,272,1787,2485]],["MKC5",844,880,[272,415,1661,1787]],["MKI4",856,892,[415,1661]]]},
  {id:"stab-armor-reading",archive:"SA1108",motion:1,startFrame:80,duration:1730,relative:[-2.6209,-2.5195],
    cameraCalls:[0x37b0,0x37c8,0x37e0,0x37f8,0x3810,0x3828,0x3944,0x395c],
    voiceCalls:Array.from({length:14},(_,i)=>0x3970+i*20),
    props:[["WBK1",544,580,[160,283,1416,1612]],["WBK2",556,592,[283,376,1360,1416]],["WBK3",568,604,[376,1360]]]},
];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ny-mk80-camera-"));
let cameras;
try {
  const out=path.join(temp,"cameras.json");
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(directory,"MAPINFO.BIN"),"--out",out],{cwd:root,stdio:"pipe"});
  cameras=new Map(JSON.parse(fs.readFileSync(out)).records.map(r=>[r.cameraNumber,r]));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
function camerasFor(spec) {
  const shots=spec.cameraCalls.map(call=>{
    callback(call,0x2062);
    return {frame:Math.max(0,immediate(call-18,4)),cameraNumber:immediate(call-12,7)};
  });
  return {shots,...composeEventCameraShots(cameras,shots,spec.duration)};
}
const pose=(x,z,rotationY)=>({x,y:0,z,rotationX:0,rotationY,rotationZ:0});
const guizhang=pose(-17.3267,-9.9925,60);
const angle=guizhang.rotationY*Math.PI/180;
const scenes=specs.map(spec=>{
  const id="s1.ms08."+spec.id;
  const first=spec.relative;
  const ryo=pose(guizhang.x+Math.cos(angle)*first[0]+Math.sin(angle)*first[1],guizhang.z-Math.sin(angle)*first[0]+Math.cos(angle)*first[1],guizhang.rotationY+225);
  const {shots,cameraTrack,camera}=camerasFor(spec);
  const dialogueCues=spec.voiceCalls.map(call=>{
    callback(call,0x580);
    const pointer=dataBase+immediate(call-10,1);
    const voiceId=map.toString("ascii",pointer,pointer+10);
    if(!voiceId.startsWith(spec.archive)||map[pointer+10]!==0)throw Error("Changed MK80 voice pointer "+call.toString(16));
    return {voiceId,atSeconds:immediate(call-14,4)/30};
  });
  const actors=["AKIR","KISY"].map((tag,i)=>({tag,pose:i?guizhang:ryo,
    motion:{bank:"warehouseScrolls",name:bank.sequences[spec.motion+i*2].name,loop:false},motionStartSeconds:spec.startFrame/30}));
  const attachedObjects=Object.fromEntries(spec.props.map(([tag,xyz,angles,frames],i)=>{
    const model=bindings.find(row=>row.actorTag===tag)?.model;
    if(!models[model])throw Error("Missing MK80 CHRS prop "+tag);
    return [tag,{...models[model],attachments:[{activityId:id,frame:0,parentActorTag:i?"KISY":"AKIR",controlId:i?12:18,
      translation:[0,4,8].map(d=>map.readFloatLE(dataBase+xyz+d)),rotationRaw:[0,4,8].map(d=>map.readUInt32LE(dataBase+angles+d))}],
      presentation:[{activityId:id,frame:0,visible:false},...frames.map((frame,i)=>({activityId:id,frame,visible:i%2===0}))]}];
  }));
  return {id,area:"MS08",worldId:"ms08",durationSeconds:spec.duration/30,waitForMotionCompletion:false,playThroughFinish:true,
    actorDefinitions:[{actorCode:"KISY",...cast.KISY,activityOnly:true}],packageActors:cast,actors,attachedObjects,sceneObjects:{STAG:stage},
    isolateResidentWorld:true,isolateScheduledActors:true,camera,cameraTrack,nativeCameraCuts:shots,dialogueCues,
    provenance:"Disc 2 MK80 MAPINFO timed speech, camera splines, hand attachments and scroll visibility, original paired M_MK80 motions and original MAP.MT5 room. Custom hand shapes, incidental effects and the native fades are unresolved."};
});
const manifest=prefix+"/manifest.json";
fs.writeFileSync(path.join(root,manifest),JSON.stringify({schema:"warehouse-scroll-native-assets-v1",generatedBy,mapSha256:sha256(map),outputs},null,2)+"\n");
fs.writeFileSync(path.join(root,"play/data/story-warehouse-scrolls.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{warehouseScrolls:motionPath},scenes},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifest,...outputs.map(a=>a.path)],{cwd:root,stdio:"pipe"});
console.log("Generated MK80 readings",scenes.map(s=>[s.id,s.nativeCameraCuts.length,s.dialogueCues.length]));
