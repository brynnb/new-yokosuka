#!/usr/bin/env node
// Original AUTH presentation inside an authored Story event, not a replacement
// room controller. Body/camera/voices stay exact; prop transition timing below
// is an explicit adaptation using the already reviewed attachment transforms.
import fs from "node:fs";
import path from "node:path";
import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { DOBUITA_PHONE_BOOK_ATTACHMENTS } from "../../src/DobuitaPhoneBookInteraction.js";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root,"extracted_files");
const source=relative=>path.join(sourceRoot,"data/SCENE/01",relative);
const prefix="play/assets/dobuita/phone-book";
const textureArchive=fs.readFileSync(source("D000/AUTH.PKF"));
if(sha256(textureArchive)!=="139591cf3a0b77b6b5361db7aa3aa93b80189371218a0f5cb0263a86175e7c91")throw Error("Changed original book texture archive");
const textures=extractNativeTexnPack(textureArchive,"D000/AUTH.PKF");
if(sha256(textures.bytes)!=="99c8f494c35d75ca84b98cbd733aecb153177407d7e16e92a16ff76276e6d75b")throw Error("Changed book TEXN output");
const binding={kind:"map-embedded-slot",activityId:"01TEL/SEQDATA0.AUTH"};
const attach=(state,frame)=>{
  const a=DOBUITA_PHONE_BOOK_ATTACHMENTS[state];
  return {activitySlot:0,frame,parentActorTag:a.parentTag,controlId:a.modelControlId,translation:a.translation,rotationRaw:a.rotationRaw};
};
const visible=(frame,value)=>({activitySlot:0,frame,visible:value});
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_phone_book_activity_pack.mjs",disc:1,resourceName:"01TEL",
  sourcePath:source("D000/AUTH.PKS"),sourceManifestPath:"extracted_files/data/SCENE/01/D000/AUTH.PKS",
  archiveSha256:"41a3323364259c806467b49be3cb7e1fdbf031517efb7b2e7c57527aed1e8b7c",
  bindingEvidence:"tools/evidence/d000-phone-book-audio.json",
  selectionRule:"Exact 01TEL/SEQDATA0.AUTH presentation selected by the authored directory event; normalized slot zero, not execution of the native room controller.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  audioManifest:"public/audio/world/phone-book/manifest.json",
  expectedMembers:[
    {name:"DENS502G.CHRM",byteLength:2196,sha256:"bc68d76e1f0a53f2bb9a5c63eabf4dfa7b9bb15e3c5096c40673074a9ee67bde"},
    {name:"M_01TE.MOTN",byteLength:135728,sha256:"6fe13710cb2cc8ecb8dbcb107ce3befd328b481db1d1e8ddb405a7c7578b6451"},
    {name:"SEQDATA0.AUTH",byteLength:3404,sha256:"cded8b9c546b7ea3a4a4e0c3dbff9c3bfb31c2a9c3abc263e05414c352409c60"},
  ],
  outputMembers:["DENS502G.CHRM"],
  motionBanks:[{bank:20,member:"M_01TE.MOTN",expectedSequences:[{index:23,name:"AKI_SIRABERU_DENWATYOU_ETC_TABACOYA_0100"}]}],
  activities:[{slot:0,binding,file:"SEQDATA0.AUTH",actors:["AKIR"],durationFrames:890,frameCount:11,
    commandCounts:{camera:1,move:1,motion:1,sound:7,voice:3}}],
  generatedAssets:[{assetPath:`${prefix}/book-textures.bin`,bytes:textures.bytes,
    source:{path:"disc1/SCENE/01/D000/AUTH.PKF",sha256:sha256(textureArchive)}}],
  // Reuse the selected world book, so a second copy is not left on its stand.
  sceneObjects:{TBK1:{model:"DENS501G.CHRM",browserFilename:"S1_D000_OMG_DENS501G.MT5"}},
  attachedObjects:{
    TBK1:{sceneObject:true,browserFilename:"S1_D000_OMG_DENS501G.MT5",
      attachments:[attach("closed",59),attach("closed",856)],
      presentation:[visible(0,true),visible(189,false),visible(856,true)]},
    TBK3:{browserFilename:"DENS502G.CHRM",assetPath:`${prefix}/DENS502G.CHRM`,textureAssetPath:`${prefix}/book-textures.bin`,
      // Control 12 belongs to the separate LOOK_TELBOOK loop, not this whole
      // movie. At AUTH frame 490 it is below the counter (y=.866); control 18
      // is the reading hand (y=1.063). Retain the original local transform,
      // but explicitly adapt its hand binding to this different motion.
      attachments:[{...attach("opened",189),controlId:18}],
      presentation:[visible(0,false),visible(189,true),visible(856,false)]},
  },
});
const annotated={...manifest,presentationAdaptation:"Original AUTH body/camera/voice/sound timeline and book-local transforms. Authored adaptation: the opened book uses the whole movie's right reading hand (control 18), not the standalone LOOK loop's left hand (control 12); closed/open swaps use the sound cues 59, 189 and 856. Exact page/finger/room-callback choreography is not claimed."};
fs.writeFileSync(path.join(root,prefix,"manifest.json"),JSON.stringify(annotated,null,2)+"\n");
console.log(`Built original phone-book presentation (${manifest.activities[0].durationFrames} frames)`);
