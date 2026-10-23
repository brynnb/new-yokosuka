#!/usr/bin/env node
// Original presentation only; enclosing Yarn owns once-only item settlement.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,describeNativeAseqHandAssets,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeAseqCallbackHandPresentation} from "../lib/NativeAseqCallbackPresentation.mjs";
import {extractNativeAseqCallbackObjectPresentation} from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import {nativeAseqCallbackFrame} from "../lib/NativeAseqScriptOwnership.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(sourceRoot,"data/SCENE/02",p);
const archive=fs.readFileSync(source("DKTY/TUBA.PKS"));
const archiveHash="37247850f0b39318caf534827f685166466933bb005ad2528238e04859293d1a";
if(sha256(archive)!==archiveHash)throw Error("Changed original Bunkado handguard archive");
const map=fs.readFileSync(source("DKTY/MAPINFO.BIN"));
if(sha256(map)!=="d76e675e636600ef864a17f6acbcab17c54c0ca74249aa2f8c430d874555abb5")throw Error("Changed original Bunkado resource associations");
const textureArchive=fs.readFileSync(source("DKTY/TUBA.PKF"));
if(sha256(textureArchive)!=="94d437d1a4ee0ba62b985aece24f7e925edc4c2fc582e1630a787f8889572b2d")throw Error("Changed original handguard textures");
const members=parseIpacActivityArchive(archive).members;
const prefix="play/assets/dobuita/bunkado-handguard",audioPrefix="public/audio/world/bunkado-handguard";
const directory=path.join(root,prefix);
const evidence=JSON.parse(fs.readFileSync(path.join(root,"tools/evidence/bunkado-handguard-callback-ir.json")));
if(evidence.source.mapinfoSha256!==sha256(map))throw Error("Changed original Bunkado callback source");
const functions=[evidence.function,...evidence.supportingFunctions];
const presentation=[0x18da8,0x19edc,0x187d4].map((callbackFunction,activitySlot)=>{
  const nativeFunction=functions.find(fn=>Number(fn.id)===callbackFunction);
  const input={bytes:map,callbackFunction,nativeFunction,functions,activitySlot,durationFrames:[2950,590,960][activitySlot]};
  const hands=extractNativeAseqCallbackHandPresentation(input);
  const objects=extractNativeAseqCallbackObjectPresentation({...input,objectTags:["HAKO","TUBA","TOKE"]});
  const visibility=nativeFunction.blocks.flatMap(block=>block.actions)
    .filter(a=>a.semanticId==="resolved-object-runtime-flag"&&["HAKO","TUBA","TOKE"].includes(a.arguments[0].ascii))
    .map(a=>({objectTag:a.arguments[0].ascii,activitySlot,
      frame:nativeAseqCallbackFrame(map,callbackFunction,nativeFunction,a,functions),
      visible:a.arguments[1].value===1,callFileOffset:a.callFileOffset}));
  return {hands,objects,visibility};
});
const roomTextures=fs.readFileSync(source("DKTY/MPK00.PKF"));
if(sha256(roomTextures)!=="90ff4ccaae56b4c7435ec34cdb87cc6dff39fb8ce8150c4efc8de79b9a907e65")throw Error("Changed Bunkado room prop bindings");
const bindings=[textureArchive,roomTextures].flatMap(bytes=>parseChrtSceneObjectBindings(
  parseIpacActivityArchive(bytes).members.find(m=>m.name==="CHARA.CHRT").bytes));
