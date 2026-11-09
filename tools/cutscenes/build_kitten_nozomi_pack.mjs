#!/usr/bin/env node
// Original shrine film. Its Story selection and saved outcome are separate.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack,registerNativeAseqMusic} from "../lib/NativeAseqAudioPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const map=fs.readFileSync(path.join(source,"JU00/MAPINFO.BIN"));
if(sha256(map)!=="3a565890be5cf3a746119b63e8b5aac4cdc5396f8ea8ea3d0f35ba9fb79264c5")throw Error("Changed JU00 map controller");
// The source record names the sequence, music and sound bank together.
for(const [offset,value] of [[0x4d794,"01MUT"],[0x4d79a,"seqdata0.bin"],[0x4d7a7,"CATA2"],[0x4d7cb,"bgm018.snd"],[0x4d7d6,"a1_ryodk.snd"]]){
  if(map.subarray(offset,offset+value.length).toString("ascii")!==value)throw Error(`Changed original scene binding at ${offset.toString(16)}`);
}
const kitten=JSON.parse(fs.readFileSync(path.join(root,"play/assets/yamanose/cata1/manifest.json"))).packageActors.CATM;
const nozomi=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/nozomi-amulet/manifest.json"))).packageActors.HRSK;
const prefix="play/assets/yamanose/kitten-nozomi",audioPrefix="public/audio/world/kitten-nozomi";
const generatedBy="tools/cutscenes/build_kitten_nozomi_pack.mjs",evidence="docs/design/story-event-template.md#later-kitten-events-source-leads";
const members=[
  ["DANM400G.CHRM",2636,"a34211b0f17aa553059312bd098f755e7fa95483bcd5d95a8deae88e3318f452"],
  ["M_01CAT.MOTN",366692,"01489797ac2fb1db34bb63659b418672160c4d0a2fdd4d6bc5fbcc5073a04f42"],
  ["SEQDATA0.AUTH",13840,"b1afaf2acb206ec14ea1d98c4a870fc00a2a27bb9592bef48feed2574c04065f"],
  ["SEQDATA3.AUTH",20616,"eb103793ecfe4fbb10e76ae611f6be47ff08026fa010bf62d85c7a9d50d1a60d"],
].map(([name,byteLength,hash])=>({name,byteLength,sha256:hash}));
const manifest=buildNativeAseqActivityPack({generatedBy,resourceName:"CATA2",disc:2,
  sourcePath:path.join(source,"JU00/CATA2.PKS"),sourceManifestPath:"disc2/SCENE/02/JU00/CATA2.PKS",
  archiveSha256:"5d028873e0f399c4a0d5b829dc6bfee08e397ad71b7e91d2c9c57659bf292c34",expectedMembers:members,
  bindingEvidence:evidence,selectionRule:"Original Ryo, kitten and Nozomi shrine film; Story eligibility is separately authored.",
  audioManifest:`${audioPrefix}/manifest.json`,outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  outputMembers:[],motionBanks:[{bank:16,sourcePath:path.join(root,"play/assets/yamanose/cata1/M_01CAT.MOTN"),assetPath:"play/assets/yamanose/cata1/M_01CAT.MOTN",byteLength:366692,sha256:"01489797ac2fb1db34bb63659b418672160c4d0a2fdd4d6bc5fbcc5073a04f42"}],
  packageActors:{CATM:kitten,HRSK:nozomi},sceneObjects:{},
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"SEQDATA0.AUTH",durationFrames:1617,frameCount:81,actors:["AKIR","CATM","HRSK"],commandCounts:{camera:1,move:3,motion:17,sound:30,effect:29,voice:12}}]});
const outputs=[`${prefix}/manifest.json`,...manifest.outputs.map(row=>row.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:2,authDirectory:path.join(root,prefix),authFiles:["SEQDATA0.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01MUT.AFS",path:path.join(source,"STREAM/01MUT.AFS"),manifestPath:"disc2/SCENE/02/STREAM/01MUT.AFS",sha256:"759b0dc7bcd5b6e5539ca0ccfbef18d7f03167968da7350680622c4152ce7971"},
    soundBank:{label:"A1_RYODK.SND",path:path.join(source,"SOUND/A1_RYODK.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_RYODK.SND",sha256:"f9be967cefd06f7d3de735507ec7eaae4ec60d0b1051d6430a38c89747700bba"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3"});
  outputs.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(row=>row.asset).map(row=>row.asset));
  outputs.push(...registerNativeAseqMusic(root,{id:"bgm018",sourceId:"dffd8afab6007bfabeddc7e582a249946bc0e2c31482618d39e5397d894e3b26",bankHash:"33219550d3119a4805c815a39d3fb3b13fc939e7b40a2bf703104324dc9c391a",label:"Ryo and Nozomi"}));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(outputs)],{cwd:root,stdio:"inherit"});
console.log("Prepared the original shrine film; Story triggers are separate.");
