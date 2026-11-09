#!/usr/bin/env node
// Rebuild the original kitchen flashback from the Disc 1 room controller.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack, parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {extractNativeAseqCallbackHandPresentation} from "../lib/NativeAseqCallbackPresentation.mjs";
import {extractNativeAseqCallbackObjectPresentation} from "../lib/NativeAseqCallbackObjectPresentation.mjs";

const root=path.resolve(import.meta.dirname,"../.."), disc=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const source=file=>path.join(disc,"data/SCENE/01",file), read=file=>fs.readFileSync(source(file));
const map=read("JOMO/MAPINFO.BIN"), archive=read("JOMO/NINJIN.PKS"), textures=read("JOMO/NINJIN.PKF"), common=read("JOMO/COMMON01.PKS");
const mapHash="4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9";
const archiveHash="09d53a87f0d213d7b790c6417084a1288c0e422757654bea2a90f5d17d5e3147";
const textureHash="016a76db7761515be55ff527d613a8a193d66bd9ff7493efdbfa327ff68e8885";
const commonHash="4b117711c45ca0a94690ce14b8896ddb5feacfde0ba5c7f2a13ae5310201ba22";
for(const [bytes,expected] of [[map,mapHash],[archive,archiveHash],[textures,textureHash],[common,commonHash]])
  if(sha256(bytes)!==expected)throw Error("Original childhood meal source changed");
const members=parseIpacActivityArchive(archive).members;
const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(textures).members.find(x=>x.name==="CHARA.CHRT").bytes);
const props=bindings.filter(b=>!['IWAO','JAKR'].includes(b.actorTag));
const prefix="play/assets/hazuki/childhood-meal",audioPrefix="public/audio/world/childhood-meal",directory=path.join(root,prefix);
const sourceMembers=[
  {name:"A0122.AUTH",sourcePath:source("JOMO/MAPINFO.BIN"),sourceManifestPath:"disc1/SCENE/01/JOMO/MAPINFO.BIN",sourceSha256:mapHash,sourceOffset:0x9d7cc,byteLength:10052,sha256:"3d3a41fb2cec5c9a8bedbf8a8e66fe11a7d643b70228791fbbb7e9785412dec6"},
  {name:"M_0122.MOTN",sourcePath:source("JOMO/COMMON01.PKS"),sourceManifestPath:"disc1/SCENE/01/JOMO/COMMON01.PKS",sourceSha256:commonHash,archiveMember:"M_0122.MOTN",byteLength:30068,sha256:"e91fee875bcdeb26ae8b780e757c21b5f8f3a39b3a051cfa1fc9fc4f3cabab67"},
];
const named=[...new Set([...props.map(p=>`${p.model}.CHRM`),"IWA_M.CHRM","JKB_M.CHRM"])];
const externalAssets=named.map(name=>{const m=members.find(x=>x.name===name);if(!m)throw Error(`Missing original meal model ${name}`);return {
  sourcePath:source("JOMO/NINJIN.PKS"),sourceSha256:archiveHash,archiveMember:name,assetPath:`${prefix}/${name}`,byteLength:m.bytes.length,sha256:sha256(m.bytes),
};});
const sakr=JSON.parse(fs.readFileSync(path.join(root,"play/assets/yd01/sakr/manifest.json")));
const hands=structuredClone(sakr.handAssets);
for(const record of Object.values(hands))for(const item of [record.left.model,record.right.model,record.rig]){
  const filename=path.basename(item.path),sourcePath=source(`MODEL/HAND/${filename}`);
  externalAssets.push({sourcePath,assetPath:`${prefix}/${filename}`,byteLength:item.byteLength,sha256:item.sha256});
  item.path=`${prefix}/${filename}`;
}
const program=JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeEventPrograms.generated.json"))).programs
  .find(p=>p.id==="disc1-jomo-room-initialization-0x88b70");
