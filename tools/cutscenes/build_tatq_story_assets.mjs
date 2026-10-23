// Exact local assets for authored tattoo-parlor staging. No room-controller
// reconstruction; keep the archive and member hashes as provenance.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const source=fs.readFileSync(path.join(sourceRoot,"data/SCENE/01/TATQ/QTE.PKS"));
if(sha256(source)!=="2c7d24b8f92596871e765852e174e04aef99bcaada5efa1d610aa854302993a8")throw new Error("Changed TATQ QTE archive");
const members=parseIpacActivityArchive(source).members;
const output=path.join(root,"play/assets/characters");fs.mkdirSync(output,{recursive:true});
for(const [name,hash]of [["BIS_L.CHRM","1f3f0f873d8b42d401d2ff7973b95cac14ec67151cf66427a3e41cffbacc1877"],["BIS_F.CHRM","00805064861388a815a54cb3da2aef30e589954119bdf7afc99bd7d32b529719"]]){
 const member=members.find(m=>m.name===name);if(!member||sha256(member.bytes)!==hash)throw new Error(`Changed ${name}`);
 fs.writeFileSync(path.join(output,name),member.bytes);
}
const textureSource=fs.readFileSync(path.join(sourceRoot,"data/SCENE/01/TATQ/QTE.PKF"));
if(sha256(textureSource)!=="9e80455b4c5d526321306a950ee515fba9075f987f65611e1701c264d3eefdd1")throw new Error("Changed TATQ QTE texture archive");
const textures=extractNativeTexnPack(textureSource,"TATQ QTE textures");
fs.writeFileSync(path.join(output,"BIS_textures.bin"),textures.bytes);
execFileSync(process.execPath,[path.join(root,"tools/runtime-assets.mjs"),"update",
 "play/assets/characters/BIS_L.CHRM","play/assets/characters/BIS_F.CHRM","play/assets/characters/BIS_textures.bin"],{cwd:root,stdio:"inherit"});
console.log(`Exported TATQ body, face and ${textures.entries.length} original textures.`);

// The room embeds a complete introduction, separate from its interactive
// knife QTE. Preserve the exact timeline; Yarn remains the progress authority.
const sourcePath=file=>path.join(sourceRoot,"data/SCENE/01",file);
const mapPath=sourcePath("TATQ/MAPINFO.BIN");
const mapHash="33fc374132d53ed955a4a1704350582afd122b4e86635867808d4c312e6bc4a6";
const roomPath=sourcePath("TATQ/MPK00.PKS");
const room=fs.readFileSync(roomPath),roomTextures=fs.readFileSync(sourcePath("TATQ/MPK00.PKF"));
if(sha256(room)!=="a70837006eca15f7c6d3e79a5fb4f8ebe53a1b1e4ef6b7f97cc806d55d114e03"
  ||sha256(roomTextures)!=="638db6f31e023109852b747ff921a14e3c532001c8ed13d3e3fb1b6885b1c1e0")throw Error("Changed TATQ room source");
const prefix="play/assets/dobuita/tattoo-introduction",audioPrefix="public/audio/world/tattoo-introduction";
const directory=path.join(root,prefix);
const sourceMembers=[
  {name:"INTRO.AUTH",sourcePath:mapPath,sourceManifestPath:"disc1/SCENE/01/TATQ/MAPINFO.BIN",sourceSha256:mapHash,
    sourceOffset:0x23ce4,byteLength:13048,sha256:"df894f627509cdaae4b07fd61ff594848c52a14763fe91c5795bd2ff39d36bd6"},
  {name:"M_0136.MOTN",sourcePath:sourcePath("TATQ/QTE.PKS"),sourceManifestPath:"disc1/SCENE/01/TATQ/QTE.PKS",
    sourceSha256:sha256(source),archiveMember:"M_0136.MOTN",byteLength:885156,sha256:"b59326820d48ee99d5d0615021da96ae0c0ac58320876d438962d9a0ba47e07e"},
];
const bindings=[...parseChrtSceneObjectBindings(parseIpacActivityArchive(roomTextures).members.find(m=>m.name==="CHARA.CHRT").bytes),
  ...parseChrtSceneObjectBindings(parseIpacActivityArchive(textureSource).members.find(m=>m.name==="CHARA.CHRT").bytes)];
