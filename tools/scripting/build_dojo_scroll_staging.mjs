// JHD0's frame-dispatch loop reads AKIR's motion tick for the wall scroll.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";
import {curveTrack} from "../lib/AuthoredChase.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root=path.resolve(import.meta.dirname,"../..");
const directory=path.join(process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files"),"data/SCENE/01/JHD0");
const prefix="play/assets/hazuki/dojo-scroll",generatedBy="tools/scripting/build_dojo_scroll_staging.mjs",outputs=[];
function source(name,digest){
  const bytes=fs.readFileSync(path.join(directory,name));
  if(sha256(bytes)!==digest)throw Error("Changed JHD0 scroll source "+name);
  return bytes;
}
function asset(name,bytes){
  const file=prefix+"/"+name;
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),bytes);
  outputs.push({path:file,byteLength:bytes.length,sha256:sha256(bytes)});
  return file;
}
const map=source("MAPINFO.BIN","e3987fabdb4f66562d8274c26ee4e219a3d12046e1d3e3200cacdcf289cea0ca");
const archive=source("JHD0.PKS","e177498dc5c6f58633559828341e8aa5fdaf3e4d44ce1a2d8ff5f2f1cfc4b242");
const textures=source("JHD0.PKF","c21fdd290c499347de672c381aa5b5e9e3a081e8425900739327e58030e37932");
const members=parseIpacActivityArchive(archive).members;
const member=name=>{const m=members.find(m=>m.name===name);if(!m)throw Error("Missing source member "+name);return m.bytes;};
const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(textures).members.find(m=>m.name==="CHARA.CHRT").bytes);
const textureEntries=extractNativeTexnPack(textures,"JHD0.PKF").entries;
const props={};
for(const [tag,textureCount] of [["GART",3],["HAKO",1],["MKCS",4]]){
  const binding=bindings.find(r=>r.actorTag===tag);
  const filename=binding.model+".CHRM",bytes=member(filename);
  const selected=textureEntries.filter(t=>bytes.includes(Buffer.from(t.id,"hex")));
  if(selected.length!==textureCount)throw Error("Missing JHD0 prop texture "+tag);
  props[tag]={model:binding.model,browserFilename:filename,assetPath:asset(filename,bytes),
    textureAssetPath:asset(binding.model+"_textures.bin",Buffer.concat(selected.map(t=>t.bytes)))};
}
const bank=member("M_01137E.MOTN");
const sequence=MotnLoader.parse(bank,{sequenceIndices:[50]}).sequences[0];
if(map.readUInt32LE(0x36e94)!==7001+sequence.index || sequence.name!=="AKI_TORU_MAKIMONO_ETC_DOUJOUTANSAKU_FE_0100" || sequence.durationFrames!==808 || !sequence.valueData.complete)
  throw Error("Changed original JHD0 discovery motion");
const motionPath=asset("M_01137E.MOTN",bank);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ny-scroll-camera-"));
let cameras;
try {
  const out=path.join(temp,"cameras.json");
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(directory,"MAPINFO.BIN"),"--out",out,
    ...Array.from({length:6},(_,i)=>["--camera",String(711+i)]).flat()],{cwd:root,stdio:"pipe"});
  cameras=new Map(JSON.parse(fs.readFileSync(out)).records.map(r=>[r.cameraNumber,r]));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
