#!/usr/bin/env node
// Chapter content only: the existing AUTH/audio compiler and combat runtime
// own playback/simulation. Original archives do not prove native battle spawns.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack,registerNativeAseqMusic} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {runtimeAssetUrl} from "../../src/RuntimeAssets.js";

const root=path.resolve(import.meta.dirname,"../.."),generatedBy="tools/cutscenes/build_nozomi_rescue_pack.mjs";
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const prefix="play/assets/harbor/nozomi-rescue",audioPrefix="public/audio/world/nozomi-rescue";
const evidence="docs/design/story-nozomi-rescue.md#warehouse-battles-and-terrys-deal";
const sources={
  TER2:{pks:"41ef8c4b096e251ad046e558d455d0972a986dc867bfcd44a4c40c3f6cbda256",pkf:"04f7c3a5e019b9bc16b13376456d88bc75a6ebb24597978919a5c152b4ceeec4"},
  TERYB1:{pks:"7f33a31c293b76270c2752981bc356f18461387cd523243460ae812473476ec6",pkf:"89e4962d8f33ddca8b41cf7de3f0a4579d13c5d7404e1e87521f9310a85b69d1"},
  TERYB2:{pks:"17937a5d4ca08568b06c19a02dbe055aad3db4b90c395b1010cfb49447576a54",pkf:"a35221686b0cd93910c1bcbda3183ed08aa32bb585a8edc4ee1c87d7307c9972"},
};
const sourceMembers=[],outputMembers=[],generatedAssets=[],packageActors={},archives=new Map();
for(const [name,pins]of Object.entries(sources)){
  const sourcePath=path.join(source,`TERY/${name}.PKS`),bytes=fs.readFileSync(sourcePath);
  if(sha256(bytes)!==pins.pks)throw Error(`Changed original ${name}.PKS`);
  archives.set(name,{sourcePath,members:parseIpacActivityArchive(bytes).members});
  const textures=fs.readFileSync(path.join(source,`TERY/${name}.PKF`));
  if(sha256(textures)!==pins.pkf)throw Error(`Changed original ${name}.PKF`);
  generatedAssets.push({assetPath:`${prefix}/${name}-textures.bin`,bytes:extractNativeTexnPack(textures,`${name}.PKF`).bytes,
    source:{path:`disc3/SCENE/03/TERY/${name}.PKF`,sha256:pins.pkf}});
}
function member(archive,name){
  if(sourceMembers.some(m=>m.name===name))throw Error(`Ambiguous rescue source member ${name}`);
  const {sourcePath,members}=archives.get(archive),found=members.find(m=>m.name===name);
  if(!found)throw Error(`Missing ${archive}/${name}`);
  sourceMembers.push({name,sourcePath,sourceManifestPath:`disc3/SCENE/03/TERY/${archive}.PKS`,archiveMember:name,
    sourceSha256:sources[archive].pks,byteLength:found.bytes.length,sha256:sha256(found.bytes)});
  return name;
}
const activities=[
  {slot:0,file:"SEQDATAC.AUTH",actors:["MRSK","AKIR","STSI","HRSK","PEDR","TERY"],durationFrames:1985},
  {slot:1,file:"SEQDATAD.AUTH",actors:["MRSK","AKIR","STSI","HRSK","PEDR","TERY"],durationFrames:3870},
  {slot:2,file:"SEQDATAE.AUTH",actors:["CHAI","AKIR","HRSK"],durationFrames:180},
].map(a=>({...a,binding:{kind:"map-embedded-slot"}}));
for(const a of activities)member("TER2",a.file);
member("TER2","M_01TAP.MOTN");
function actor(archive,tag,modelCode,label){
  outputMembers.push(member(archive,`${modelCode}.CHRM`));
  packageActors[tag]={label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
    assetPath:`${prefix}/${modelCode}.CHRM`,textureAssetPath:`${prefix}/${archive}-textures.bin`,
    sourceBinding:{kind:"authored-package-model-association",archiveMember:`${modelCode}.CHRM`,evidence}};
}
// Tags/AMOV/cameras are original. These body associations and the two battle
// formations are reviewed adaptations, not a recovered native actor controller.
actor("TER2","TERY","KMA_L","Terry");
actor("TER2","PEDR","JNC_L","Mad Angels fighter");
actor("TER2","STSI","ACS_M","Mad Angels fighter");
actor("TER2","CHAI","CHA_M","Chai");
for(const [tag,label,code]of [["MRSK","Shingo Murasaki","PPL_L"],["HRSK","Nozomi Harasaki","NZM_L"]]){
  const assetPath=`play/assets/characters/${code}.CHRM`,textureAssetPath=`play/assets/characters/${code.slice(0,3)}_textures.bin`;
  runtimeAssetUrl(assetPath);runtimeAssetUrl(textureAssetPath);
  packageActors[tag]={label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath,textureAssetPath};
}
const waves=[{archive:"TERYB1",tags:["BTA","BTB","BTC","BTD","BTE","BTF"],prefix:"NR0",id:"s1.mfsy.nozomi-guards",area:"MFSY",worldId:"mfsy",
  positions:[[-92,0,25],[-89,0,21],[-94,0,20],[-97,0,22],[-90,0,18],[-95,0,18],[-92,0,16]]},
  {archive:"TERYB2",tags:["BTG","BTH","BTI","BTJ","BTK","BTM","OKA"],prefix:"NR1",id:"s1.tery.nozomi-guards",area:"TERY",worldId:"tery",
    positions:[[-16,0,-24],[-12,0,-20],[-16,0,-19],[-20,0,-20],[-22,0,-16],[-10,0,-16],[-14,0,-13],[-18,0,-13]]}];