const sceneObjects=Object.fromEntries(["HAKO","TUBA","TOKE"].map(tag=>{
  const binding=bindings.find(b=>b.actorTag===tag);
  if(!binding)throw Error(`Missing original Bunkado ${tag} binding`);
  return [tag,{model:binding.model,browserFilename:`${binding.model}.CHRM`,assetPath:`${prefix}/${binding.model}.CHRM`,
    textureAssetPath:`${prefix}/${tag==="TOKE"?"room-textures":"textures"}.bin`,source:binding}];
}));
const attachedObjects=Object.fromEntries(Object.entries(sceneObjects).map(([tag,object])=>{
  const attachments=presentation.flatMap(p=>p.objects.attachedObjectCues).filter(c=>c.objectTag===tag);
  return [tag,{...object,sceneObject:true,
    // AUTH owns the prop before/after a grip. A same-frame transfer has one
    // final visible owner, so never instantiate a second copy for the wrist.
    attachments:attachments.filter((c,i)=>attachments.findLastIndex(v=>v.activitySlot===c.activitySlot&&v.frame===c.frame)===i),
    presentation:presentation.flatMap(p=>p.visibility).filter(c=>c.objectTag===tag)}];
}));
const hand=filename=>{const member=members.find(m=>m.name===filename);if(!member)throw Error(`Missing original ${filename}`);return {path:`${prefix}/${filename}`,bytes:member.bytes};};
const characterTextures=extractNativeTexnPack(textureArchive,"DKTY/TUBA.PKF").bytes;
const handAssets={OISI:describeNativeAseqHandAssets({actorTag:"OISI",bodyModelCode:"KOT_L",handCode:"KOT",
  left:hand("KOT_TL.CHRM"),right:hand("KOT_TR.CHRM"),rig:hand("KOT_HM.BIN"),
  texturePack:{path:`${prefix}/textures.bin`,byteLength:characterTextures.length,sha256:sha256(characterTextures)}})};
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_bunkado_handguard_pack.mjs",resourceName:"TUBA",disc:2,
  sourcePath:source("DKTY/TUBA.PKS"),sourceManifestPath:"disc2/SCENE/02/DKTY/TUBA.PKS",archiveSha256:archiveHash,
  expectedMembers:members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:"docs/design/story-event-template.md#bunkado-sword-handguard",
  selectionRule:"Original owner 0x23ac8 calls 0x18da8/0x19edc/0x187d4 for slots 0/1/2, bound to AUTH-extension ordinals 1/2/4. Original hand and grip callbacks are compiled as finite data. Childhood flashback, box-lid motion and dynamic gaze are omitted.",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:16,member:"M_01321.MOTN"}],
  activities:[
    {slot:0,primaryPointer:0,secondaryPointer:0,file:"SEQDATA1.AUTH",durationFrames:2950,frameCount:51,actors:["HAKO","TUBA","TOKE","AKIR","OISI"]},
    {slot:1,primaryPointer:0,secondaryPointer:0,file:"SEQDATA2.AUTH",durationFrames:590,frameCount:5,actors:["TOKE","TUBA","AKIR","OISI"]},
    {slot:2,primaryPointer:0,secondaryPointer:0,file:"SEQDATA4.AUTH",durationFrames:960,frameCount:13,actors:["TOKE","TUBA","AKIR","OISI"]},
  ].map((activity,slot)=>({...activity,...presentation[slot].hands})),
  handAssets,nativeHandPoseTables:Object.assign({},...presentation.map(p=>p.hands.nativeHandPoseTables)),
  outputMembers:["KOT_L.CHRM","KOT_TL.CHRM","KOT_TR.CHRM","KOT_HM.BIN","HOHS502G.CHRM","TUB0210G.CHRM"],
  externalAssets:[{sourcePath:source("DKTY/MPK00.PKS"),sourceSha256:"3cc42be7fba11dddff57fa246145d8130e8154107337fd02f36c9b47e855e0ea",
    archiveMember:"TOKT203G.CHRM",assetPath:`${prefix}/TOKT203G.CHRM`,byteLength:5388,sha256:"efc7e5fd7b912d929644ff58b79b03c4af5579eff22a7b1afa70dace56d22d21"}],
  generatedAssets:[{assetPath:`${prefix}/textures.bin`,bytes:characterTextures,source:{path:"disc2/SCENE/02/DKTY/TUBA.PKF",sha256:sha256(textureArchive)}},
    {assetPath:`${prefix}/room-textures.bin`,bytes:extractNativeTexnPack(roomTextures,"DKTY/MPK00.PKF").bytes,source:{path:"disc2/SCENE/02/DKTY/MPK00.PKF",sha256:sha256(roomTextures)}}],
  packageActors:{OISI:{label:"Keizo Oishi",modelCode:"KOT_L",browserFilename:"KOT_L.CHRM",assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/KOT_L.CHRM`,textureAssetPath:`${prefix}/textures.bin`}},
  sceneObjects,attachedObjects,
});
console.log("Built original Bunkado handguard presentation");
if(process.argv.includes("--audio")){
  const dtpkDump=process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py");
  const vgmstream=process.env.VGMSTREAM_CLI;
  if(!vgmstream)throw Error("Set VGMSTREAM_CLI to the existing native audio tool");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_bunkado_handguard_pack.mjs",disc:2,
    authDirectory:directory,authFiles:manifest.activities.map(a=>a.archiveMember),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
    stream:{label:"A0132.AFS",path:source("STREAM/A0132.AFS"),manifestPath:"disc2/SCENE/02/STREAM/A0132.AFS",sha256:"23fa417da2f01fd55112b8dddb23f9563eb1e546c463cf0dcbf285f89771a0ee"},
    soundBank:{label:"A1_KOTTO.SND",path:source("SOUND/A1_KOTTO.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_KOTTO.SND",sha256:"4ceb7d1c37c29dca6b265e67e1ce44522ae9f9c482f1e308f710441872096e5c"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump,vgmstream,python:process.env.DTPK_PYTHON||"python3",
  });
  const musicPath=path.join(root,"public/music/manifest.json"),music=JSON.parse(fs.readFileSync(musicPath));
  const viewer=JSON.parse(fs.readFileSync(path.join(root,"public/music/asset-viewer-manifest.json")));
  const track=Object.values(viewer.tracks).find(t=>t.source.file==="BGM052.SND");
  if(!track?.ogg_url||track.source.bankSha256!=="542e57cd36093a5a728df3d9c3803a45970a3ceb6ff68256100e881fa1d2a5ba"||!map.includes(Buffer.from("bgm052.snd")))throw Error("Changed original Bunkado music association");
  music.tracks.bgm052={url:track.ogg_url,label:"Bunkado Antiques",durationSeconds:track.durationSeconds,loop:true,source:track.source};
  fs.writeFileSync(musicPath,JSON.stringify(music,null,2)+"\n");
  const paths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path),`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset),"public/music/manifest.json",`public${track.ogg_url}`];
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(paths)],{cwd:root,stdio:"inherit"});
  console.log(`Built ${audio.voices.length} original voices and ${audio.sounds.length} effects`);
}
// Keep presentation-only rebuilds coherent even when audio is already present.
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
