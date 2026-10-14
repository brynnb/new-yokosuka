#!/usr/bin/env node
// Presentation assets only. The authoritative combat/Yarn run owns progression.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(sourceRoot,"data/SCENE/02",p);
const archive=fs.readFileSync(source("JD00/KSBT.PKS")),archiveHash="11182ddb5fa24e4342a548ffee18646cafc20dd37dd7f5f13ba05c6a62a6a33a";
if(sha256(archive)!==archiveHash)throw Error("Changed original Gui Zhang encounter archive");
const map=fs.readFileSync(source("JD00/MAPINFO.BIN"));
if(sha256(map)!=="218dbd969148b157828e374d256cfd874e712069f7936b01c94b9eea906d178d")throw Error("Changed original KSBT resource associations");
const members=parseIpacActivityArchive(archive).members;
const prefix="play/assets/sakuragaoka/gui-zhang",audioPrefix="public/audio/world/gui-zhang";
const profiles=[
  {slot:0,file:"SEQDATA0.AUTH",durationFrames:950,frameCount:24,actors:["AKIR","KISY"],audio:"introduction",sound:"A1_TAIKE.SND",soundHash:"797b73c37b9e6fa48d125ea15dca8b7f90ee162ce3be61653e4ec3cf22b9ff0c",music:"BGM116.SND",musicHash:"7a535517ecb860f4413959ab1ef9db91b5295420440b176c61f296348b62c14c"},
  {slot:1,file:"SEQDATA1.AUTH",durationFrames:2070,frameCount:43,actors:["AKIR","CHAI","KISY"],audio:"bodyguard",sound:"A1_BDYGD.SND",soundHash:"ae9e22ee9098efc2a11837fc33cf70f2791dadd6c8074615770ccdb6c896e2ad",music:"BGM024.SND",musicHash:"0860ea79d20df861d95764d5d9e3f9d2e2345ea6c4806c7cd6cb6515fb892384"},
];
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_gui_zhang_encounter_pack.mjs",resourceName:"KSBT",disc:2,
  sourcePath:source("JD00/KSBT.PKS"),sourceManifestPath:"disc2/SCENE/02/JD00/KSBT.PKS",archiveSha256:archiveHash,
  expectedMembers:members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:"docs/design/story-event-template.md#gui-zhangs-street-encounter",
  selectionRule:"Borrow original AUTH-extension ordinals 0/1 around real server-timed combat; no native-owner reconstruction.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  motionBanks:[{bank:16,member:"M_0167.MOTN"}],
  activities:profiles.map(p=>({slot:p.slot,primaryPointer:0,secondaryPointer:0,file:p.file,durationFrames:p.durationFrames,frameCount:p.frameCount,actors:p.actors})),
});
console.log("Built original KSBT introduction and bodyguard presentation");
if(process.argv.includes("--audio")){
  const vgmstream=process.env.VGMSTREAM_CLI;
  if(!vgmstream)throw Error("Set VGMSTREAM_CLI to the existing native audio tool");
  const dtpkDump=process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py");
  const paths=[`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)];
  const musicPath=path.join(root,"public/music/manifest.json"),music=JSON.parse(fs.readFileSync(musicPath));
  const viewer=JSON.parse(fs.readFileSync(path.join(root,"public/music/asset-viewer-manifest.json")));
  for(const p of profiles){
    const audioPath=`${audioPrefix}/${p.audio}`;
    const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_gui_zhang_encounter_pack.mjs",disc:2,
      authDirectory:path.join(root,prefix),authFiles:[p.file],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
      stream:{label:"A0167.AFS",path:source("STREAM/A0167.AFS"),manifestPath:"disc2/SCENE/02/STREAM/A0167.AFS",sha256:"9866e5b011c0db4602f6fb92cebb22c3a19623a704152088e7cd4b7cac3ad079"},
      soundBank:{label:p.sound,path:source(`SOUND/${p.sound}`),manifestPath:`disc2/SCENE/02/SOUND/${p.sound}`,sha256:p.soundHash},
      outputDirectory:path.join(root,audioPath),outputAssetPrefix:audioPath,dtpkDump,vgmstream,python:process.env.DTPK_PYTHON||"python3",
    });
    paths.push(`${audioPath}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
    const track=Object.values(viewer.tracks).find(t=>t.source.file===p.music);
    if(!track?.ogg_url||track.source.bankSha256!==p.musicHash||!map.includes(Buffer.from(p.music.toLowerCase())))throw Error(`Changed original ${p.music} association`);
    music.tracks[p.music.split(".")[0].toLowerCase()]={url:track.ogg_url,label:`Gui Zhang — ${p.audio}`,durationSeconds:track.durationSeconds,loop:true,source:track.source};
    paths.push(`public${track.ogg_url}`);
    console.log(`Built ${p.audio}: ${audio.voices.length} voices, ${audio.sounds.length} effects`);
  }
  fs.writeFileSync(musicPath,JSON.stringify(music,null,2)+"\n");paths.push("public/music/manifest.json");
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(paths)],{cwd:root,stdio:"inherit"});
}
