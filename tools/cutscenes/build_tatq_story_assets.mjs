// Exact local assets for authored tattoo-parlor staging. No room-controller
// reconstruction; keep the archive and member hashes as provenance.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import { buildNativeAseqActivityPack, describeNativeAseqHandAssets, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import { extractNativeAseqCallbackHandPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";

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
const profiles=[
  {id:"introduction",resource:"TATQ_INTRO",file:"INTRO.AUTH",offset:0x23ce4,length:13048,hash:"df894f627509cdaae4b07fd61ff594848c52a14763fe91c5795bd2ff39d36bd6",frames:1780,callback:0x19fb4,
    hands:["HORS","TONY"],actors:["KTE1","AKIR","DOOR","ISU1","ISU2","NIFE","HORS","TONY","SMTH"],props:["KTE1","DOOR","ISU1","ISU2","NIFE","ITEM"],cast:["HORS","TONY","SMTH"],
    stream:"A0136A",streamHash:"b5b0652fb0b71f3bc64f361d35bd9699b1836dc2b4c794a1f2a337f1ba8528d6",
    selectionRule:"Exact first embedded TRCK at 0x23ce4 (slot 0). Controller 0x19044 launches callback 0x19fb4 before starting slot 0; only this introduction is enabled here."},
  {id:"aftermath",resource:"TATQ_AFTERMATH",file:"AFTERMATH.AUTH",offset:0x281e0,length:21660,hash:"e5ad1935a05b9560b43f8755f1a1d48435c6fa66ce467352e6c8c1272f7c5e6e",frames:1695,callback:0x1a69c,
    hands:["CHRL"],actors:["AKIR","CHRL","DOOR","ITEM","ISU1","ISU2","NIFE"],props:["KTE3","DOOR","ITEM","ISU1","ISU2","NIFE"],cast:["CHRL"],
    stream:"A0136",streamHash:"d4c15c2353ecd53bc2a9afda1e46131f62e019bcd583d8d40071cea134514a9a",
    selectionRule:"Exact original TRCK slot 2 at 0x281e0, normalized to package slot 0. Owner 0x19044 pairs it with callback 0x1a69c and setup 0x19860. This is presentation after a separately successful client QTE, never a victory source. Original wrist adjustments are compiled from the bounded callback; callback expression/gaze controls remain untranslated."},
];
const profileArg=process.argv.indexOf("--profile");
const selected=profileArg<0?profiles:profiles.filter(p=>p.id===process.argv[profileArg+1]);
if(!selected.length)throw Error("Unknown tattoo scene profile");
for(const p of selected){
const callback=JSON.parse(fs.readFileSync(path.join(root,`tools/evidence/tatq-${p.id}-callback-ir.json`)));
if(callback.source.mapinfoSha256!==mapHash||Number(callback.source.callbackFunction)!==p.callback)throw Error(`Changed TATQ ${p.id} callback`);
const callbackInput={bytes:fs.readFileSync(mapPath),callbackFunction:p.callback,nativeFunction:callback.function,activitySlot:0,durationFrames:p.frames};
const objects=extractNativeAseqCallbackObjectPresentation(callbackInput);
const hands=extractNativeAseqCallbackHandPresentation(callbackInput);
const roomPath=sourcePath("TATQ/MPK00.PKS");
const room=fs.readFileSync(roomPath),roomTextures=fs.readFileSync(sourcePath("TATQ/MPK00.PKF"));
if(sha256(room)!=="a70837006eca15f7c6d3e79a5fb4f8ebe53a1b1e4ef6b7f97cc806d55d114e03"
  ||sha256(roomTextures)!=="638db6f31e023109852b747ff921a14e3c532001c8ed13d3e3fb1b6885b1c1e0")throw Error("Changed TATQ room source");
const prefix=`play/assets/dobuita/tattoo-${p.id}`,audioPrefix=`public/audio/world/tattoo-${p.id}`;
const directory=path.join(root,prefix);
const handFiles=[];
const handAssets=Object.fromEntries([
  ["HORS","TAT",["85156d22c467a6bc1f5493253930fdbbf21c96c4219d6588dd34130c583487b9","fa6bf1912c6923c8acad29adcef4a4f2c7e6a539243f166defad46fe65e89a6a","63ddfc53a7397ff87b5909d60ff9be3804099ff842828d465bb4a4ffc04859bd"]],
  ["TONY","GIJ",["bf14ace42223e4524a58551c74e9be9dcc8911dbad566b8c68ef0ab75a1d50c8","622c0f9a9c7f33b65af9eff47006d9246ab5e0c2f8526834ea7b14918bdd56b6","bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729"]],
  ["CHRL","BIS",["c958badbf7c43e9f2140887077af231bc04504736983da37048095fba0f35105","c065caaad300d451382034f40ecf43c1d6642c79370f2d60394c735bf3f6081e","d1cf00a20e1d9e08ea38ed83970590021ad32f55cdec9f35cc858c2c99f6af2d"]],
].filter(([tag])=>p.hands.includes(tag)).map(([actorTag,code,hashes])=>{
  const files=["TL.MT5","TR.MT5","HM.BIN"].map((suffix,index)=>{
    const filename=`${code}_${suffix}`,file=sourcePath(`MODEL/HAND/${filename}`),bytes=fs.readFileSync(file);
    if(sha256(bytes)!==hashes[index])throw Error(`Changed original TATQ hand ${filename}`);
    const assetPath=`${prefix}/${filename}`;
    handFiles.push({sourcePath:file,assetPath,byteLength:bytes.length,sha256:hashes[index]});
    return {bytes,path:assetPath,sourcePath:`disc1/SCENE/01/MODEL/HAND/${filename}`};
  });
  return [actorTag,describeNativeAseqHandAssets({actorTag,handCode:code,bodyModelCode:actorTag==="CHRL"?"BIS_L":`${code}_M`,left:files[0],right:files[1],rig:files[2]})];
}));
const sourceMembers=[
  {name:p.file,sourcePath:mapPath,sourceManifestPath:"disc1/SCENE/01/TATQ/MAPINFO.BIN",sourceSha256:mapHash,
    sourceOffset:p.offset,byteLength:p.length,sha256:p.hash},
  {name:"M_0136.MOTN",sourcePath:sourcePath("TATQ/QTE.PKS"),sourceManifestPath:"disc1/SCENE/01/TATQ/QTE.PKS",
    sourceSha256:sha256(source),archiveMember:"M_0136.MOTN",byteLength:885156,sha256:"b59326820d48ee99d5d0615021da96ae0c0ac58320876d438962d9a0ba47e07e"},
];
const bindings=[...parseChrtSceneObjectBindings(parseIpacActivityArchive(roomTextures).members.find(m=>m.name==="CHARA.CHRT").bytes),
  ...parseChrtSceneObjectBindings(parseIpacActivityArchive(textureSource).members.find(m=>m.name==="CHARA.CHRT").bytes)];
const roomMembers=parseIpacActivityArchive(room).members;
const props=p.props.map(tag=>{
  const binding=bindings.find(b=>b.actorTag===tag);
  if(!binding)throw Error(`Missing original TATQ ${tag} model binding`);
  const filename=`${binding.model}.CHRM`,fromRoom=roomMembers.find(m=>m.name===filename),member=fromRoom||members.find(m=>m.name===filename);
  if(!member)throw Error(`Missing original TATQ ${tag} model`);
  return {tag,binding,member,fromRoom:!!fromRoom};
});
const tool=props.find(p=>p.tag==="ITEM");
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_tatq_story_assets.mjs",resourceName:p.resource,disc:1,
  sourceMembers,expectedMembers:sourceMembers,
  selectionRule:p.selectionRule,
  bindingEvidence:"docs/design/story-event-template.md#charlie-confrontation-and-the-cartel-appointment",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  activities:[{...hands,slot:0,binding:{kind:"map-embedded-slot"},file:p.file,durationFrames:p.frames,actors:p.actors,
    ...(p.id==="aftermath"?{nativeSceneObjectStates:[{actorTag:"KTE3",presented:true}]}:{})}],
  handAssets,nativeHandPoseTables:hands.nativeHandPoseTables,
  motionBanks:[{bank:16,member:"M_0136.MOTN"}],
  externalAssets:[...handFiles,...props.map(({member,fromRoom})=>({sourcePath:fromRoom?roomPath:sourcePath("TATQ/QTE.PKS"),archiveMember:member.name,
    sourceSha256:sha256(fromRoom?room:source),assetPath:`${prefix}/${member.name}`,byteLength:member.bytes.length,sha256:sha256(member.bytes)}))],
  generatedAssets:[{assetPath:`${prefix}/room-textures.bin`,bytes:extractNativeTexnPack(roomTextures).bytes},
    {assetPath:`${prefix}/qte-textures.bin`,bytes:textures.bytes}],
  sceneObjects:Object.fromEntries(props.filter(prop=>p.id==="aftermath"||prop.tag!=="ITEM").map(({tag,binding,member,fromRoom})=>[tag,{
    model:binding.model,browserFilename:`S1_TATQ_${binding.model}.MT5`,assetPath:`${prefix}/${member.name}`,
    textureAssetPath:`${prefix}/${fromRoom?"room":"qte"}-textures.bin`,source:binding,
    ...(tag==="KTE3"?{lifecycle:{kind:"room-script-persistent"},initialPresentation:binding.presentation}:{}),
  }])),
  ...(p.id==="introduction"?{attachedObjects:{ITEM:{
    browserFilename:`S1_TATQ_${tool.binding.model}.MT5`,assetPath:`${prefix}/${tool.member.name}`,
    textureAssetPath:`${prefix}/qte-textures.bin`,source:tool.binding,
    // Same-frame detach/rebind has one final visible pose, as in DJHN/TOKI.
    // After the final detach the off-camera parked tool is not reconstructed.
    attachments:objects.attachedObjectCues.filter((cue,index,cues)=>cues.findLastIndex(c=>c.objectTag===cue.objectTag&&c.frame===cue.frame)===index),
  }}}:{}),
  packageActors:Object.fromEntries([["HORS","Takashiro","TAT_M","TAT"],["TONY","Tony Abrams","GIJ_M","GIJ"],["SMTH","Smith Bradley","GIB_M","GIB"],["CHRL","Charlie","BIS_L","BIS"]].filter(([tag])=>p.cast.includes(tag)).map(([tag,label,modelCode,texture])=>[tag,{
    label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
    assetPath:`play/assets/characters/${modelCode}.CHRM`,textureAssetPath:`play/assets/characters/${texture}_textures.bin`,
  }])),
});
if(process.argv.includes("--audio")){
  if(!process.env.VGMSTREAM_CLI)throw Error("Set VGMSTREAM_CLI to the original stream decoder");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_tatq_story_assets.mjs",disc:1,
    authDirectory:directory,authFiles:[p.file],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
    stream:{label:`${p.stream}.AFS`,path:sourcePath(`STREAM/${p.stream}.AFS`),manifestPath:`disc1/SCENE/01/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:"A1_TATT3.SND",path:sourcePath("SOUND/A1_TATT3.SND"),manifestPath:"disc1/SCENE/01/SOUND/A1_TATT3.SND",sha256:"25a3a4d1c692507bec7f22076373cd8916594f31c5e6a3f5d888108b7b667463"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3",
  });
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",
    `${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset)],{cwd:root,stdio:"inherit"});
}
// Presentation-only changes must register their manifest/models even when
// audio was already built; otherwise the browser receives stale asset hashes.
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log(`Built original tattoo-parlor ${p.id}; interactive QTE and settlement unchanged.`);
}
