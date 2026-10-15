#!/usr/bin/env node
// Three exact embedded presentations, translated with the existing shared
// activity/audio compilers. Yarn, not the original room controller, saves progress.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const map=path.join(source,"JOMO/MAPINFO.BIN"),common=path.join(source,"JOMO/COMMON02.PKS");
const mapHash="6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe";
const commonHash="916aab45137cf340516a1cdd2ee61540e7c6562a1e92c5f932e9055ae0db3b89";
const evidence="docs/design/story-event-template.md#home-and-travel-funds";
const actor=(label,code)=>{
  const prefix=code==="FUK_M"?"play/assets/characters":"play/assets";
  return {label,modelCode:code,browserFilename:`${code}.CHRM`,assetFormat:"MT5",characterScale:1,
    assetPath:`${prefix}/${code}.CHRM`,textureAssetPath:`${prefix}/${code.slice(0,3)}_textures.bin`};
};
const profiles=[
  {id:"post-chen-home",resource:"A0160",offset:0xb7ff4,size:3276,hash:"5d559c6b948d565b4755ebdcaf04fc6d7d7276e8d5087a8c6b1a6b81e901e9e2",frames:650,
    motion:"M_0160.MOTN",motionSize:7456,motionHash:"f7b5e2410d8bf9bcb5e31372f1b69dceea706e1a26e975fc262ad73165040a62",bank:25,base:112,actors:["AKIR","FUKU"],
    stream:"A0160",streamHash:"9895738da8b143f1ea3930a66beef9492fc82e9eb0856014878d7db1606c4a49",sound:"A1_HUKHE.SND",soundHash:"f05518358966ff53f5f6ebda47710ead4d0f11a7dc9605e336a0da2bc17f7b10"},
  {id:"bank-savings",resource:"01BNK",offset:0xa0ef4,size:26476,hash:"e6664ffb1698433742c5877e389fe8376455959ad4ffd0a1f54fad0126376101",frames:756,
    motion:"M_01BK.MOTN",motionSize:10544,motionHash:"5601ff6d9cebf5a6a2ad125cb5ab3d427e319a17bcc364718f148ddbcd61ae9e",bank:24,base:0,actors:["BANK","AKIR"],
    stream:"01BNK",streamHash:"8c9326d2fc8bfa27d4599f9b42f6a38c8300cb25ef0402eb98ed52292656c0c0",sound:"A1_TUMIR.SND",soundHash:"8d3f347ce7aa7f870074cf0a09ffd3a94f83b012bead47aa63ab827d4b1c4c7c"},
  {id:"travel-family",resource:"01EAR",offset:0xb4460,size:15244,hash:"f7196a33095b31f38643bb19b1c6aba99f683d714592a9c26012df9a3f105318",frames:2467,
    motion:"M_01EAR.MOTN",motionSize:63684,motionHash:"e5d9f9571a52363b2d338897b7062806fc43dd4ff8d62d53b06691c27d926649",bank:25,base:144,actors:["AKIR","INE_","FUKU"],
    stream:"01EAR",streamHash:"f29867ee43becb0b3d502df754bc03d5ea4882bdd7e073038115098e73e8a76e",sound:"A1_KIKUM.SND",soundHash:"1796869c37bc441211d7e2478f56af77883e9d97492838d115dc941c05ddbc32"},
];
const runtimePaths=[];
for(const p of profiles){
  const prefix=`play/assets/hazuki/${p.id}`,audioPrefix=`public/audio/world/${p.id}`;
  const members=[
    {name:`${p.resource}.AUTH`,sourcePath:map,sourceManifestPath:"disc2/SCENE/02/JOMO/MAPINFO.BIN",sourceOffset:p.offset,sourceSha256:mapHash,byteLength:p.size,sha256:p.hash},
    {name:p.motion,sourcePath:common,sourceManifestPath:"disc2/SCENE/02/JOMO/COMMON02.PKS",archiveMember:p.motion,sourceSha256:commonHash,byteLength:p.motionSize,sha256:p.motionHash},
  ];
  const props={};let generatedAssets=[];
  if(p.id==="bank-savings"){
    // The original room's bank-scene resource cluster names $BNKT2DBG.MT5
    // immediately before 01BNK. Its AMOV already owns the full book trajectory.
    const file="BNKT2DBG.MT5",textureSource=fs.readFileSync(path.join(source,"JOMO/MPK00.PKF"));
    if(sha256(textureSource)!=="6dd037556b29ba3731f0c1e9a3013ad5e84ec67a07b04f2185f5fb3338588888")throw Error("Changed bankbook textures");
    members.push({name:file,sourcePath:path.join(source,"JOMO",file),sourceManifestPath:`disc2/SCENE/02/JOMO/${file}`,byteLength:57340,sha256:"1ba59f425eb7cd90f598a4571569c3eefd4fa530dab65c5876edc7f6283a72f5"});
    props.BANK={model:"BNKT2DBG",browserFilename:file,assetPath:`${prefix}/${file}`,textureAssetPath:`${prefix}/textures.bin`};
    generatedAssets=[{assetPath:`${prefix}/textures.bin`,bytes:extractNativeTexnPack(textureSource,"JOMO/MPK00.PKF").bytes,
      source:{path:"disc2/SCENE/02/JOMO/MPK00.PKF",sha256:sha256(textureSource)}}];
  }
  const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_home_ticket_pack.mjs",resourceName:p.resource,disc:2,
    sourceMembers:members,expectedMembers:members,bindingEvidence:evidence,
    selectionRule:"Exact embedded AUTH selected by authored chapter order. Slot 0 is a package-local handle, not a recovered native story selector.",
    outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
    motionBanks:[{bank:p.bank,member:p.motion,parseOptions:{sequenceIndexBase:p.base}}],
    activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:`${p.resource}.AUTH`,actors:p.actors,durationFrames:p.frames}],
    packageActors:{...(p.actors.includes("FUKU")?{FUKU:actor("Masayuki Fukuhara","FUK_M")}:{}),...(p.actors.includes("INE_")?{INE_:actor("Ine-san","INE_M")}: {})},
    ...(Object.keys(props).length?{sceneObjects:props,outputMembers:["BNKT2DBG.MT5"],generatedAssets}:{}),
  });
  runtimePaths.push(`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path));
  console.log(`Built ${p.id}: ${manifest.activities[0].durationSeconds.toFixed(2)} seconds`);
  if(!process.argv.includes("--audio"))continue;
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_home_ticket_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:[`${p.resource}.AUTH`],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:`${p.stream}.AFS`,path:path.join(source,`STREAM/${p.stream}.AFS`),manifestPath:`disc2/SCENE/02/STREAM/${p.stream}.AFS`,sha256:p.streamHash},
    soundBank:{label:p.sound,path:path.join(source,"SOUND",p.sound),manifestPath:`disc2/SCENE/02/SOUND/${p.sound}`,sha256:p.soundHash},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  runtimePaths.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset));
  console.log(`Built ${p.id} audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