const cuts=[[0,711],[90,712],[180,713],[240,714],[360,715],[520,716]].map(([frame,cameraNumber])=>({frame,cameraNumber}));
// The start of 713 is a zero-vector blend sentinel. Continue from the
// preceding shot's final transform until the authored close-up is reached.
for(const field of ["positionX","positionY","positionZ","targetX","targetY","targetZ"]){
  const curve=cameras.get(713).curves[field];
  if(curve.values[0]!==0)throw Error("Changed 713 initial camera");
  curve.values[0]=cameras.get(712).curves[field].values.at(-1);
}
const id="s1.jhd0.mysterious-scroll-reveal",duration=sequence.durationFrames;
const frames=(from,read)=>[0,4,8].map(d=>map[read](from+d));
const stand=[map.readFloatLE(0x36e68),map.readFloatLE(0x36e6c),map.readFloatLE(0x36e70)];
const step=[stand[0],map.readFloatLE(0x36e7c),map.readFloatLE(0x36e80)];
const wall=[map.readFloatLE(0x36fb8),map.readFloatLE(0x36fbc),map.readFloatLE(0x36fc0)];
const placements=JSON.parse(fs.readFileSync(path.join(root,"play/data/jhd0-runtime-placements.json")));
const records=Object.values(placements).filter(Array.isArray).flat();
const mkcs=records.find(p=>p.runtime?.objectTag==="MKCS");
if(!mkcs)throw Error("Missing original resident scroll placement");
const scroll=[-mkcs.position[0],mkcs.position[1],mkcs.position[2]];
const physical=(tag,position,rotationDegrees)=>({...props[tag],lifecycle:{kind:"room-script-persistent"},initialPresentation:{position,rotationDegrees,scale:[1,1,1]}});
const pose=(position,rotationY)=>({x:position[0],y:position[1],z:position[2],rotationX:0,rotationY,rotationZ:0});
const closed=pose(wall,180),open={...closed,y:closed.y+.54,z:closed.z-.08};
const plaque=curveTrack([[0,closed],[120,closed],[170,open],[560,open],[645,closed],[duration,closed]].map(([t,value])=>({time:t/30,value})));
for(const c of Object.values(plaque.channels))c.tangents.fill(0);
const scene={id,area:"JHD0",worldId:"exterior",durationSeconds:duration/30,waitForMotionCompletion:false,playThroughFinish:true,
  actorDefinitions:[],isolateScheduledActors:true,actors:[{tag:"AKIR",pose:pose(stand,180),motion:{bank:"dojoScroll",name:sequence.name,loop:false}}],
  objectTransforms:[{object:"GART",visible:false},{object:"MKCS",visible:false}],
  sceneObjects:{GART:physical("GART",wall,[0,180,0]),HAKO:physical("HAKO",step,[0,0,0])},sceneObjectTracks:{GART:plaque},
  attachedObjects:{MKCS:{...props.MKCS,worldTransforms:[{activityId:id,frame:0,lastFrame:349,position:scroll,rotationRaw:[0,0,0]}],
    attachments:[{activityId:id,frame:350,parentActorTag:"AKIR",controlId:18,translation:frames(0x37320,"readFloatLE"),rotationRaw:frames(0x3732c,"readUInt32LE")}],
    presentation:[{activityId:id,frame:0,visible:false},{activityId:id,frame:170,visible:true},{activityId:id,frame:480,visible:false}]}},
  ...composeEventCameraShots(cameras,cuts,duration),nativeCameraCuts:cuts,
  dialogueCues:[{voiceId:"E1011A006",atSeconds:180/30},{voiceId:"E1011A102",atSeconds:390/30}],
  provenance:"Original JHD0 7051 motion, actor and stool positions, six ECAM shots, two E1011 lines, visibility and frame-350 wrist attachment. The preceding box carry is condensed. Plaque travel approximates the original 7055/7056 prop motions."};
const manifest=prefix+"/manifest.json";
fs.writeFileSync(path.join(root,manifest),JSON.stringify({schema:"dojo-scroll-native-assets-v1",generatedBy,mapSha256:sha256(map),outputs},null,2)+"\n");
fs.writeFileSync(path.join(root,"play/data/story-dojo-scroll.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{dojoScroll:motionPath},scenes:[scene]},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifest,...outputs.map(a=>a.path)],{cwd:root,stdio:"pipe"});
console.log("Generated JHD0 discovery",duration,"frames,",cuts.length,"camera cuts.");