if(program?.mapinfoSha256!==mapHash)throw Error("Childhood meal callback source changed");
const owner=program.functions.find(f=>f.id==="0x645f8"),callback=program.functions.find(f=>f.id==="0x64ca0");
if(!owner?.blocks.some(b=>b.actions.some(a=>a.kind==="childCoroutineLaunch"&&a.targetFileOffset==="0x64ca0")))throw Error("Childhood meal callback binding changed");
const input={bytes:map,nativeFunction:callback,callbackFunction:0x64ca0,activitySlot:0,durationFrames:1320};
const handCues=extractNativeAseqCallbackHandPresentation(input);
// LKPT (head gaze) target provenance is not yet resolved. Keep the proven
// hand/prop cues; do not fabricate a gaze target just to make extraction pass.
const objects=extractNativeAseqCallbackObjectPresentation({...input,nativeFunction:{...callback,blocks:callback.blocks.map(b=>({...b,
  actions:b.actions.filter(a=>a.semanticId!=="actor-look-point-control"),
}))}});
const sceneObjects=Object.fromEntries(props.map(b=>[b.actorTag,{model:b.model,browserFilename:`S1_JOMO_${b.model}.MT5`,
  assetPath:`${prefix}/${b.model}.CHRM`,textureAssetPath:`${prefix}/textures.bin`,lifecycle:{kind:"room-script-persistent"},initialPresentation:b.presentation}]));
// JOMO setup 0x65cf6 hides the ordinary sykj meal, and 0x65e72 restores it.
// Borrow its actual exploration root so both cancellation and completion
// restore the same object instead of leaving duplicate dishes in the shot.
sceneObjects.SYKJ={model:"SSTS500G",browserFilename:"S1_JOMO_SSTS500G.MT5",objectTag:"sykj"};
const attachedObjects=Object.fromEntries(["GOHI","NINJ"].map(tag=>[tag,{...sceneObjects[tag],sceneObject:true,
  attachments:objects.attachedObjectCues.filter(c=>c.objectTag===tag).map(c=>({...c,activityId:"A0122/A0122.AUTH"}))}]));
const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_childhood_meal_pack.mjs",resourceName:"A0122",disc:1,
  sourceMembers,expectedMembers:sourceMembers,bindingEvidence:"docs/design/story-event-template.md#childhood-meal-memory",
  selectionRule:"Original JOMO SCEX slot 2; owner 0x645f8 launches hand/prop callback 0x64ca0. The player interaction and repeat gate are a Story adaptation.",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  externalAssets,generatedAssets:[{assetPath:`${prefix}/textures.bin`,bytes:extractNativeTexnPack(textures,"NINJIN.PKF").bytes,source:{path:"disc1/SCENE/01/JOMO/NINJIN.PKF",sha256:textureHash}}],
  handAssets:hands,nativeHandPoseTables:handCues.nativeHandPoseTables,sceneObjects,attachedObjects,
  packageActors:Object.fromEntries([["IWAO","Iwao Hazuki","IWA_M"],["JAKR","Young Ryo Hazuki","JKB_M"]].map(([tag,label,modelCode])=>[tag,{label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/${modelCode}.CHRM`,textureAssetPath:`${prefix}/textures.bin`}])),
  motionBanks:[{bank:18,member:"M_0122.MOTN"}],activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"A0122.AUTH",actors:["NIMR","JAKR","IWAO"],durationFrames:1320,
    ...handCues,nativeSceneObjectStates:props.map(p=>({actorTag:p.actorTag,presented:true}))}],
});
const paths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_childhood_meal_pack.mjs",disc:1,authDirectory:directory,authFiles:["A0122.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:"docs/design/story-event-template.md#childhood-meal-memory",
    stream:{label:"A0122.AFS",path:source("STREAM/A0122.AFS"),manifestPath:"disc1/SCENE/01/STREAM/A0122.AFS",sha256:"0c9cbcb90fb89a2b60ff60e60e769ca6f0b12b50808e1b6e97daccd319056720"},
    soundBank:{label:"A1_KSNIN.SND",path:source("SOUND/A1_KSNIN.SND"),manifestPath:"disc1/SCENE/01/SOUND/A1_KSNIN.SND",sha256:"434d3591580adb12217300f05522467d92b8939f013cc200e74afef38d3be216"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3"});
  paths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(paths)],{cwd:root,stdio:"inherit"});
console.log(`Built original childhood meal: ${manifest.activities[0].durationSeconds.toFixed(1)} seconds`);
