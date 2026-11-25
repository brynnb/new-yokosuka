// JHD0's frame-dispatch loop reads AKIR's motion tick for the wall scroll.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";
import {parseTmnmMotion,sampleTmnmSequence} from "../../src/TmnmMotion.js";
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
const chrt=parseIpacActivityArchive(textures).members.find(m=>m.name==="CHARA.CHRT").bytes;
const bindings=parseChrtSceneObjectBindings(chrt);
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
// The JHD0 owner shifts the plaque slightly away from the wall at frame 90,
// starts clips 7055/7056 at 120/560, resets TMNM at 645, then restores the
// exact resident placement at 646. Each clip drives the sole rigid GART node.
const gart=records.find(record=>record.runtime?.objectTag==="GART");
const resident=[-gart.position[0],gart.position[1],gart.position[2]];
const bankSlots=[54,55], tmnm=parseTmnmMotion(bank,{sequenceIndices:bankSlots});
const [remove,replace]=tmnm.sequences;
if(map.readUInt16LE(0x36f42)!==0xe55a || map.readUInt16LE(0x3703a)!==0xe578
  ||map.readUInt32LE(0x3757c)!==560 || map.readUInt32LE(0x37604)!==645 || map.readUInt32LE(0x376a0)!==646
  ||map.readUInt32LE(0x370a0)!==7001+remove.index || map.readUInt32LE(0x375e0)!==7001+replace.index
  ||remove.name!=="TMN_GART_01" || replace.name!=="TMN_GART_02" || remove.durationFrames!==144 || replace.durationFrames!==85
  ||remove.nodeCount!==1 || replace.nodeCount!==1 || gart.rotationDegrees.join()!=="0,180,0")throw Error("Changed JHD0 plaque placement or TMNM source");
const model=member(props.GART.browserFilename),node=model.readUInt32LE(8);
if(model.readInt16LE(node)!==-1 || [8,12,16,32,36,40,44,48].some(offset=>model.readUInt32LE(node+offset)!==0)
  || [20,24,28].some(offset=>model.readFloatLE(node+offset)!==1))throw Error("Unexpected rigid node bind pose for GART");
const samples=[];
const append=(frame,value)=>samples.push({time:frame/30,value});
const deg=180/Math.PI;
function appendClip(first,clip){
  for(let frame=0;frame<=clip.durationFrames;frame++){
    const [n]=sampleTmnmSequence(tmnm,clip,frame);
    if(n.sx!==1||n.sy!==1||n.sz!==1)throw Error("Unexpected scale in original plaque motion");
    // Compose the node's native XYZ transform with the resident's half-turn.
    append(first+frame,{x:wall[0]-n.tx,y:wall[1]+n.ty,z:wall[2]-n.tz,
      rotationX:n.rx*deg,rotationY:180+n.ry*deg,rotationZ:-n.rz*deg});
  }
}
append(0,pose(resident,180));append(90,pose(resident,180));append(90,pose(wall,180));
appendClip(120,remove);appendClip(560,replace);
append(646,pose(wall,180));append(646,pose(resident,180));append(duration,pose(resident,180));
const times=samples.map(sample=>sample.time);
const plaque={channels:Object.fromEntries(Object.keys(samples[0].value).map(key=>[key,{
  interpolation:"linear",times,values:samples.map(sample=>sample.value[key]),
}]))};
// Before the fade, the owner plays 7025 starting at native frame 60 and
// tests 94/120 against AKIR's reported motion frame. It does not play a
// walk across the room. HAKO attaches to the left wrist until the scene cut.
const stoolId=id+"-stool";
const lift=MotnLoader.parse(bank,{sequenceIndices:[24]}).sequences[0];
const stoolPose=bindings.find(binding=>binding.actorTag==="HAKO").characterRecordOffset+16;
if(map.readUInt32LE(0x36b4c)!==7001+lift.index || lift.name!=="AKI_MOTU_DAI_TIKATANSAKU_0100" || lift.durationFrames!==187
  ||map.readFloatLE(0x36b48)!==60 || map.readUInt16LE(0x36bd8)!==0xe55e || map.readUInt16LE(0x36b08)!==0xe578
  ||chrt.readUInt32LE(stoolPose-4)!==0x49)throw Error("Changed original dojo stool pickup");
