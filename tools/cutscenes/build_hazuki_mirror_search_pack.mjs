#!/usr/bin/env node
// The two original family conversations share the existing activity/audio
// compilers. Their authored Story sequence does not execute room-controller code.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(sourceRoot,"data/SCENE/02",p);
const map=fs.readFileSync(source("JHD0/MAPINFO.BIN"));
if(sha256(map)!=="09bc11af0ea9d9bb8496fc8da74e15f3dfc2e667a4b0572726f24873c4d9c466")throw Error("Changed original family scene associations");
const profiles=[{
  id:"family-fuku",resource:"SORA",archiveHash:"4612acfca36f4b303fcc928d710f42cee713cac15d80e087166d1feaf66cbb2b",
  motion:"M_01SOR.MOTN",activities:[["SEQDATS0.AUTH",280,18],["SEQDATS1.AUTH",1630,36]],actors:["AKIR","FUKU"],
  stream:"01SOR",streamHash:"79a7ebea404ad420c341d06f1934dfc44867ac743b4072ed00a51ea72c8008b9",
  sound:"A1_FUKAY.SND",soundHash:"c6e17b9a5d3a3529629ae74ec8f22587f8be7a9dfe0aec51850a361f7bb10736",
},{
  id:"family-ine",resource:"INEK",archiveHash:"2b94364ecf97a89eae19615f9efb701bb4f970ceee07244bb861a0c721d4f479",
  motion:"M_01MIR.MOTN",activities:[["SEQDATA1.AUTH",2460,72]],actors:["AKIR","INE_"],
  stream:"01MIR",streamHash:"6ad07cee430c53e6f952d246b7b7207d8873f12f8f687dbf521f5c32b48beca7",
  sound:"A1_INEKO.SND",soundHash:"1f924f204d704c6020b5cd43f42cc246991a819c5d44b491145d9f36fda49cd0",
  unavailableVoices:{"01MIRA006.str":{
    reason:"This exact AUTH-authored voice is absent from both the original 01MIR.AFS and its IDX directory; cue timing is retained without substitute speech.",
    evidence:"disc2/SCENE/02/STREAM/01MIR.AFS and 01MIR.IDX",
  }},
}];
const runtimePaths=[];

for(const p of profiles){
  const archive=fs.readFileSync(source(`JHD0/${p.resource}.PKS`));
  if(sha256(archive)!==p.archiveHash)throw Error(`Changed original ${p.resource} archive`);
  if(!map.includes(Buffer.from(p.resource))||!map.includes(Buffer.from(p.sound.toLowerCase())))throw Error(`Missing original ${p.resource} resource association`);
  const members=parseIpacActivityArchive(archive).members;
  const prefix=`play/assets/hazuki/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const manifest=buildNativeAseqActivityPack({
    generatedBy:"tools/cutscenes/build_hazuki_mirror_search_pack.mjs",resourceName:p.resource,disc:2,
    sourcePath:source(`JHD0/${p.resource}.PKS`),sourceManifestPath:`disc2/SCENE/02/JHD0/${p.resource}.PKS`,archiveSha256:p.archiveHash,
    expectedMembers:members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
    bindingEvidence:"docs/design/story-event-template.md#family-lead-to-the-antique-shop",
    selectionRule:"Borrow original AUTH-extension ordinals with zero pointer bindings; authored sequence, not recovered room-owner branching.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
    motionBanks:[{bank:16,member:p.motion}],
    activities:p.activities.map(([file,durationFrames,frameCount],slot)=>({slot,primaryPointer:0,secondaryPointer:0,file,durationFrames,frameCount,actors:p.actors})),
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built original ${p.resource} family presentation`);
  if(!process.argv.includes("--audio"))continue;
  const first=paths=>paths.filter(Boolean).find(fs.existsSync);
  const dtpkDump=first([process.env.DTPK_DUMP,path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py")]);
  const vgmstream=first([process.env.VGMSTREAM_CLI,path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli")]);
  if(!dtpkDump||!vgmstream)throw Error("Set DTPK_DUMP and VGMSTREAM_CLI to the existing native audio tools");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_hazuki_mirror_search_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:p.activities.map(a=>a[0]),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:"docs/design/story-event-template.md#family-lead-to-the-antique-shop",
    stream:{label:`${p.stream}.AFS`,path:source(`STREAM/${p.stream}.AFS`),manifestPath:`disc2/SCENE/02/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:p.sound,path:source(`SOUND/${p.sound}`),manifestPath:`disc2/SCENE/02/SOUND/${p.sound}`,sha256:p.soundHash},
    unavailableVoices:p.unavailableVoices,outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump,vgmstream,python:process.env.DTPK_PYTHON||"python3",
  });
  console.log(`Built ${p.resource}: ${audio.voices.length} voices and ${audio.sounds.length} original effects`);
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
}

if(process.argv.includes("--audio")){
  // Reuse the existing hash-pinned viewer render rather than re-rendering or
  // substituting a similarly named track. MAPINFO associates BGM077 with INEK.
  const musicPath=path.join(root,"public/music/manifest.json");
  const music=JSON.parse(fs.readFileSync(musicPath));
  const viewer=JSON.parse(fs.readFileSync(path.join(root,"public/music/asset-viewer-manifest.json")));
  const track=Object.values(viewer.tracks).find(t=>t.source.file==="BGM077.SND");
  if(!track?.ogg_url||track.source.bankSha256!=="d3497927d65c56f12589029ecb7502786ba38ca8c23040741b70121dce1ba076")throw Error("Changed INEK music source");
  music.tracks.bgm077={url:track.ogg_url,label:"Ine-san's Concern",durationSeconds:track.durationSeconds,loop:true,source:track.source};
  fs.writeFileSync(musicPath,JSON.stringify(music,null,2)+"\n");
  runtimePaths.push("public/music/manifest.json",`public${track.ogg_url}`);
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
}
