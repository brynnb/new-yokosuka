#!/usr/bin/env node
// Exact embedded presentation; the existing Yarn transaction owns possession.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const source = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root,"extracted_files");
const mapPath = path.join(source,"data/SCENE/01/JOMO/MAPINFO.BIN");
const mapHash = "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9";
if(sha256(fs.readFileSync(mapPath))!==mapHash)throw new Error("Chinese-letter room source changed");
const prefix="play/assets/hazuki/chinese-letter", directory=path.join(root,prefix);
const common=path.join(source,"data/SCENE/01/JOMO/COMMON01.PKS");
const members=[
  {name:"LETTER.AUTH",sourcePath:mapPath,sourceManifestPath:"extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",sourceOffset:0xa8860,
    sourceSha256:mapHash,byteLength:22008,sha256:"6505ad7b3c4ad0266bfb15d1849d5e7e4a77105d5a0bd54fd0d2e428bd065572"},
  {name:"M_01CRY.MOTN",sourcePath:common,sourceManifestPath:"extracted_files/data/SCENE/01/JOMO/COMMON01.PKS",archiveMember:"M_01CRY.MOTN",
    sourceSha256:"4b117711c45ca0a94690ce14b8896ddb5feacfde0ba5c7f2a13ae5310201ba22",byteLength:44008,sha256:"754b8ad7a98beeaf0c7e6d999b6be50aa77d51a37e6451c62fea5401f232f81f"},
];
const models=[
  ["MALS501G.MT5",19200,"4203fa2bcf8c60b676df5230bc36ef316e542e8d55c723b6bc1715171b8b6ac6"],
  ["TTMS246G.MT5",6544,"962072e865b9032240941128962c889f03ed2f4f1c50eb4fdcc136318b435cb3"],
];
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_chinese_letter_assets.mjs",resourceName:"01CRY",disc:1,
  sourceMembers:members,expectedMembers:members,selectionRule:"exact JOMO embedded AUTH at 0xa8860; package slot 0 is not a claimed native slot",
  bindingEvidence:"docs/design/story-event-template.md#next-day-dojo-practice-and-the-chinese-letter",
  outputDirectory:directory,outputAssetPrefix:prefix,manifestPath:path.join(directory,"manifest.json"),
  audioManifest:"public/audio/world/chinese-letter/manifest.json",
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"LETTER.AUTH",actors:["MAIL","TTMI","AKIR","INE_"],durationFrames:2016}],
  motionBanks:[{bank:25,member:"M_01CRY.MOTN",parseOptions:{sequenceIndexBase:80},expectedSequences:[
    {index:81,name:"AKI_AUTO1_YAKUSOKU_0124"},{index:83,name:"JIJ_INE_AUTO1_YAKUSOKU_0124"},
  ]}],
  externalAssets:models.map(([filename,byteLength,sha256])=>({sourcePath:path.join(source,"data/SCENE/01/JOMO",filename),assetPath:`${prefix}/${filename}`,byteLength,sha256})),
  // The original resource cluster ending in A01124 at 0x99b12 names these
  // models, A1_INET2 and BGM115. MAIL/TTMI pairing is by the paper/
  // tatami model identities, not a claim of reconstructed allocation code.
  sceneObjects:Object.fromEntries([["MAIL","MALS501G"],["TTMI","TTMS246G"]].map(([tag,model])=>[tag,{
    model,browserFilename:`${model}.MT5`,assetPath:`${prefix}/${model}.MT5`,lifecycle:{kind:"auth-scoped"},
  }])),
  packageActors:{INE_:{label:"Ine-san",modelCode:"INE_M",browserFilename:"INE_M.CHRM",assetFormat:"MT5",characterScale:1,
    assetPath:"play/assets/INE_M.CHRM",textureAssetPath:"play/assets/INE_textures.bin"}},
});
if(!process.argv.includes("--activity-only")) {
  for(const key of ["VGMSTREAM_CLI","DTPK_DUMP"])if(!process.env[key])throw new Error(`${key} is required for original audio`);
  buildNativeAseqAudioPack({
    generatedBy:"tools/cutscenes/build_chinese_letter_assets.mjs",disc:1,
    authDirectory:directory,authFiles:["LETTER.AUTH"],authManifest:`${prefix}/manifest.json`,
    resourceBindingEvidence:"docs/design/story-event-template.md#next-day-dojo-practice-and-the-chinese-letter",
    stream:{label:"A01124.AFS",path:path.join(source,"data/SCENE/01/STREAM/A01124.AFS"),manifestPath:"extracted_files/data/SCENE/01/STREAM/A01124.AFS",sha256:"7ac4574163fbd50637288bcf2a16869c6b36a928ce7693bf8bd771ef85902d2d"},
    soundBank:{label:"A1_INET2.SND",path:path.join(source,"data/SCENE/01/SOUND/A1_INET2.SND"),manifestPath:"extracted_files/data/SCENE/01/SOUND/A1_INET2.SND",sha256:"24ad865f3ba2bed8bd8d1b7b7524513a4078718117204a8b6dc06fe18e4905e8"},
    outputDirectory:path.join(root,"public/audio/world/chinese-letter"),outputAssetPrefix:"public/audio/world/chinese-letter",
    dtpkDump:process.env.DTPK_DUMP,vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3",
  });
  // Reuse the already published, hash-pinned BGM115 render from the viewer.
  const musicPath=path.join(root,"public/music/manifest.json"),music=JSON.parse(fs.readFileSync(musicPath));
  const viewer=JSON.parse(fs.readFileSync(path.join(root,"public/music/asset-viewer-manifest.json")));
  const track=Object.values(viewer.tracks).find(t=>t.source.file==="BGM115.SND");
  if(!track?.ogg_url || track.source.bankSha256!=="c89a8b5b2c8537e3bfdf558d1c8df3b95a2566fcc15702eaae8a484a030be1bd")throw new Error("BGM115 source changed");
  music.tracks.bgm115={url:track.ogg_url,label:"Chinese Letter",durationSeconds:track.durationSeconds,loop:true,source:track.source};
  fs.writeFileSync(musicPath,JSON.stringify(music,null,2)+"\n");
  const audioDirectory=path.join(root,"public/audio/world/chinese-letter");
  const audioPaths=fs.readdirSync(audioDirectory,{recursive:true}).filter(f=>fs.statSync(path.join(audioDirectory,f)).isFile()).map(f=>`public/audio/world/chinese-letter/${f}`);
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path),...audioPaths,"public/music/manifest.json"],{cwd:root,stdio:"inherit"});
}
console.log("Built original Chinese-letter presentation. No story effects or asset publication performed.");