const roomMembers=parseIpacActivityArchive(room).members;
const props=["KTE1","DOOR","ISU1","ISU2","NIFE"].map(tag=>{
  const binding=bindings.find(b=>b.actorTag===tag);
  if(!binding)throw Error(`Missing original TATQ ${tag} model binding`);
  const filename=`${binding.model}.CHRM`,fromRoom=roomMembers.find(m=>m.name===filename),member=fromRoom||members.find(m=>m.name===filename);
  if(!member)throw Error(`Missing original TATQ ${tag} model`);
  return {tag,binding,member,fromRoom:!!fromRoom};
});
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_tatq_story_assets.mjs",resourceName:"TATQ_INTRO",disc:1,
  sourceMembers,expectedMembers:sourceMembers,
  selectionRule:"Exact TATQ embedded AUTH at 0x23ce4. Slot 0 is a browser package slot, not a recovered controller selector.",
  bindingEvidence:"docs/design/story-event-template.md#charlie-confrontation-and-the-cartel-appointment",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"INTRO.AUTH",durationFrames:1780,actors:["KTE1","AKIR","DOOR","ISU1","ISU2","NIFE","HORS","TONY","SMTH"]}],
  motionBanks:[{bank:16,member:"M_0136.MOTN"}],
  externalAssets:props.map(({member,fromRoom})=>({sourcePath:fromRoom?roomPath:sourcePath("TATQ/QTE.PKS"),archiveMember:member.name,
    sourceSha256:sha256(fromRoom?room:source),assetPath:`${prefix}/${member.name}`,byteLength:member.bytes.length,sha256:sha256(member.bytes)})),
  generatedAssets:[{assetPath:`${prefix}/room-textures.bin`,bytes:extractNativeTexnPack(roomTextures).bytes},
    {assetPath:`${prefix}/qte-textures.bin`,bytes:textures.bytes}],
  sceneObjects:Object.fromEntries(props.map(({tag,binding,member,fromRoom})=>[tag,{
    model:binding.model,browserFilename:`S1_TATQ_${binding.model}.MT5`,assetPath:`${prefix}/${member.name}`,
    textureAssetPath:`${prefix}/${fromRoom?"room":"qte"}-textures.bin`,source:binding,
  }])),
  packageActors:Object.fromEntries([["HORS","Takashiro","TAT_M","TAT"],["TONY","Tony Abrams","GIJ_M","GIJ"],["SMTH","Smith Bradley","GIB_M","GIB"]].map(([tag,label,modelCode,texture])=>[tag,{
    label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
    assetPath:`play/assets/characters/${modelCode}.CHRM`,textureAssetPath:`play/assets/characters/${texture}_textures.bin`,
  }])),
});
if(process.argv.includes("--audio")){
  if(!process.env.VGMSTREAM_CLI)throw Error("Set VGMSTREAM_CLI to the original stream decoder");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_tatq_story_assets.mjs",disc:1,
    authDirectory:directory,authFiles:["INTRO.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
    stream:{label:"A0136A.AFS",path:sourcePath("STREAM/A0136A.AFS"),manifestPath:"disc1/SCENE/01/STREAM/A0136A.AFS",sha256:"b5b0652fb0b71f3bc64f361d35bd9699b1836dc2b4c794a1f2a337f1ba8528d6"},
    soundBank:{label:"A1_TATT3.SND",path:sourcePath("SOUND/A1_TATT3.SND"),manifestPath:"disc1/SCENE/01/SOUND/A1_TATT3.SND",sha256:"25a3a4d1c692507bec7f22076373cd8916594f31c5e6a3f5d888108b7b667463"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3",
  });
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path),
    `${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset)],{cwd:root,stdio:"inherit"});
}
console.log("Built original tattoo-parlor introduction; interactive QTE and settlement unchanged.");
