#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack, parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack, registerNativeAseqMusic} from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const disc = process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2");
const source = name => path.join(disc, "data/SCENE/02", name);
const discPath = name => "disc2/SCENE/02/" + name;
const evidence = "tools/evidence/hisaka-harbor-native.json";
const native = JSON.parse(fs.readFileSync(path.join(root, evidence)));
const prefix = "play/assets/harbor/hisaka-stand";
const audioPrefix = "public/audio/world/hisaka-stand";
const generatedBy = "tools/cutscenes/build_hisaka_stand_pack.mjs";
const archive = fs.readFileSync(source("MFSY/HISA.PKS"));
const map = fs.readFileSync(source("MFSY/MAPINFO.BIN"));
if (sha256(map) !== native.mapSha256 || sha256(archive) !== native.pkSha256) throw Error("Changed MFSY/HISA source");
const members = parseIpacActivityArchive(archive).members;
const activities = native.activities.map(({slot, durationFrames, primaryPointer, secondaryPointer}) => {
  if (map.toString("ascii", primaryPointer, primaryPointer+12) !== "seqdata"+slot+".bin"
    || map.toString("ascii", secondaryPointer, secondaryPointer+4) !== "HISA") throw Error("Changed HISA slot " + slot);
  return {slot, file:"SEQDATA"+slot+".AUTH", durationFrames, primaryPointer, secondaryPointer};
});
const cast = {
  HINA:["Mai Sawano","MIB_L"], HISA:["Hisaka Sawano","FRO_L"], ISYM:["Rena Isayama","SHY_L"],
  NMNO:["Yumiko Minamino","SHX_L"], MIHO:["Miho Sagawa","MIH_L"], JOE_:["Jo Higuchi","JOE_L"],
};
const packageActors = Object.fromEntries(Object.entries(cast).map(([tag,[label,modelCode]])=>[tag,{
  label, modelCode, characterScale:1, assetFormat:"MT5", browserFilename:modelCode+".CHRM",
  assetPath:"play/assets/characters/"+modelCode+".CHRM",
  textureAssetPath:"play/assets/characters/"+modelCode.slice(0,3)+"_textures.bin",
}]));
const manifest = buildNativeAseqActivityPack({
  generatedBy, disc:2, resourceName:"HISA", sourcePath:source("MFSY/HISA.PKS"),
  sourceManifestPath:discPath("MFSY/HISA.PKS"), archiveSha256:native.pkSha256,
  expectedMembers:members.map(member=>({name:member.name,byteLength:member.bytes.length,sha256:sha256(member.bytes)})),
  bindingEvidence:evidence, selectionRule:"MFSY loads slots 0,1,2,4 for the request; choice selects 1 or 2. Reporting uses slot 3.",
  outputDirectory:path.join(root,prefix), outputAssetPrefix:prefix, manifestPath:path.join(root,prefix,"manifest.json"),
  audioManifest:audioPrefix+"/manifest.json",
  motionBanks:[
    {bank:16, member:"M_01HIS.MOTN"},
    {bank:5, sourcePath:path.join(disc,"data/MOTION/MOTION.BIN"),assetPath:prefix+"/M_GLOBAL.BIN",
      byteLength:1826800,sha256:"512abe68b26a2a8bf78c8011b54faf01f9c3e0ce3e4d0b56491161eec3565dec",
      parseOptions:{sourceSequenceBase:5*256,sequenceIndices:[93]},expectedSequences:[{index:93,name:"AKI_AKI_WALK_SP2_LP"}]},
  ], activities, packageActors,
});
fs.copyFileSync(path.join(disc,"data/MOTION/MOTION.BIN"),path.join(root,prefix,"M_GLOBAL.BIN"));
const assets = [prefix+"/manifest.json",...manifest.outputs.map(x=>x.path)];
const music = registerNativeAseqMusic(root,{id:"bgm117",sourceId:"b1e8f48091cede2af2d5a764e3461aaa00aa7b09a661f9c6584f2e2979d56c73",
  bankHash:"897b9cd0edc5e6c9559372d821495e4a9cbb456d0ce73636df712b88424932a1",label:"Hisaka's request"});
if(process.argv.includes("--audio")) {
  const audio=buildNativeAseqAudioPack({
    generatedBy,disc:2,authDirectory:path.join(root,prefix),authFiles:activities.map(x=>x.file),
    authManifest:prefix+"/manifest.json",resourceBindingEvidence:evidence,
    stream:{label:"01HIS.AFS",path:source("STREAM/01HIS.AFS"),manifestPath:discPath("STREAM/01HIS.AFS"),sha256:"aab94360f22687657d2e3b2910333604198231e52fd03a742688bfab297012dd"},
    soundBank:{label:"A1_HISAK.SND",path:source("SOUND/A1_HISAK.SND"),manifestPath:discPath("SOUND/A1_HISAK.SND"),sha256:"5ff3537dc0f5d6cb18182015a50bb2087498008b257881024bb6afc557fbc1d2"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),
    python:process.env.DTPK_PYTHON||"python3",dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
  });
  assets.push(audioPrefix+"/manifest.json",...[...audio.voices,...audio.sounds].filter(x=>x.asset).map(x=>x.asset));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set([...assets,...music])],{cwd:root,stdio:"inherit"});