const atStool=[0,1,2].map(index=>map.readFloatLE(0x36b20+index*4));
const stoolOnFloor=[0,1,2].map(index=>chrt.readFloatLE(stoolPose+index*4));
const stool={id:stoolId,area:"JHD0",worldId:"exterior",durationSeconds:2,waitForMotionCompletion:false,playThroughFinish:true,
  useGameplayCamera:true,actorDefinitions:[],isolateScheduledActors:true,
  actors:[{tag:"AKIR",pose:pose(atStool,map.readUInt32LE(0x36b2c)*360/65536),motionStartSeconds:2,
    motion:{bank:"dojoScroll",name:lift.name,loop:false}}],
  attachedObjects:{HAKO:{...props.HAKO,worldTransforms:[{activityId:stoolId,frame:0,lastFrame:33,position:stoolOnFloor,rotationRaw:[0,0,0]}],
    attachments:[{activityId:stoolId,frame:34,parentActorTag:"AKIR",controlId:12,translation:frames(388076,"readFloatLE"),rotationRaw:frames(388088,"readUInt32LE")},
      {activityId:stoolId,frame:60,action:"detach"}]}},
  provenance:"JHD0 0x36834 calls 0x36990 before entering 0x36ca6. Ryo picks up the original HAKO stool with 7025 frames 60–120; FIXO at native frame 94 acquires wrist 12. The original mode-0 camera is represented by the normal room camera."};
const scene={id,area:"JHD0",worldId:"exterior",durationSeconds:duration/30,waitForMotionCompletion:false,playThroughFinish:true,
  actorDefinitions:[],isolateScheduledActors:true,actors:[{tag:"AKIR",pose:pose(stand,180),motion:{bank:"dojoScroll",name:sequence.name,loop:false}}],
  objectTransforms:[{object:"GART",visible:false},{object:"MKCS",visible:false}],
  sceneObjects:{GART:physical("GART",resident,[0,180,0]),HAKO:physical("HAKO",step,[0,0,0])},sceneObjectTracks:{GART:plaque},
  attachedObjects:{MKCS:{...props.MKCS,worldTransforms:[{activityId:id,frame:0,lastFrame:349,position:scroll,rotationRaw:[0,0,0]}],
    attachments:[{activityId:id,frame:350,parentActorTag:"AKIR",controlId:18,translation:frames(0x37320,"readFloatLE"),rotationRaw:frames(0x3732c,"readUInt32LE")}],
    presentation:[{activityId:id,frame:0,visible:false},{activityId:id,frame:170,visible:true},{activityId:id,frame:480,visible:false}]}},
  ...composeEventCameraShots(cameras,cuts,duration),nativeCameraCuts:cuts,
  dialogueCues:[{voiceId:"E1011A006",atSeconds:180/30},{voiceId:"E1011A102",atSeconds:390/30}],
  provenance:"Original JHD0 7051 motion, actor and stool positions, six ECAM shots, two E1011 lines, visibility and frame-350 wrist attachment. The original 7055/7056 TMNM clips rotate and translate the plaque between its native wall and resident poses."};
const manifest=prefix+"/manifest.json";
fs.writeFileSync(path.join(root,manifest),JSON.stringify({schema:"dojo-scroll-native-assets-v1",generatedBy,mapSha256:sha256(map),
  objectMotionSource:{
    motionBank:{member:"M_01137E.MOTN",sha256:sha256(bank)},
    stool:{sourceFunction:"0x36990",roomCameraModeSelect:"0x36a36",actorResource:7001+lift.index,
      sequence:lift.name,sourceStartFrame:60,sourceEndFrame:120,chrtPositionOffset:stoolPose,
      attachment:{call:"0x36c16",sourceFrame:94,object:"HAKO",parent:"AKIR",control:12},
      sceneTransitionCalls:["0x368dc","0x36946"]},
    plaque:{sourceFunction:"0x36ca6",model:props.GART.browserFilename,rigidRootOffset:node,
      clips:[{call:"0x37072",resource:7001+remove.index,sequence:remove.name,firstFrame:120,length:remove.durationFrames},
        {call:"0x375c2",resource:7001+replace.index,sequence:replace.name,firstFrame:560,length:replace.durationFrames}],
      placementFrames:{wall:90,resetMotion:645,resident:646},resident,wall}},
  outputs},null,2)+"\n");
fs.writeFileSync(path.join(root,"play/data/story-dojo-scroll.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{dojoScroll:motionPath},scenes:[stool,scene]},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifest,...outputs.map(a=>a.path)],{cwd:root,stdio:"pipe"});
console.log("Generated JHD0 discovery",duration,"frames,",cuts.length,"camera cuts.");
