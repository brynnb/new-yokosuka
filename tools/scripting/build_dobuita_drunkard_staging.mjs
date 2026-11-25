// Restore E1005's interactive DYQB actor pair. The server owns input and settlement.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {afsMembers} from "../lib/NativeAseqAudioPack.mjs";
import {parseNativeSrfRecords} from "../../src/NativeLipSync.js";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {MotnLoader} from "../../src/MotnLoader.js";
import {evaluateAuthCamera} from "../../src/AuthCamera.js";
import {curveTrack} from "../lib/AuthoredChase.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const disc = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const prefix = "play/assets/dobuita/drunkard";
const outputs = [];
function source(name, digest) {
  const bytes = fs.readFileSync(path.join(disc,name));
  if (sha256(bytes)!==digest) throw Error("Changed original E1005 asset: "+name);
  return bytes;
}
function writeAsset(name, bytes) {
  const file=path.posix.join(prefix,name);
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),bytes);
  outputs.push({path:file,byteLength:bytes.length,sha256:sha256(bytes)});
  return file;
}
const map=source("D000/MAPINFO.BIN","58f1bc5d5bf8eedd2641544944e33bb25c20999945de52775ff679e87f98a884");
const pks=source("D000/DYQB.PKS","e467e35d95ef95af247bad7089cccd725a6b9a1447f2a2ae734d1060b4f587bc");
const pkf=source("D000/DYQB.PKF","1cee51d53d9cff648e2203b0c7fe7bd828c74db67814a1e7b16681978c68a819");
const gia=source("MODEL/CHARA/GIA_L.MT5","3cc7d09e77ebfcb8ffed397a1d04278cdfe224542929217f64a6a207cb5b16ec");
const members=parseIpacActivityArchive(pks).members;
const member=name=>{const m=members.find(x=>x.name===name);if(!m)throw Error("Missing DYQB member "+name);return m.bytes;};
const binding=parseChrtSceneObjectBindings(parseIpacActivityArchive(pkf).members.find(x=>x.name==="CHARA.CHRT").bytes);
if(binding.find(x=>x.actorTag==="BEER")?.model!=="BINS501G")throw Error("Missing original beer-bottle binding");
const motions=member("M_DYQB.MOTN"), bank=MotnLoader.parse(motions);
if(sha256(motions)!=="693f6499936766b665e617f80f95470fe16de34334936c43c205771d5830b523" || bank.sequences.length!==14)throw Error("Changed DYQB motions");
const motionPath=writeAsset("M_DYQB.MOTN",motions);
const tex=(bytes,name)=>Buffer.concat(extractNativeTexnPack(bytes,name).entries.map(x=>x.bytes));
const bodyPath=writeAsset("GIA_L.MT5",gia),texPath=writeAsset("GIA_textures.bin",tex(gia,"GIA"));
const bottlePath=writeAsset("BINS501G.CHRM",member("BINS501G.CHRM")),bottleTex=writeAsset("DYQB_textures.bin",tex(pkf,"DYQB"));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ny-e1005-camera-"));
let cameras;
const voiceCues = {
  intro:{id:"E1005B001",at:80,dialogue:135},
  "rear-pass":{id:"E1005B011",at:22,dialogue:87},
  "rear-miss":{id:"E1005A003",at:14,dialogue:78},
};
try {
  const voiceBank=source("STREAM/E1005.AFS","e587360d4da165698abe16389d1593869257c265cb1547bb0ec11be88a4c7615");
  const archive=afsMembers(voiceBank,"STREAM/E1005.AFS");
  const lines=archive.filter(entry=>/\.str$/i.test(entry.name));
  const subtitles=parseNativeSrfRecords(archive.find(entry=>/\.srf$/i.test(entry.name)).bytes);
  if (!process.env.VGMSTREAM_CLI) throw Error("Set VGMSTREAM_CLI to the original voice decoder");
  if (lines.length !== subtitles.length) throw Error("Mismatched E1005 voice and subtitle records");
  for (const cue of Object.values(voiceCues)) {
    const index=lines.findIndex(line=>line.name.toUpperCase()===cue.id+".STR");
    if (index<0 || subtitles[index].displayText.trim()) throw Error("Unexpected subtitle for E1005 nonverbal cue "+cue.id);
    const input=path.join(tmp,cue.id+".str"),wav=path.join(tmp,cue.id+".wav");
    fs.writeFileSync(input,lines[index].bytes);
    execFileSync(process.env.VGMSTREAM_CLI,["-i","-o",wav,input],{stdio:"pipe"});
    const bytes=fs.readFileSync(wav);
    if (bytes.toString("ascii",0,4)!=="RIFF" || bytes.toString("ascii",8,12)!=="WAVE") throw Error("Invalid E1005 WAV "+cue.id);
    cue.asset="public/audio/world/dobuita-drunkard/"+cue.id+".wav";
    const target=path.join(root,cue.asset);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,bytes);
    outputs.push({path:cue.asset,byteLength:bytes.length,sha256:sha256(bytes)});
  }
  const filename=path.join(tmp,"cameras.json");
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(disc,"D000/MAPINFO.BIN"),"--out",filename,...Array.from({length:17},(_,i)=>["--camera",String(8500+i)]).flat()],{cwd:root,stdio:"pipe"});
  cameras=new Map(JSON.parse(fs.readFileSync(filename)).records.map(r=>[r.cameraNumber,r]));
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
if(cameras.size!==17)throw Error("Expected all 17 original E1005 cameras");
const pose=(x,y,z,rotationY)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
function relative(origin,x,z,angle=0,y=0) {
  const r=origin.rotationY*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return pose(origin.x+c*x+s*z,origin.y+y,origin.z-s*x+c*z,origin.rotationY+angle);
}
function stageCamera(id,t,anchor) {
  const record=cameras.get(id);
  const channels=Object.fromEntries(Object.entries(record.curves).map(([key,v])=>[key,{times:v.times,values:v.values,tangents:v.slopes}]));
  const point=evaluateAuthCamera({channels},t);
  if(!anchor)return point;
  for(const prefix of ["position","target"]) {
    const p=relative(anchor,point[prefix+"X"],point[prefix+"Z"],0,point[prefix+"Y"]);
    point[prefix+"X"]=p.x;point[prefix+"Y"]=p.y;point[prefix+"Z"]=p.z;
  }
  return point;
}
function motion(name,{loop=false,hold}={}) {
  if(name==="idle")return {bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
  const clip=bank.getSequence(name);
  if(!clip?.valueData?.complete)throw Error("Missing original E1005 motion "+name);
  return {bank:"dobuitaDrunkard",name,loop,...(hold===undefined?{}:{elapsedSeconds:hold})};
}
const actors={DICK:{label:"Dick Philips",modelCode:"GIA_L",browserFilename:"GIA_L.MT5",assetFormat:"MT5",characterScale:1,assetPath:bodyPath,textureAssetPath:texPath}};
const defs=[{actorCode:"DICK",label:"Dick Philips",modelCode:"GIA_L",assetPath:bodyPath,textureAssetPath:texPath,activityOnly:true}];
const posAt=(xyz,angles)=>pose(map.readFloatLE(xyz),map.readFloatLE(xyz+4),map.readFloatLE(xyz+8),map.readInt32LE(angles+4)*360/65536);
const opening=[posAt(635156,635168),posAt(635132,635144)];
const front=pose(-112.6,0,99.41,245.7),back=pose(-109.516,0,100.806,245.7);
const close=relative(front,-.35,-.575,180),grab=relative(front,-.425,-.125,180),rear=relative(back,-.25,1,0);
const forward=relative(front,-.231,-3.932,180);
const group="s1.d000.drunkard";
const introCamera=stageCamera(8500,4.5);
const pair=(a,b,hold)=>[motion(a,hold??{}),motion(b,hold??{})];
const swat="SEIKOU_HARAU_FRONT",missA="SIPPAI_HARAU_A_FRONT",missB="SIPPAI_HARAU_B_FRONT",grapple="SIPPAI_KARAMI_LP_FRONT",passRear="SEIKOU_BEER_BACK",missRear="SIPPAI_BEER_BACK";
const paired=(name,opts)=>pair("AKI_"+name,"OTH_DRN_"+name,opts);
const shot=(camera,anchor=null)=>stageCamera(camera,0,anchor);
const scenes=[];
function cameraTrack(shots,duration) {
  const samples = [];
  for (let i=0;i<shots.length;i++) {
    const [frame,number,anchor,from=0]=shots[i];
    const start=frame/30,stop=i+1<shots.length?shots[i+1][0]/30-.0001:duration;
    for(let t=start;t<stop;t+=.25)samples.push({time:t,value:stageCamera(number,t-start+from/30,anchor)});
    samples.push({time:stop,value:stageCamera(number,stop-start+from/30,anchor)});
  }
  const track=curveTrack(samples);
  // The two bridging knots encode an actual camera cut, never an interpolated pan.
  for(const c of Object.values(track.channels)) for(let i=1;i<c.times.length;i++)
    if(c.times[i]-c.times[i-1]<.0002)c.tangents[i]=c.tangents[i-1]=0;
  return track;
}
function record(key,poses,movement,camera,opts={}) {
  const id=group+"."+key;
  const starts=opts.starts ?? [0,0];
  const duration=opts.duration ?? Math.max(...movement.map((m,i)=>(bank.getSequence(m.name)?.durationFrames||0)-starts[i]))/30;
  const rearBottle=key.startsWith("rear-");
  const attach={activityId:id,frame:0,parentActorTag:"DICK",controlId:18,
    translation:rearBottle?[.106,.036,-.017]:[.085,.019,-.023],rotationRaw:rearBottle?[34039,0,64459]:[0,0,0]};
  const actorList=["AKIR","DICK"].map((tag,i)=>({tag,pose:poses[i],motion:movement[i],...(starts[i]?{motionStartSeconds:starts[i]/30}:{})}));
  if(opts.path) actorList[1].movement=curveTrack(opts.path.map(([time,value])=>({time,value})));
  const scene={id,area:"D000",worldId:"dobuita",continuationGroup:group,continuesPrevious:false,
    durationSeconds:duration,waitForMotionCompletion:opts.blocking===true,packageActors:actors,actorDefinitions:defs,
    isolateScheduledActors:true,actors:actorList,camera,
    attachedObjects:{BEER:{browserFilename:"BINS501G.CHRM",assetPath:bottlePath,textureAssetPath:bottleTex,attachments:[attach]}},
    provenance:"Original Disc 2 E1005 positions, DYQB motions, bottle hand binding and D000 ECAM shots. Cut boundaries, transition movement and voiced-line pacing are adapted to the Story presenter."};
  if (["front-pass","grapple-pass","rear-pass","rear-miss"].includes(key)) scene.playThroughFinish=true;
  if (key === "grapple-lead") {
    scene.dialogueCueSeconds = 100/30;
    scene.playThroughFinish = true;
    scene.waitForMotionCompletion = false;
  }
  const cue=voiceCues[key];
  if(cue)scene.voiceCue={asset:cue.asset,atSeconds:cue.at/30,dialogueAtSeconds:cue.dialogue/30};
  if(key.startsWith("grapple-")) {
    // D000 0x885ba initializes +0xad4 to zero. 0x89b2c selects the current
    // shot, then chooses a different index for the next grapple attempt.
    const from = key==="grapple-lead" ? 0 : key==="grapple-prompt" ? 149 : 167;
    const angles = [8502,8515,8516].map(cameraNumber=>{
      const anchor = cameraNumber===8515 ? null : front;
      const shots = [[0,cameraNumber,anchor,from],...(opts.shots?.slice(1) || [])];
      const camera=stageCamera(cameraNumber,from/30,anchor);
      const track=cameraTrack(shots,duration);
      const moves=Object.values(track.channels).some(channel=>channel.values.some(value=>value!==channel.values[0]));
      return {cameraNumber,camera,...(moves ? {cameraTrack:track} : {})};
    });
    scene.cameraPool={id:"s1.d000.drunkard.grapple",advance:key==="grapple-lead",angles};
  } else if(opts.shots) scene.cameraTrack=cameraTrack(opts.shots,duration);
  scenes.push(scene);
}
record("intro",opening,pair("idle","OTH_DRN_WALK_LP_YOPPARAI",{loop:true}),introCamera,{duration:4.5,path:[[0,opening[1]],[4.5,forward]]});
// Rows 0/1/2 start the 1-based DYQB motion commands at 1/7/13;
// their success continuations are 3/9/15. Odd is Ryo and even is Dick.
record("front-lead",[front,forward],paired(swat),shot(8507,front),{starts:[15,0],duration:47/30,blocking:true});
record("front-prompt",[front,forward],paired(swat),shot(8507,front),{starts:[62,47],duration:.8});
record("front-pass",[front,forward],paired(swat),shot(8507,front),{starts:[110,85],shots:[[0,8507,front],[60,8509,forward]]});
record("front-miss",[front,close],paired(missA),shot(8502,front),{blocking:true});
record("grapple-lead",[front,grab],paired(grapple,{loop:true}),shot(8502,front),{duration:149/30,blocking:true});
record("grapple-prompt",[front,grab],paired(grapple,{loop:true}),shot(8502,front),{starts:[149,149],duration:.8});
const grappleRelease=relative(front,-.4,-.18,180);
record("grapple-pass",[front,grappleRelease],paired(missB),shot(8502,front),{starts:[10,0],shots:[[0,8502,front],[30,8509,grappleRelease]]});
// On a missed B the table selects a no-op motion command and retains the grapple.
record("grapple-miss",[front,grab],paired(grapple,{loop:true}),shot(8502,front),{starts:[167,167],duration:1,blocking:true});
record("rear-prompt",[back,rear],paired(missRear),shot(8505,back),{duration:.8});
record("rear-pass",[back,rear],paired(passRear),shot(8510),{starts:[31,31],shots:[[0,8510,null],[215,8503,back],[290,8504,back]]});
record("rear-miss",[back,rear],paired(missRear),shot(8505,back),{starts:[20,20],shots:[[0,8505,back],[8,8514,back],[53,8513,back]]});
const rows=Array.from({length:3},(_,n)=>Array.from({length:12},(_,i)=>map.readInt32LE(0x9aebc+48*n+4*i)));
const manifest=prefix+"/manifest.json";
fs.writeFileSync(path.join(root,manifest),JSON.stringify({schema:"dobuita-drunkard-native-assets-v1",generatedBy:"tools/scripting/build_dobuita_drunkard_staging.mjs",mapSha256:sha256(map),promptRows:rows,outputs},null,2)+"\n");
fs.writeFileSync(path.join(root,"play/data/story-dobuita-drunkard.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_dobuita_drunkard_staging.mjs",motionBanks:{dobuitaDrunkard:motionPath},scenes},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifest,...outputs.map(x=>x.path)],{cwd:root,stdio:"pipe"});
console.log("Restored "+scenes.length+" E1005 stages, "+cameras.size+" original cameras, "+outputs.length+" private assets");
