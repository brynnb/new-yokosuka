#!/usr/bin/env node
// Original embedded family-crest presentation. Yarn alone settles its clue.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const source=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const prefix="play/assets/hazuki/family-crest",audioPrefix="public/audio/world/family-crest";
const mapHash="6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe";
const members=[
  {name:"CREST.AUTH",sourcePath:path.join(source,"JOMO/MAPINFO.BIN"),sourceManifestPath:"disc2/SCENE/02/JOMO/MAPINFO.BIN",sourceOffset:0xb1d84,sourceSha256:mapHash,byteLength:6320,sha256:"5872c2ff4b204d7928f876a9986b9487f58ed2de7e82c39c5b286db0ce419413"},
  {name:"M_01136.MOTN",sourcePath:path.join(source,"JOMO/COMMON02.PKS"),sourceManifestPath:"disc2/SCENE/02/JOMO/COMMON02.PKS",archiveMember:"M_01136.MOTN",sourceSha256:"916aab45137cf340516a1cdd2ee61540e7c6562a1e92c5f932e9055ae0db3b89",byteLength:66132,sha256:"d07f17592e4c56bf9e758f861b4ae90ba1360ec8350e0d4bcd3d1cda26b49983"},
];
const evidence="docs/design/story-event-template.md#return-home-handguard-and-family-crest";
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_handguard_family_pack.mjs",resourceName:"01136",disc:2,
  sourceMembers:members,expectedMembers:members,bindingEvidence:evidence,
  selectionRule:"Exact embedded JOMO AUTH; package slot 0 is not a reconstructed native selector.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:17,member:"M_01136.MOTN",expectedSequences:[{index:5,name:"AKI_SUWARU_YUKIWA_BUTUMA_0136"},{index:4,name:"JIJ_INE_AT1_YUKIWA_BUTUMA_0100"}]}],
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"CREST.AUTH",actors:["AKIR","INE_"],durationFrames:1600,frameCount:28}],
  packageActors:{INE_:{label:"Ine-san",modelCode:"INE_M",browserFilename:"INE_M.CHRM",assetFormat:"MT5",characterScale:1,assetPath:"play/assets/INE_M.CHRM",textureAssetPath:"play/assets/INE_textures.bin"}},
});
if(process.argv.includes("--audio")){
  if(!process.env.VGMSTREAM_CLI||!process.env.DTPK_DUMP)throw Error("Set VGMSTREAM_CLI and DTPK_DUMP to the existing native audio tools");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_handguard_family_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:["CREST.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"A01136.AFS",path:path.join(source,"STREAM/A01136.AFS"),manifestPath:"disc2/SCENE/02/STREAM/A01136.AFS",sha256:"7eb7c06e78705993e4fadce761eea882abaea9e499ab9b966178f42b320431a0"},
    soundBank:{label:"A1_BUTU.SND",path:path.join(source,"SOUND/A1_BUTU.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_BUTU.SND",sha256:"a68370f4926c98ebd5cbb65e209d98f2476026fe745a854580f3254dc191ec8c"},
    // AUTH retains two door cues beyond the original room-requested bank's
    // six tracks. Keep explicit unavailable records, never substitute sounds.
    unavailableSounds:Object.fromEntries([["a9040600","fusumaclose"],["a9040700","fusumaopen"]].map(([hex,name])=>[`${hex}:/p16/prj16m5/AUTH01/01136/SE/door/${name}.aiff`,{
      reason:"Original AUTH door cue is absent from JOMO-requested A1_BUTU.SND, whose bank-4 tracks are 0 through 5; incidental sound omitted.",
      evidence:"disc2/SCENE/02/JOMO/MAPINFO.BIN#A01136/A1_BUTU; disc2/SCENE/02/SOUND/A1_BUTU.SND SHA256 a68370f4926c98ebd5cbb65e209d98f2476026fe745a854580f3254dc191ec8c",
    }])),
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP,vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON||"python3",
  });
  execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path),`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(a=>a.asset&&!a.unavailable).map(a=>a.asset)],{cwd:root,stdio:"inherit"});
}
console.log("Built original family-crest presentation; no story settlement or publication.");