const scenes=waves.map(w=>{
  const tags=["AKIR",...w.tags.map((code,i)=>{const tag=`${w.prefix}${i+1}`;actor(w.archive,tag,`${code}_L`,"Mad Angels fighter");return tag;})];
  return{id:w.id,area:w.area,worldId:w.worldId,
    provenance:`Authored ${w.tags.length}-fighter formation using the distinct original ${w.archive} bodies. GameSpot pp62-63 establishes two battles; archive membership does not establish native roster, positions or difficulty.`,
    actorDefinitions:tags.slice(1).map(actorCode=>({actorCode,...packageActors[actorCode],activityOnly:true})),
    actors:tags.map((tag,i)=>({tag,pose:{x:-w.positions[i][0],y:w.positions[i][1],z:w.positions[i][2],rotationX:0,rotationY:0,rotationZ:0},
      motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}})),
    camera:{positionX:-w.positions[0][0],positionY:3,positionZ:w.positions[0][2]+5,targetX:-w.positions[0][0],targetY:1,targetZ:w.positions[0][2]-3,roll:0,perspective:60}};
});
const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:"TER2",disc:3,sourceMembers,expectedMembers:sourceMembers,
  bindingEvidence:evidence,selectionRule:"Walkthrough-guided two battles, then original TER2 C/D/E. Ordinals normalize original file names; native branching is not reconstructed.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:16,member:"M_01TAP.MOTN"}],activities,
  // Battle definitions use the same extracted files, but cinematic loading
  // must not instantiate thirteen unrelated fighters for every conversation.
  packageActors:Object.fromEntries(Object.entries(packageActors).filter(([tag])=>activities.some(a=>a.actors.includes(tag)))),
  outputMembers,generatedAssets});
const scenePath="play/data/story-nozomi-rescue.generated.json";
fs.writeFileSync(path.join(root,scenePath),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{},scenes},null,2)+"\n");
const runtimePaths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:activities.map(a=>a.file),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01TAP.AFS",path:path.join(source,"STREAM/01TAP.AFS"),manifestPath:"disc3/SCENE/03/STREAM/01TAP.AFS",sha256:"8824c0058137812470773274106abe8d7bf201957811e69fbe8a12d568d0f97a"},
    soundBank:{label:"A1_TERRY.SND",path:path.join(source,"SOUND/A1_TERRY.SND"),manifestPath:"disc3/SCENE/03/SOUND/A1_TERRY.SND",sha256:"a9066c99966806378f34888d7a4239bde0eec7e33373a2ff0dfec5ab9e4906bd"},
    unavailableVoices:{
      "01TAPC026.str":{reason:"Original TER2/SEQDATAD requests 01TAPC026, absent from the pinned English 01TAP archive, whose Terry lines end at C025. No substituted voice or invented subtitle.",evidence},
      "01TAPH001.str":{reason:"Original TER2/SEQDATAE requests Chai's 01TAPH001, absent from the pinned English 01TAP archive. Silent six-second original coda retained; no substituted laugh or subtitle.",evidence},
    },
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3"});
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  runtimePaths.push(...registerNativeAseqMusic(root,{id:"bgm084",sourceId:"7e5bc0053824814ff10b0c7b78d3ddef0d0f0a769d47c53e35fdfe3851f7f3d0",
    bankHash:"b2f1eeab4d264b03ea48c16a50b0b69885e4b939f38268d648db10c19c158d36",label:"Terry's hostage deal"}));
  console.log(`Rescue audio: ${audio.voices.length} voices, ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
console.log("Built three original rescue films and two authored battle formations; presentation grants no victory.");
