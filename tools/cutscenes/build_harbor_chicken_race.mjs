#!/usr/bin/env node
// Original introduction plus an authored QTE tableau. Yarn, not this asset
// compiler or the original DYNAMICS controller, decides the race outcome.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {createChasePath,curveTrack} from "../lib/AuthoredChase.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const prefix="play/assets/harbor/chicken-race",audioPrefix="public/audio/world/chicken-race";
const generatedBy="tools/cutscenes/build_harbor_chicken_race.mjs",evidence="docs/design/story-harbor-work.md#evening-chicken-race";
const archive=fs.readFileSync(path.join(source,"MFSY/RACE.PKS"));
const archiveHash="3be01b130f22a0b19f3318e0d833200c92ab8b3a488581bdabf62fcea44156a4";
if(sha256(archive)!==archiveHash)throw Error("Changed original RACE.PKS");
const originals=parseIpacActivityArchive(archive).members;
const member=name=>{const m=originals.find(m=>m.name===name);if(!m)throw Error(`Missing RACE/${name}`);return{name,sourcePath:path.join(source,"MFSY/RACE.PKS"),sourceManifestPath:"disc3/SCENE/03/MFSY/RACE.PKS",archiveMember:name,sourceSha256:archiveHash,byteLength:m.bytes.length,sha256:sha256(m.bytes)};};
const textures=fs.readFileSync(path.join(source,"MFSY/RACE.PKF"));
if(sha256(textures)!=="6b7a95a33bfeced4e651765d516de98b6318b5fb397a2da877b4f64a8e68fa36")throw Error("Changed original RACE.PKF");
const textureAssetPath=`${prefix}/textures.bin`;
const character=(label,code)=>({label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${code}.CHRM`,textureAssetPath:`play/assets/characters/${code.slice(0,3)}_textures.bin`});
const packageActors={SYZU:character("Shozo Mizuki","KOG_L"),BIKA:character("Takashi Watanabe","MJA_L"),BIKB:character("Takahiro Iwami","MJB_L")};
// Full motorcycle models from the same package. Their particular BIK1/BIK2
// association is an authored choice, not a recovered native object binding.
const vehicles={BIK1:"BIKK5DYG",BIK2:"BIKS509G"};
const sceneObjects=Object.fromEntries(Object.entries(vehicles).map(([tag,model])=>[tag,{model,browserFilename:`${model}.CHRM`,assetPath:`${prefix}/${model}.CHRM`,textureAssetPath}]));
for(const tag of ["LINT","LPOS","LGT1","LGT2","REF1","REF2"])sceneObjects[tag]={model:"unmapped-original-light-reference",browserFilename:`RACE-${tag}-reference`,referenceOnly:true};
const names=["SEQDATA1.AUTH","M_01CRA.MOTN","M_MBQC.MOTN","M_DEQB.MOTN",...Object.values(vehicles).map(v=>`${v}.CHRM`)];
const members=names.map(member);
const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:"RACE",disc:3,sourceMembers:members,expectedMembers:members,bindingEvidence:evidence,
  selectionRule:"Walkthrough-guided evening encounter; local presentation slot, not native owner selection.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:16,member:"M_01CRA.MOTN"}],activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"SEQDATA1.AUTH",durationFrames:1270,
    actors:["LINT","LPOS","BIK1","BIK2","SYZU","AKIR","LGT1","LGT2","BIKB","BIKA","REF1","REF2"]}],
  packageActors,sceneObjects,outputMembers:names.filter(n=>!n.endsWith("AUTH")&&!n.endsWith("M_01CRA.MOTN")),
  generatedAssets:[{assetPath:textureAssetPath,bytes:extractNativeTexnPack(textures,"RACE.PKF").bytes}],
});
const pose=(x,y,z,rotationY)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
// The native QTE course remains unknown. Use a verified harbor pedestrian
// route as an explicit approximation, keeping the existing original riding
// motions and both bikes together while the player answers the prompts.
const schedule=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/mfsy.json")));
const road=schedule.actors.find(a=>a.actorCode==="JOE_")?.routes.find(r=>r.id==="JOE_:964763891bf1:34200:0x210e8");
if(!road||sha256(Buffer.from(JSON.stringify(road.points)))!=="e3bb083d2cbdc5571a23fad06bd9f7299af954a02c3e20e0b53ef1be397706eb")throw Error("Changed reviewed harbor path");
const pathData=createChasePath(road.points.slice(35,41).reverse());
const distance=pathData.cumulative.at(-2);
const challenge=JSON.parse(fs.readFileSync(path.join(root,"play/data/story-challenges.json"))).challenges.find(c=>c.id==="s1.mfsy.chicken-race");
if(!challenge?.buttons?.length||!Number.isFinite(challenge.windowMs))throw Error("Missing chicken-race timing");
const duration=challenge.buttons.length*challenge.windowMs/1000;
const stations=[0,...pathData.cumulative.filter(d=>d>0&&d<distance),distance];
const samples=fn=>stations.map(d=>({time:d===0?0:d===distance?duration:duration*d/distance,value:fn(d)}));
const riding=(d,lateral=0)=>{
  const p=pathData.pose(d),previous=pathData.pose(Math.max(0,d-.1)),next=pathData.pose(Math.min(distance,d+.1));
  const dx=next.x-previous.x,dz=next.z-previous.z,length=Math.hypot(dx,dz)||1;
  return {...p,x:p.x-dz/length*lateral,z:p.z+dx/length*lateral};
};
const rider=(d,lateral)=>({...riding(d,lateral),y:riding(d,lateral).y+.286});
const camera=d=>{
  const c=pathData.camera(d),center=riding(d,1.5),p=riding(d);
  const shiftX=center.x-p.x,shiftZ=center.z-p.z;
  // Frame both riders within the playable viewport, including its sidebars.
  return {...c,positionX:p.x+(c.positionX-p.x)*1.4+shiftX,
    positionZ:p.z+(c.positionZ-p.z)*1.4+shiftZ,targetX:c.targetX+shiftX,targetZ:c.targetZ+shiftZ};
};
const bike=(tag,p)=>({...sceneObjects[tag],lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[p.x,p.y,p.z],rotationDegrees:[0,p.rotationY,0],scale:[1,1,1]}});
const first=riding(0),second=riding(0,3);
const scene={id:"s1.mfsy.chicken-race",area:"MFSY",worldId:"mfsy",
  durationSeconds:duration,waitForMotionCompletion:false,
  provenance:"Original riding clips and motorcycles from RACE.PKS. The moving side-by-side staging follows a reviewed harbor pedestrian route while prompts run; the original race course, timing, dismount and fall into the sea are not reconstructed.",
  actorDefinitions:Object.entries(packageActors).map(([actorCode,d])=>({actorCode,label:d.label,modelCode:d.modelCode,activityOnly:true})),
  actors:[{tag:"AKIR",pose:rider(0,0),movement:curveTrack(samples(d=>rider(d,0))),motion:{bank:"chickenRace",name:"AKI_NORU_BIKE_LP_QTE",loop:true}},
    {tag:"BIKB",pose:rider(0,3),movement:curveTrack(samples(d=>rider(d,3))),motion:{bank:"chickenRace",name:"OTH_TKA_NORU_BIKE_LP_QTE",loop:true}},
    {tag:"SYZU",pose:pose(-10,0,74,0),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}}],
  camera:camera(0),cameraTrack:curveTrack(samples(camera)),
  sceneObjects:{BIK1:bike("BIK1",first),BIK2:bike("BIK2",second)},
  sceneObjectTracks:{BIK1:curveTrack(samples(d=>riding(d))),BIK2:curveTrack(samples(d=>riding(d,3)))},
};
// The native outcome choreography is not yet decoded. Cut to a stationary
// street conversation with the original standing motions and E1070 speech,
// rather than presenting the voiced exchange over riders still on their bikes.
const ending={id:"s1.mfsy.chicken-race-aftermath",area:"MFSY",worldId:"mfsy",isolateScheduledActors:true,
  provenance:"Original E1070 outcome voices and RACE/M_DEQB standing motions; the location, camera, gestures and dismount are authored approximations.",
  actorDefinitions:Object.entries(packageActors).map(([actorCode,d])=>({actorCode,label:d.label,modelCode:d.modelCode,activityOnly:true})),
  actors:[{tag:"AKIR",pose:pose(-47.2,0,46.6,310),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}},
    {tag:"BIKA",pose:pose(-46,0,44.8,130),motion:{bank:"harborBiker",name:"OTH_STAND_YANKII_01_LP_F",loop:true}},
    {tag:"BIKB",pose:pose(-45.5,0,46.3,130),motion:{bank:"harborBiker",name:"OTH_STAND_YANKII_02_LP_F",loop:true}}],
  camera:{positionX:-42,positionY:2.2,positionZ:49,targetX:-47,targetY:1.1,targetZ:45.3,roll:0,perspective:65}};
fs.writeFileSync(path.join(root,"play/data/story-harbor-scenes.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{chickenRace:`${prefix}/M_MBQC.MOTN`,harborBiker:`${prefix}/M_DEQB.MOTN`},scenes:[scene,ending]},null,2)+"\n");
const runtimePaths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:["SEQDATA1.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01CRA.AFS",path:path.join(source,"STREAM/01CRA.AFS"),manifestPath:"disc3/SCENE/03/STREAM/01CRA.AFS",sha256:"0e38fe5beb85e03a2c7fc5b687187170fb1528016e9ad4d474149f683ca41353"},
    soundBank:{label:"A1_CRA.SND",path:path.join(source,"SOUND/A1_CRA.SND"),manifestPath:"disc3/SCENE/03/SOUND/A1_CRA.SND",sha256:"f7fb89b9cca937f8376cfdd88f1f28f477fa4367acb4d313616ff8198509d8de"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  console.log(`Built original chicken-race audio: ${audio.voices.length} voices, ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
console.log("Built original chicken-race introduction and authored riding tableau");
