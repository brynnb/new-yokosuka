#!/usr/bin/env node
// Original CATA3 films; Story eligibility and persisted progress stay in Yarn.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03");
const bindingBytes=fs.readFileSync(path.join(source,"JU00/CATA3.PKF"));
if(sha256(bindingBytes)!=="906e67e7c040e747464af938103a7e1b5dca240e5b5329ab7fe14bc04583afea")throw Error("Changed CATA3 binding archive");
const chrt=parseIpacActivityArchive(bindingBytes).members.find(m=>m.name==="CHARA.CHRT");
const bindings=chrt&&parseChrtSceneObjectBindings(chrt.bytes);
if(!bindings||bindings.length!==1||bindings[0].actorTag!=="DRUG"||bindings[0].model!=="NANHIL0G")throw Error("Changed CATA3 medicine binding");
const kitten=JSON.parse(fs.readFileSync(path.join(root,"play/assets/yamanose/cata1/manifest.json"))).packageActors.CATM;
const nozomi=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/nozomi-amulet/manifest.json"))).packageActors.HRSK;
const prefix="play/assets/yamanose/kitten-roof",audioPrefix="public/audio/world/kitten-roof";
const generatedBy="tools/cutscenes/build_kitten_roof_pack.mjs",evidence="docs/design/story-event-template.md#later-kitten-events-source-leads";
const members=[
  ["M_01CJP.MOTN",77748,"b37ced4d139db65c36f2cac2528cacd5752c55ffbca6035d16935ffcb4efde4b"],
  ["NANHIL0G.CHRM",1364,"48e6794a574527ac71098018078dbec30840e75f15d03783496cfde08b379f05"],
  ["SEQDATA0.AUTH",10540,"62cabc1ab2f9bb70eec018ea19d666acd2b10aa7e4770a5a9de67ab9692d8e04"],
  ["SEQDATA1.AUTH",28436,"bc5970277c65360e665c166f4ff80f207b6d2c988b62687ae29b86f3490b6df5"],
].map(([name,byteLength,hash])=>({name,byteLength,sha256:hash}));
const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:"CATA3",disc:3,
  sourcePath:path.join(source,"JU00/CATA3.PKS"),sourceManifestPath:"disc3/SCENE/03/JU00/CATA3.PKS",
  archiveSha256:"087f76f8e8a8d8e2dc1dbc61cb3998bcb1f9c41eda133ee6a12667690fdb0642",expectedMembers:members,
  bindingEvidence:evidence,selectionRule:"Original kitten roof and Nozomi medicine films; Story eligibility is separately authored.",
  audioManifest:`${audioPrefix}/manifest.json`,outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  outputMembers:["NANHIL0G.CHRM"],motionBanks:[{bank:16,member:"M_01CJP.MOTN"}],
  packageActors:{CATM:kitten,HRSK:nozomi},sceneObjects:{DRUG:{model:"NANHIL0G",image:"NANHIL0G",browserFilename:"NANHIL0G.CHRM",assetPath:`${prefix}/NANHIL0G.CHRM`,lifecycle:{kind:"native-composite-owner"},nativeBinding:{archive:"CATA3.PKF",archiveMember:"CHARA.CHRT",characterRecordOffset:bindings[0].characterRecordOffset,imagePropertyOffset:bindings[0].imagePropertyOffset,defImageRecordOffset:bindings[0].defImageRecordOffset}}},
  activities:[
    {slot:0,binding:{kind:"map-embedded-slot"},file:"SEQDATA0.AUTH",durationFrames:1157,frameCount:56,actors:["AKIR","MEGM","CATM"],commandCounts:{camera:1,move:3,motion:13,sound:18,effect:17,voice:13}},
    {slot:1,binding:{kind:"map-embedded-slot"},file:"SEQDATA1.AUTH",durationFrames:870,frameCount:46,actors:["DRUG","HRSK","CATM","AKIR","MEGM"],commandCounts:{camera:1,move:5,motion:22,effect:14,sound:10,voice:9}},
  ]});
const outputs=[`${prefix}/manifest.json`,...manifest.outputs.map(row=>row.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:3,authDirectory:path.join(root,prefix),authFiles:["SEQDATA0.AUTH","SEQDATA1.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01CJP.AFS",path:path.join(source,"STREAM/01CJP.AFS"),manifestPath:"disc3/SCENE/03/STREAM/01CJP.AFS",sha256:"0288c4c5317409b3f9df94ee1b5aaf6f4772ea9c379400aba7e66b781fa31e29"},
    soundBank:{label:"A1_NEKOT.SND",path:path.join(source,"SOUND/A1_NEKOT.SND"),manifestPath:"disc3/SCENE/03/SOUND/A1_NEKOT.SND",sha256:"7ee9ffea5275fd8f0d8eb60a0b10ee1ba900b7b0b25741945db8ba161a152392"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3"});
  outputs.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(row=>row.asset).map(row=>row.asset));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(outputs)],{cwd:root,stdio:"inherit"});
console.log("Prepared original CATA3 presentations; Story triggers are separate.");
