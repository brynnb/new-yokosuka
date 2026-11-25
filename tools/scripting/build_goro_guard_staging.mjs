// The original MFSY 0x6d9c4 conversation precedes GKYU/SEQDATA2.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const area=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2"),"data/SCENE/02/MFSY");
const map=fs.readFileSync(path.join(area,"MAPINFO.BIN"));
if(sha256(map)!=="53ccad493265183650bb00aae9189be66bd2564808dfc96483dcf1944f39d988")throw Error("Changed MFSY controller");
const prefix="play/assets/harbor/goro-guard-distraction";
const id="s1.mfsy.goro-guard-intro";
const resource=parseIpacActivityArchive(fs.readFileSync(path.join(area,"GKYU.PKS"))).members.find(m=>m.name==="M_GKYU.MOTN");
if(sha256(resource.bytes)!=="8c014986961defc6ee92a6b4d070217398a1aee2aa22539cc93834b9779f6a61")throw Error("Changed Goro introduction motions");
const bank=MotnLoader.parse(resource.bytes.buffer.slice(resource.bytes.byteOffset,resource.bytes.byteOffset+resource.bytes.length));
fs.mkdirSync(path.join(root,prefix),{recursive:true});
fs.writeFileSync(path.join(root,prefix,resource.name),resource.bytes);
const free=(name,loop)=>({bank:"free",name,loop});
const clip=(index,loop)=>({bank:"goroGuardIntro",name:bank.sequences[index].name,loop});
const pose=(x,z,rotationY)=>({x,y:0,z,rotationX:0,rotationY,rotationZ:0});
const ryo=pose(-112.6,109.3,290),goro=pose(-105.4,106.6,120),run=pose(-108.9,107.7,115);
const body={label:"Goro Mihashi",modelCode:"KMB_L",characterScale:1,assetFormat:"MT5",browserFilename:"KMB_L.CHRM",
  assetPath:"play/assets/characters/KMB_L.CHRM",textureAssetPath:"play/assets/characters/KMB_textures.bin"};
const shots=[{frame:0,cameraNumber:8250},{frame:110,cameraNumber:8251},{frame:170,cameraNumber:8252},{frame:200,cameraNumber:8253}];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"goro-guard-camera-"));
let cameras;
try {
  const out=path.join(temp,"cameras.json");
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",path.join(area,"MAPINFO.BIN"),"--out",out,
    ...shots.flatMap(({cameraNumber})=>["--camera",String(cameraNumber)])],{cwd:root,stdio:"pipe"});
  cameras=new Map(JSON.parse(fs.readFileSync(out)).records.map(record=>[record.cameraNumber,record]));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
// Shot 8251 addresses AKIR for the eye and target. Convert its local spline
// into world space at his staged head height; the remaining shots are absolute.
const curves=cameras.get(8251).curves,angle=ryo.rotationY*Math.PI/180;
for(const field of ["position","target"]){
  const x=curves[field+"X"],z=curves[field+"Z"],y=curves[field+"Y"];
  if(JSON.stringify(x.times)!==JSON.stringify(z.times))throw Error("Changed Goro camera channels");
  for(const key of ["values","slopes"]){
    const xv=x[key].slice(),zv=z[key].slice();
    x[key]=xv.map((v,i)=>Math.cos(angle)*v+Math.sin(angle)*zv[i]+(key==="values"?ryo.x:0));
    z[key]=zv.map((v,i)=>-Math.sin(angle)*xv[i]+Math.cos(angle)*v+(key==="values"?ryo.z:0));
  }
  y.values=y.values.map(v=>v+1.6);
}
// Both original faces are acquired before E1081: AKIR at 0x6d29e/0x6d2fa
// and GORO at 0x6d5dc/0x6d5f0. Disc 2 reuses the prepared original YKC face.
const guardPackage=JSON.parse(fs.readFileSync(path.join(root,prefix,"manifest.json"),"utf8"));
const faceCatalog=JSON.parse(fs.readFileSync(path.join(root,"play/assets/cutscenes/native-faces/manifest.generated.json"),"utf8"));
const facialAssets={AKIR:faceCatalog.facialAssets.AKIR,GORO:guardPackage.facialAssets.GORO};
if(facialAssets.GORO.bodyModelCode!==body.modelCode)throw Error("Unexpected Goro face binding");
for(const resource of [facialAssets.AKIR.model,facialAssets.AKIR.table]){
  const original=path.join(area,"../MODEL/FACE",path.basename(resource.path));
  if(sha256(fs.readFileSync(original))!==resource.sha256)throw Error("Changed Disc 2 Ryo face "+original);
}
const duration=440;
// The original director sets a new origin on frame 170. Hold his old
// position through the preceding frame without spline drift.
const movement={channels:Object.fromEntries(Object.keys(goro).map(key=>[key,{
  interpolation:"linear",times:[0,170/30,170/30,duration/30],values:[goro[key],goro[key],run[key],run[key]],
}]))};
const scene={id,area:"MFSY",worldId:"mfsy",musicPackageId:"goro-guard-distraction",durationSeconds:duration/30,playThroughFinish:true,waitForMotionCompletion:false,
  facialAssets,isolateScheduledActors:true,actorDefinitions:[{actorCode:"GORO",...body,activityOnly:true}],packageActors:{GORO:body},
  actors:[{tag:"AKIR",pose:ryo,motion:free("AKI_AKI_STAND_LP",true)},
    {tag:"GORO",pose:goro,motion:clip(0,false),movement,
      motionCues:[{atSeconds:170/30,playbackRate:0.75,motion:free("AKI_AKI_RUN_LP",true)},{atSeconds:183/30,playbackRate:0.75,motion:free("AKI_AKI_RUN_EN",false)},
        {atSeconds:203/30,motion:clip(3,false)},{atSeconds:260/30,motion:clip(2,false)}]}],
  ...composeEventCameraShots(cameras,shots,duration),
  dialogueCues:[["E1081B001",0],["E1081A001",100],["E1081B002",230],["E1081A002",360]].map(([voiceId,frame])=>({voiceId,atSeconds:frame/30})),
  provenance:"Disc 2 MFSY 0x6d9c4–0x6dbc4. Four E1081 voices, four original camera shots and GKYU motions. Shot 8251 uses an adapted Ryo head-height anchor."};
const output="play/data/story-goro-guard.generated.json";
fs.writeFileSync(path.join(root,output),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_goro_guard_staging.mjs",motionBanks:{goroGuardIntro:prefix+"/"+resource.name},scenes:[scene]},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",prefix+"/"+resource.name],{cwd:root,stdio:"inherit"});
