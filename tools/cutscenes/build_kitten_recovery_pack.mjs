#!/usr/bin/env node
// Package the original healed-kitten film. The film is presentation only: its
// trigger, health and saved outcome belong to the personal Story transaction.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";

const root = path.resolve(import.meta.dirname, "../..");
const source = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2"), "data/SCENE/02");
const original = path.join(source, "JU00/CATA2.PKS");
const bindingPath = path.join(source, "JU00/CATA2.PKF");
const bindingBytes = fs.readFileSync(bindingPath);
if (sha256(bindingBytes) !== "c052bed639eef3c0e489e08b788ff7aba9b8ea1f4cdb0bd3e3972ea85bb72cca") throw Error("Changed CATA2 binding archive");
const chrt = parseIpacActivityArchive(bindingBytes).members.find(m => m.name === "CHARA.CHRT");
const bindings = chrt && parseChrtSceneObjectBindings(chrt.bytes);
if (!bindings || bindings.length !== 1 || bindings[0].actorTag !== "NBOX" || bindings[0].model !== "DANM400G") throw Error("Changed CATA2 box binding");
const originalKitten = JSON.parse(fs.readFileSync(path.join(root, "play/assets/yamanose/cata1/manifest.json")));
const prefix = "play/assets/yamanose/kitten-recovery";
const audioPrefix = "public/audio/world/kitten-recovery";
const evidence = "docs/design/story-event-template.md#later-kitten-events-source-leads";
const members = [
  ["DANM400G.CHRM",2636,"a34211b0f17aa553059312bd098f755e7fa95483bcd5d95a8deae88e3318f452"],
  ["M_01CAT.MOTN",366692,"01489797ac2fb1db34bb63659b418672160c4d0a2fdd4d6bc5fbcc5073a04f42"],
  ["SEQDATA0.AUTH",13840,"b1afaf2acb206ec14ea1d98c4a870fc00a2a27bb9592bef48feed2574c04065f"],
  ["SEQDATA3.AUTH",20616,"eb103793ecfe4fbb10e76ae611f6be47ff08026fa010bf62d85c7a9d50d1a60d"],
].map(([name,byteLength,hash])=>({name,byteLength,sha256:hash}));
const actor = (label,modelCode) => ({label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
  assetPath:`play/assets/characters/${modelCode}.CHRM`,textureAssetPath:`play/assets/characters/${modelCode.slice(0,3)}_textures.bin`});
const manifest = buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_kitten_recovery_pack.mjs",resourceName:"CATA2",disc:2,
  sourcePath:original,sourceManifestPath:"disc2/SCENE/02/JU00/CATA2.PKS",
  archiveSha256:"5d028873e0f399c4a0d5b829dc6bfee08e397ad71b7e91d2c9c57659bf292c34",expectedMembers:members,
  bindingEvidence:evidence,selectionRule:"Original healed-kitten film; Story gates and outcome are independently authored, not recovered native controller logic.",
  audioManifest:`${audioPrefix}/manifest.json`,outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  // The Disc 2 archive contains the exact same motion bank as CATA1. Keep
  // one runtime asset and still verify both archives' original member hashes.
  outputMembers:["DANM400G.CHRM"],motionBanks:[{bank:16,sourcePath:path.join(root,"play/assets/yamanose/cata1/M_01CAT.MOTN"),assetPath:"play/assets/yamanose/cata1/M_01CAT.MOTN",byteLength:366692,sha256:"01489797ac2fb1db34bb63659b418672160c4d0a2fdd4d6bc5fbcc5073a04f42"}],
  packageActors:{CATM:originalKitten.packageActors.CATM,YASU:actor("Yasuo Ito","YSO_L"),KAYO:actor("Kayoko Ito","KYK_L")},
  sceneObjects:{NBOX:{...originalKitten.sceneObjects.NBOX,assetPath:`${prefix}/DANM400G.CHRM`,nativeBinding:{archive:"CATA2.PKF",archiveMember:"CHARA.CHRT",characterRecordOffset:bindings[0].characterRecordOffset,imagePropertyOffset:bindings[0].imagePropertyOffset,defImageRecordOffset:bindings[0].defImageRecordOffset}}},
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"SEQDATA3.AUTH",durationFrames:1650,frameCount:102,actors:["NBOX","CATM","YASU","AKIR","KAYO"],commandCounts:{camera:1,move:5,motion:24,effect:21,sound:49,voice:20}}],
});
const outputs = [`${prefix}/manifest.json`,...manifest.outputs.map(record=>record.path)];
if (process.argv.includes("--audio")) {
  const audio = buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_kitten_recovery_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:["SEQDATA3.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:evidence,
    stream:{label:"01CAT3.AFS",path:path.join(source,"STREAM/01CAT3.AFS"),manifestPath:"disc2/SCENE/02/STREAM/01CAT3.AFS",sha256:"8bb32231ed5cfff895996d16d4267e02522e1fdff5a775392b439f397ee39b0f"},
    soundBank:{label:"A1_NEKO1.SND",path:path.join(source,"SOUND/A1_NEKO1.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_NEKO1.SND",sha256:"0e3eeae86fe19aa7c40fa6a841192329df5d9c2fe16455b5517a2d3092d0c4d9"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP || path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI,python:process.env.DTPK_PYTHON || "python3"});
  outputs.push(`${audioPrefix}/manifest.json`,...[...audio.voices,...audio.sounds].filter(row=>row.asset).map(row=>row.asset));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(outputs)],{cwd:root,stdio:"inherit"});
console.log("Prepared original kitten recovery presentation; not yet integrated into Story.");
