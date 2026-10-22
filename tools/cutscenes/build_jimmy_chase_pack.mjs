#!/usr/bin/env node
// Original presentations around an authored chase. No DYNAMICS/controller
// execution or writable native story state is required by this compiler.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=(disc,relative)=>path.join(process.env[`SHENMUE_DISC${disc}_EXTRACTED_ROOT`]||path.join(root,`extracted_disc${disc}_v2`),`data/SCENE/0${disc}`,relative);
const evidence="docs/design/story-ticket-journey.md#jimmy-chase-and-interrogation";
const archiveHash="af1eaba80d5e541628a7c857580da821cda22ccf6d7476e2876e83287c2bdc6f";
const motionSize=109636,motionHash="4dbcbb542acb25fc897a82581ec2203bb3ea6caa611d7392c2bc657f2545583c";
const profiles=[
  {id:"jimmy-knock",auth:"SEQDATA3.AUTH",size:8948,hash:"0fcf0f89116fea159cf2617767112a1a13e909ac71f01f3879fb95700c54e43f",frames:550,
    actors:["DOR1","JIMY","AKIR","DOR2"],motionArchive:"CTERMO2.PKS",motionArchiveHash:"66cb4e4f5aa934af906a9c82a60028c73b6ad0f7043ea38bd873516bbd77d3da",motionSize:109660,motionHash:"0c8812bb1538dc4a06998b67d9de3acb3cdb5aa0cd7ddcb9d42d1ebf3b99b85a",
    stream:"01JIMB",streamHash:"69b911a894d83b73b9abc70650c60b761046e08597b510f33bac3166328cc463",sound:"A1_JIMMA.SND",soundHash:"8a883e707d3ad32ee4e0bd00c1c3203c27936759c189f58fdda01bb805252dc1"},
  {id:"jimmy-caught",auth:"SEQDATA1.AUTH",size:8760,hash:"9d7f3031ca8a4af6b63450db3e056f537a18a9d6e883a5a0edb6737974dc1f68",frames:650,actors:["CAR_","JIMY","AKIR"],
    stream:"01JIM",streamHash:"5c8b34e73fc7fd6551ede3e301ef4d80ec6b634f774d78d5b76572305f79b29e",sound:"A1_JIMSE.SND",soundHash:"02f51b8a9b3d01b92d1941f84ba354484f26d3462325c343012527df275e7915"},
  {id:"jimmy-escaped",auth:"SEQDATA2.AUTH",size:6856,hash:"32f9be51b3af5e29119d94296d4fbfa98a712a37be816786b2bc7325bbc831cb",frames:310,actors:["CAR_","JIMY","AKIR"],
    stream:"01JIM",streamHash:"5c8b34e73fc7fd6551ede3e301ef4d80ec6b634f774d78d5b76572305f79b29e",sound:"A1_JIMSI.SND",soundHash:"82df4cbd5136739209d92b8eec2b63f3a49fce50c659ee599acd3cfb6347271e"},
  {id:"jimmy-interrogation",auth:"A0174.AUTH",size:17424,hash:"be90144b021082280a7fba68f69870fafd332e6df3c4061603d5119dc873cb1f",frames:2005,actors:["AKIR","JIMY"],
    streamDisc:3,stream:"A0174",streamHash:"ea45785153858b21fc78df9aee666252aadb6cabb8682bc2e7e8c862576307c2",sound:"A1_HIJYM.SND",soundHash:"dc1c85c3f7624583337678486932959d28409f32127abe30d40649c55b01fa10"},
];
const runtimePaths=[];
for(const p of profiles){
  const interrogation=p.id==="jimmy-interrogation",prefix=`play/assets/dobuita/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const members=interrogation?[
    {name:p.auth,sourcePath:source(2,"ARAR/MAPINFO.BIN"),sourceManifestPath:"disc2/SCENE/02/ARAR/MAPINFO.BIN",sourceOffset:0xaa6c,sourceSha256:"e5adb7020c8c0704316adc482881b77ce9660f59c97f946ab2735e8ac9612c98",byteLength:p.size,sha256:p.hash},
    {name:"M_0174.BIN",sourcePath:source(2,"ARAR/M_0174.BIN"),sourceManifestPath:"disc2/SCENE/02/ARAR/M_0174.BIN",byteLength:186068,sha256:"6c2f1612abd7a177b5683bb68c8b5a4f14e01bf4a559516f48dffa49729b83ba"},
  ]:[
    {name:p.auth,sourcePath:source(2,"D000/CTERMO1.PKS"),sourceManifestPath:"disc2/SCENE/02/D000/CTERMO1.PKS",archiveMember:p.auth,sourceSha256:archiveHash,byteLength:p.size,sha256:p.hash},
    {name:"M_01JIM.MOTN",sourcePath:source(2,`D000/${p.motionArchive||"CTERMO3.PKS"}`),sourceManifestPath:`disc2/SCENE/02/D000/${p.motionArchive||"CTERMO3.PKS"}`,archiveMember:"M_01JIM.MOTN",sourceSha256:p.motionArchiveHash||"715a5ee482da7b4b6ef93e61e42eb3ce1006e69d8d958dd7e508c8daacc789aa",byteLength:p.motionSize||motionSize,sha256:p.motionHash||motionHash},
  ];
  const banks=[{bank:interrogation?32:16,member:interrogation?"M_0174.BIN":"M_01JIM.MOTN"}];
  if(p.id==="jimmy-escaped"){
    members.push({name:"MOTION.BIN",sourcePath:path.join(root,".disc-work/runtime-motion/MOTION.BIN"),sourceManifestPath:"canonical raw MOTION.BIN",byteLength:1826804,sha256:"aca6a41b967b9f9f92ad847c9495e780058b8194e359bca9a9c2763b0d337b23"});
    banks.push({bank:0,member:"MOTION.BIN",parseOptions:{sequenceIndices:[64]}});
  }
  const props=Object.fromEntries(p.actors.filter(t=>["DOR1","DOR2"].includes(t)).map(tag=>[tag,{model:"unmapped-original-door-reference",browserFilename:`CTERMO1-${tag}-reference`,referenceOnly:true}]));
  const outputMembers=[],generatedAssets=[];
  if(p.actors.includes("CAR_")){
    // Authored vehicle choice from the original CTERBASE prop collection;
    // no recovered CAR_ -> model association is claimed. Inspect the render.
    const model="C85N305G.CHRM";
    members.push({name:model,sourcePath:source(2,"D000/CTERBASE.PKS"),sourceManifestPath:"disc2/SCENE/02/D000/CTERBASE.PKS",archiveMember:model,sourceSha256:"786c76f3846f2faf179afeb55c8ff0143e3214d7d6d05dfefb396fac794e6257",byteLength:23332,sha256:"980c521aa023467867024ecdc5411b7780e25ed5ce794d4f180f2ba7b1403c46"});
    outputMembers.push(model);props.CAR_={model:"C85N305G",browserFilename:model,assetPath:`${prefix}/${model}`,textureAssetPath:`${prefix}/textures.bin`};
    const textures=fs.readFileSync(source(2,"D000/CTERBASE.PKF"));
    if(sha256(textures)!=="0f9028c137fa4df057fad9b8e3e06f09ba98dfc82917977e7ef63ad29010551f")throw Error("Changed original chase vehicle textures");
    generatedAssets.push({assetPath:`${prefix}/textures.bin`,bytes:extractNativeTexnPack(textures,"CTERBASE.PKF").bytes});
  }
  const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_jimmy_chase_pack.mjs",resourceName:interrogation?"A0174":"CTERMO1",disc:2,
    sourceMembers:members,expectedMembers:members,bindingEvidence:evidence,selectionRule:"Reviewed authored chapter order; normalized local slot, not native owner selection.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
    motionBanks:banks,activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:p.auth,actors:p.actors,durationFrames:p.frames}],
    packageActors:{JIMY:{label:"Jimmy Yan",modelCode:"JIM_M",browserFilename:"JIM_M.CHRM",assetFormat:"MT5",characterScale:1,assetPath:"play/assets/characters/JIM_M.CHRM",textureAssetPath:"play/assets/characters/JIM_textures.bin"}},
    sceneObjects:props,outputMembers,generatedAssets,
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built ${p.id}: ${manifest.activities[0].durationSeconds.toFixed(2)} seconds`);
  if(!process.argv.includes("--audio"))continue;
  const disc=p.streamDisc||2;
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_jimmy_chase_pack.mjs",disc,
    authDirectory:path.join(root,prefix),authFiles:[p.auth],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:`${p.stream}.AFS`,path:source(disc,`STREAM/${p.stream}.AFS`),manifestPath:`disc${disc}/SCENE/0${disc}/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    ...(p.id==="jimmy-knock"||p.id==="jimmy-caught"?{unavailableVoices:{[p.id==="jimmy-knock"?"01JIMBA004.str":"01JIMB001.str"]:{
      reason:"This exact AUTH voice reference is absent from the original archive directory; retain its cue without substitute speech.",
      evidence:`disc2/SCENE/02/STREAM/${p.stream}.AFS member directory`,
    }}}:{}),
    soundBank:{label:p.sound,path:source(disc,`SOUND/${p.sound}`),manifestPath:`disc${disc}/SCENE/0${disc}/SOUND/${p.sound}`,sha256:p.soundHash},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  console.log(`Built ${p.id} audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
