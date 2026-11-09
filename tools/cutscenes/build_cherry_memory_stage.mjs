#!/usr/bin/env node
// A Story viewer stays in JHD0; lease the exact YD01 film scenery rather than
// changing their persistent world or decoding another copy of the timeline.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {addNativeAseqStageAssets} from "../lib/NativeAseqStageAssets.mjs";

const root=path.resolve(import.meta.dirname,"../.."),sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const area=path.join(sourceRoot,"data/SCENE/01/YD01"),archivePath=path.join(area,"SAKR.PKS"),archive=fs.readFileSync(archivePath);
const archiveHash="dbe1067dd36caa78e75afd9343af2cbd052efdc60eca3096116d371a0c2ef57d";
if(sha256(archive)!==archiveHash)throw Error("Changed original SAKR archive");
const original=JSON.parse(fs.readFileSync(path.join(root,"play/assets/yd01/sakr/manifest.json"))),inventory=parseIpacActivityArchive(archive).members;
const prefix="play/assets/hazuki/cherry-memory",directory=path.join(root,prefix),members=[],outputMembers=[],sceneObjects={},generatedAssets=[];
for(const name of ["SEQDATA0.AUTH","M_0128.MOTN"]){
  const expected=original.source.members.find(m=>m.name===name),member=inventory.find(m=>m.name===name);
  if(!expected||!member||member.bytes.length!==expected.byteLength||sha256(member.bytes)!==expected.sha256)throw Error(`Changed original SAKR member ${name}`);
  members.push({name,sourcePath:archivePath,sourceManifestPath:"disc1/SCENE/01/YD01/SAKR.PKS",sourceSha256:archiveHash,archiveMember:name,byteLength:expected.byteLength,sha256:expected.sha256});
}
const states=addNativeAseqStageAssets({stage:{archive:"SAKR.PKS",sha256:archiveHash,textures:"SAKR.PKF",textureHash:"d794e4a41eec7640a38d0d5288c3c5b03a4aa2e26a87146cd3129664ef6fb180",maps:["MAP","MAP01","MAP02","MAP03"]},
  sourceDirectory:area,sourceManifestPrefix:"disc1/SCENE/01/YD01",assetPrefix:prefix,members,outputMembers,sceneObjects,generatedAssets});
const externalAssets=["IWA_M.CHRM","JKB_M.CHRM"].map(name=>{const m=inventory.find(x=>x.name===name);if(!m)throw Error(`Missing SAKR model ${name}`);return {
  sourcePath:archivePath,sourceSha256:archiveHash,archiveMember:name,assetPath:`${prefix}/${name}`,byteLength:m.bytes.length,sha256:sha256(m.bytes)};});
const handAssets=structuredClone(original.handAssets);
for(const hand of Object.values(handAssets))for(const item of [hand.left.model,hand.right.model,hand.rig]){
  const filename=path.basename(item.path);externalAssets.push({sourcePath:path.join(sourceRoot,"data/SCENE/01/MODEL/HAND",filename),assetPath:`${prefix}/${filename}`,byteLength:item.byteLength,sha256:item.sha256});item.path=`${prefix}/${filename}`;
}
const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_cherry_memory_stage.mjs",resourceName:"SAKR",disc:1,
  sourceMembers:members,expectedMembers:members,bindingEvidence:"docs/design/story-event-template.md#cherry-tree-memory",
  selectionRule:"Exact original SAKR slot 0; package-local isolated scenery permits Story playback without changing the shared world.",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),audioManifest:"public/audio/world/sakr/manifest.json",
  outputMembers,externalAssets,generatedAssets,sceneObjects,handAssets,nativeHandPoseTables:original.nativeHandPoseTables,
  packageActors:Object.fromEntries([["IWAO","Iwao Hazuki","IWA_M"],["JAKR","Young Ryo Hazuki","JKB_M"]].map(([tag,label,modelCode])=>[tag,{label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/${modelCode}.CHRM`,textureAssetPath:`${prefix}/stage-textures.bin`}])),
  // Keep the existing outdoor sky/weather while leasing the independent
  // original scene geometry. The exact flashback weather is not recovered.
  motionBanks:[{bank:17,member:"M_0128.MOTN"}],activities:[{...original.activities[0],binding:{kind:"map-embedded-slot"},file:"SEQDATA0.AUTH",browserMapVisibility:[],browserIsolatedStage:true,browserIsolatedEnvironment:false,browserLightingPresetIndex:0,nativeSceneObjectStates:states}],
});
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log("Built source SAKR stage and exact film for personal Story playback.");
