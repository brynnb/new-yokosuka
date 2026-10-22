#!/usr/bin/env node
// Original introduction plus an authored QTE tableau. Yarn, not this asset
// compiler or the original DYNAMICS controller, decides the race outcome.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

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
const names=["SEQDATA1.AUTH","M_01CRA.MOTN","M_MBQC.MOTN",...Object.values(vehicles).map(v=>`${v}.CHRM`)];
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
const bike=(tag,position)=>({...sceneObjects[tag],lifecycle:{kind:"room-script-persistent"},initialPresentation:{position,rotationDegrees:[0,-90,0],scale:[1,1,1]}});
const scene={id:"s1.mfsy.chicken-race",area:"MFSY",worldId:"mfsy",
  provenance:"Original riding clips and motorcycles from RACE.PKS. Held side-by-side quay staging and camera are authored; the original moving course, dismount and fall into the sea are not reconstructed.",
  actorDefinitions:Object.entries(packageActors).map(([actorCode,d])=>({actorCode,label:d.label,modelCode:d.modelCode,activityOnly:true})),
  actors:[{tag:"AKIR",pose:pose(-12,.286,80,-90),motion:{bank:"chickenRace",name:"AKI_NORU_BIKE_LP_QTE",loop:true}},
    {tag:"BIKB",pose:pose(-12,.286,77,-90),motion:{bank:"chickenRace",name:"OTH_TKA_NORU_BIKE_LP_QTE",loop:true}},
    {tag:"SYZU",pose:pose(-10,0,74,0),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}}],
  camera:{positionX:-8,positionY:2.2,positionZ:83,targetX:-12,targetY:1, targetZ:78.5,roll:0,perspective:60},
  sceneObjects:{BIK1:bike("BIK1",[-12,0,80]),BIK2:bike("BIK2",[-12,0,77])},
};
fs.writeFileSync(path.join(root,"play/data/story-harbor-scenes.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{chickenRace:`${prefix}/M_MBQC.MOTN`},scenes:[scene]},null,2)+"\n");
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
