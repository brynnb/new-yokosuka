#!/usr/bin/env node
// Original embedded TRCK films, not a reconstruction of the NBIK controller.
// The existing exact-activity sequence compiler/player owns the playlist.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseAuthSequence} from "../../src/AuthSequence.js";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";

const root=path.resolve(import.meta.dirname,"../.."),source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const generatedBy="tools/cutscenes/build_nozomi_home_pack.mjs",evidence="docs/design/story-nozomi-rescue.md#ride-home-and-rest";
const prefix="play/assets/harbor/nozomi-home",audioPrefix="public/audio/world/nozomi-home";
const mapPath=path.join(source,"NBIK/MAPINFO.BIN"),map=fs.readFileSync(mapPath),mapHash="9acf1bacb3ac4f5533d00b709482dfc8848d9c39fcdfa23ce45e1900f0d06e31";
if(sha256(map)!==mapHash)throw Error("Changed original NBIK map");
const sourceMembers=[],generatedAssets=[],outputMembers=[],sceneObjects={},packageActors={};
const activities=[];
// Strict adjacent resource boundaries, not a scan for incidental AUTH text.
// AUTH resources are TRCK containers; "AUTH" is a filename extension only.
for(let at=10572;at<308488;){
  if(map.toString("ascii",at,at+4)!=="TRCK")throw Error(`Changed embedded NBIK track at ${at}`);
  const size=map.readUInt32LE(at+4),bytes=map.subarray(at,at+size),s=parseAuthSequence(bytes),slot=activities.length,file=`NBIK${String(slot).padStart(2,"0")}.AUTH`;
  sourceMembers.push({name:file,sourcePath:mapPath,sourceManifestPath:"disc3/SCENE/03/NBIK/MAPINFO.BIN",sourceOffset:at,sourceSha256:mapHash,byteLength:size,sha256:sha256(bytes)});
  activities.push({slot,file,actors:s.actors,durationFrames:s.durationFrames,binding:{kind:"map-embedded-slot"}});
  at+=size;
  if(at>308488)throw Error("Embedded NBIK track exceeds reviewed boundary");
}
if(activities.length!==23||activities.reduce((n,a)=>n+a.durationFrames,0)!==4661)throw Error("Changed original ride-home coverage");
function loose(name,hash){
  const sourcePath=path.join(source,`NBIK/${name}`),bytes=fs.readFileSync(sourcePath);
  if(sha256(bytes)!==hash)throw Error(`Changed original NBIK/${name}`);
  sourceMembers.push({name,sourcePath,sourceManifestPath:`disc3/SCENE/03/NBIK/${name}`,sourceSha256:hash,byteLength:bytes.length,sha256:hash});
  return bytes;
}
loose("M_01BIKE.BIN","b3795359d698c4128ade05ad47dd487c4cc6aba6c51a39a19242e75b06fe5dae");
const modelPins={
  BIKS520G:"14fb88b373a0121c6d9b0380dfb11f2b3f87aaf4be59167001d3d18c40254937",
  WTGO10MG:"d1a249ba60a8dd30e1dd3b7e589b56835112b1a3c1568abd7efa8923d112ae15",
  JOUO10LG:"3577d41f4cb01b3fb6c5f89fbdc6f47570af214c9d4157a1a47740d2947c8d68",
  TRXG0CPG:"81bd83d2b5e13b61cd603e366faf852fc9e4400f5fbf7cca6df587ef79f77c02",
  TRXG0CNG:"843b07e5813d1ebd544aaf7fd4a93859858107552784d03af34d0b814a9e073f",
  CEDO104G:"e9a282987e46e20c7e128724f67eb289930d45c09fefe24c885c9e2e1b1b1173",
  WAGO12MG:"302b8d8b50e39e2840857a0eaccbd009858fcf93242cecb897e7e57913d44f6e",
  MONR001G:"334f31296d19543ba3cd19134d53d280ebb99e37cdc2e437993c6214786f7888",
};
const bindings=parseChrtSceneObjectBindings(map.subarray(map.indexOf("CHRS"))),tags=[...new Set(activities.flatMap(a=>a.actors))];
const textures=new Map();
for(const tag of tags.filter(t=>!["AKIR","HRSK"].includes(t))){
  const binding=bindings.find(b=>b.actorTag===tag);if(!binding)throw Error(`No original NBIK CHRS binding for ${tag}`);
  if(["SUJI","HIKA"].includes(tag)){
    // Original speed/headlight reference planes; generic mesh playback does
    // not recreate their native glow/lighting behavior. Keep the references.
    sceneObjects[tag]={model:binding.model,browserFilename:`NBIK-${tag}-reference`,referenceOnly:true};continue;
  }
  const name=`${binding.model}.MT5`,bytes=loose(name,modelPins[binding.model]);outputMembers.push(name);
  for(const entry of extractNativeTexnPack(bytes,name).entries){
    const prior=textures.get(entry.id);if(prior&&!prior.equals(entry.bytes))throw Error(`Conflicting original NBIK texture ${entry.id}`);
    textures.set(entry.id,entry.bytes);
  }
  sceneObjects[tag]={model:binding.model,browserFilename:name,assetPath:`${prefix}/${name}`,textureAssetPath:`${prefix}/textures.bin`,
    sourceBinding:{kind:"original-mapinfo-chrs",evidence:"disc3/SCENE/03/NBIK/MAPINFO.BIN",actorTag:tag}};
}
generatedAssets.push({assetPath:`${prefix}/textures.bin`,bytes:Buffer.concat([...textures.values()])});
// NBIK's original CHRS requests NZM_M. TER2 provides that exact full body and
// its texture pack; do not relabel another character or copy a low-detail donor.
const original=path.join(source,"TERY/TER2.PKS"),archive=fs.readFileSync(original),archiveHash="41ef8c4b096e251ad046e558d455d0972a986dc867bfcd44a4c40c3f6cbda256";
if(sha256(archive)!==archiveHash)throw Error("Changed original Nozomi body archive");
const nozomi=parseIpacActivityArchive(archive).members.find(m=>m.name==="NZM_M.CHRM");
sourceMembers.push({name:nozomi.name,sourcePath:original,sourceManifestPath:"disc3/SCENE/03/TERY/TER2.PKS",archiveMember:nozomi.name,sourceSha256:archiveHash,byteLength:nozomi.bytes.length,sha256:sha256(nozomi.bytes)});
outputMembers.push(nozomi.name);
packageActors.HRSK={label:"Nozomi Harasaki",modelCode:"NZM_M",browserFilename:nozomi.name,assetFormat:"MT5",characterScale:1,
  assetPath:`${prefix}/${nozomi.name}`,textureAssetPath:"play/assets/harbor/nozomi-rescue/TER2-textures.bin"};
const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:"NBIK",disc:3,sourceMembers,expectedMembers:sourceMembers,bindingEvidence:evidence,
  selectionRule:"Authored adjacent-file order of all 23 original ride-home TRCK resources, not recovered NBIK controller selection. The original 31.1-second conversation precedes 124.27 seconds of riding shots.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:16,member:"M_01BIKE.BIN"}],activities,sceneObjects,packageActors,outputMembers,generatedAssets});
const routeFile=path.join(root,"tools/data/native-activity-preview-routes.json"),routes=JSON.parse(fs.readFileSync(routeFile));
const route={cutsceneId:"story-s1-nozomi-home",programId:"story-s1-nozomi-home",packageId:"nozomi-home",worldId:"nbik-home",area:"NBIK",manifest:`${prefix}/manifest.json`,activities:activities.map(a=>({slot:a.slot}))};
routes.routes=routes.routes.filter(r=>r.programId!==route.programId);routes.routes.push(route);fs.writeFileSync(routeFile,JSON.stringify(routes,null,2)+"\n");
const runtimePaths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:activities.map(a=>a.file),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01BIKEB.AFS",path:path.join(source,"STREAM/01BIKEB.AFS"),manifestPath:"disc3/SCENE/03/STREAM/01BIKEB.AFS",sha256:"7d018d2ecc4d85e5b680cdcb33f33947970d33b9959f16a51772e120243e7675"},
    soundBank:{label:"A1_NBIKE.SND",path:path.join(source,"SOUND/A1_NBIKE.SND"),manifestPath:"disc3/SCENE/03/SOUND/A1_NBIKE.SND",sha256:"d28ee580a7603f021de0adf0f492f1d802692c658451749d864e0eed2f89b034"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3"});
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].map(a=>a.asset));
  // CDDA is outside the extracted data filesystem. Resolve the actual GDI's
  // directory before its relative tracks; worktree links must not change it.
  const gdi=fs.realpathSync(process.env.SHENMUE_DISC3_GDI||path.join(root,".disc-work/disc3.gdi"));
  const line=fs.readFileSync(gdi,"utf8").split(/\r?\n/).find(l=>/^5\s/.test(l)),match=line?.match(/^5 180906 0 2352 "([^"]+)" 352800$/);
  if(!match)throw Error("Expected original Disc3 CDDA track5 binding");
  const trackPath=path.resolve(path.dirname(gdi),match[1]),bytes=fs.readFileSync(trackPath),pcm=bytes.subarray(352800);
  if(sha256(bytes)!=="bece1989acdbbd6c707cbf6a41ca95b133f4c123ec4520dc2db7e08054d6dcdb"||sha256(pcm)!=="031d1b724985ca7737ccdcfae4a2d461e11c219e46425f2b7fecfe1729ea59bf")throw Error("Changed original ride-home CDDA");
  const file="public/music/shenmue1/nozomi-home-cdda05.ogg";
  // The input bitexact flag does not control the Ogg muxer. Set it on the
  // output too so rebuilding the same disc audio preserves its immutable hash.
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-fflags","+bitexact","-skip_initial_bytes","352800","-f","s16le","-ar","44100","-ac","2","-i",trackPath,"-map_metadata","-1","-c:a","libvorbis","-q:a","4","-flags:a","+bitexact","-threads","2","-fflags","+bitexact",path.join(root,file)]);
  const musicFile=path.join(root,"public/music/manifest.json"),music=JSON.parse(fs.readFileSync(musicFile));
  music.tracks["nozomi-home"]={url:"/music/shenmue1/nozomi-home-cdda05.ogg",label:"Nozomi's ride home",durationSeconds:pcm.length/176400,loop:false,
    source:{format:"CDDA",disc:3,track:5,lba:180906,sectorBytes:2352,offset:352800,byteLength:pcm.length,sha256:sha256(pcm),trackSha256:sha256(bytes),sampleRate:44100,channels:2,sampleFormat:"s16le",
      adaptation:"Original124.79-second CD audio paired with124.27-second riding montage after the dialogue; cue/playlist order authored, not recovered CDDA-controller execution."}};
  fs.writeFileSync(musicFile,JSON.stringify(music,null,2)+"\n");runtimePaths.push(file,"public/music/manifest.json");
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...runtimePaths],{cwd:root,stdio:"inherit"});
console.log(`Built ${activities.length} original ride-home clips (${activities.reduce((n,a)=>n+a.durationFrames,0)/30}s); existing sequence compiler owns playback.`);
