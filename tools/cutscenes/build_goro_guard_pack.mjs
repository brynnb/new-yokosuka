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
const evidence = "docs/design/story-goro-guard.md";
const prefix = "play/assets/harbor/goro-guard-distraction";
const audioPrefix = "public/audio/world/goro-guard-distraction";
const generatedBy = "tools/cutscenes/build_goro_guard_pack.mjs";
const archive = fs.readFileSync(source("MFSY/GKYU.PKS"));
const archiveHash = "03694e6a4fbbe42d3f20679361c695665be0d92c4fb90e14905ed334cc66a2b0";
if (sha256(archive) !== archiveHash) throw Error("Changed original MFSY/GKYU archive");
const members = parseIpacActivityArchive(archive).members;
const activities = [{slot:0,file:"SEQDATA2.AUTH",durationFrames:930,
  actors:["KEBJ","AKIR","KEBK","GORO","NGSM"],binding:{kind:"map-embedded-slot"}}];
const cast = {
  GORO:["Goro Mihashi","KMB_L"], NGSM:["Nagashima","YAB_L"],
  KEBJ:["Harbor guard","KVJ_L"], KEBK:["Harbor guard","KVK_L"],
};
const packageActors = Object.fromEntries(Object.entries(cast).map(([tag,[label,modelCode]])=>[tag,{
  label, modelCode, characterScale:1, assetFormat:"MT5", browserFilename:modelCode+".CHRM",
  assetPath:"play/assets/characters/"+modelCode+".CHRM",
  textureAssetPath:"play/assets/characters/"+modelCode.slice(0,3)+"_textures.bin",
}]));
// MFSY 0x6d5dc writes GORO's face parameters and 0x6d5f0 requests it
// before this activity. Only this package acquires the detailed KMB head.
function packedFaceFile(name, expectedHash) {
  const sourceName = "MODEL/FACE/" + name;
  const bytes = fs.readFileSync(source(sourceName));
  if (sha256(bytes) !== expectedHash) throw Error("Changed original Goro FACE asset " + name);
  const assetPath = prefix + "/" + name;
  fs.writeFileSync(path.join(root, assetPath), bytes);
  return { path: assetPath, sourcePath: discPath(sourceName), sha256: expectedHash, byteLength: bytes.length };
}
const posesPath = prefix + "/goro-talk-poses.generated.json";
const poses = fs.readFileSync(path.join(root, posesPath));
if (sha256(poses) !== "a12f3d24ad63fa711113eb54bfcca7c03e15addff302f39343678c049f933331")
  throw Error("Changed KMB upper-face and mouth pose output");
const face = {
  actorTag: "GORO", faceCode: "KMB", bodyModelCode: "KMB_L",
  attachmentRenderKey: -67, faceRootRenderKey: 3, eyeRenderKeys: [77, 78],
  model: packedFaceFile("KMB_F.MT5", "f42e297d0dc3ac1b07a9d918f11ae9bf0cf0396cf95d843df440be548b871606"),
  table: packedFaceFile("KMB_FTBL.BIN", "3e7ee20e4bc9dda2868de6265176e892682a0561f587625bae1035a0a6084cb8"),
  poses: { actorTag: "GORO", path: posesPath, sha256: sha256(poses), byteLength: poses.length,
    generatedBy: "tools/animation/extract_native_face_poses.py" },
};
const manifest = buildNativeAseqActivityPack({
  generatedBy, disc:2, resourceName:"GKYU", sourcePath:source("MFSY/GKYU.PKS"),
  sourceManifestPath:discPath("MFSY/GKYU.PKS"), archiveSha256:archiveHash,
  expectedMembers:members.map(member=>({name:member.name,byteLength:member.bytes.length,sha256:sha256(member.bytes)})),
  bindingEvidence:evidence, selectionRule:"Original MFSY 0x6d164 plays the E1081 conversation and calls 0x6c114 with slot 0 to run the GKYU archive film.",
  outputDirectory:path.join(root,prefix), outputAssetPrefix:prefix, manifestPath:path.join(root,prefix,"manifest.json"),
  audioManifest:audioPrefix+"/manifest.json",
  motionBanks:[{bank:16,member:"M_01GAR.MOTN"}],activities,packageActors,facialAssets:{GORO:face},
});
const assets = [prefix+"/manifest.json",...manifest.outputs.map(x=>x.path), face.model.path, face.table.path, face.poses.path];
const music = registerNativeAseqMusic(root,{id:"bgm090",sourceId:"14d7d98f3a65dbba1ae21948bc2204359be53b88322a98d44e537dd2470c6ea8",
  bankHash:"992af480c514a9cf59f5aed24a4499d84c9497dab90f6054b5e9532fa2bb2dc6",label:"Goro distracts the harbor guards"});
if(process.argv.includes("--audio")) {
  const audio=buildNativeAseqAudioPack({
    generatedBy,disc:2,authDirectory:path.join(root,prefix),authFiles:activities.map(x=>x.file),
    authManifest:prefix+"/manifest.json",resourceBindingEvidence:evidence,
    stream:{label:"01GAR.AFS",path:source("STREAM/01GAR.AFS"),manifestPath:discPath("STREAM/01GAR.AFS"),sha256:"c76316a4cc4b2403b8f67d6091e9b803648c50d1e091222a210de05b67520d01"},
    soundBank:{label:"A1_SOKOS.SND",path:source("SOUND/A1_SOKOS.SND"),manifestPath:discPath("SOUND/A1_SOKOS.SND"),sha256:"dcb685dd19587b75c749010dc78b1fd706c38d69a4e42dda52fa1d1f43dc1e6b"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),
    python:process.env.DTPK_PYTHON||"python3",dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
  });
  assets.push(audioPrefix+"/manifest.json",...[...audio.voices,...audio.sounds].filter(x=>x.asset).map(x=>x.asset));
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set([...assets,...music])],{cwd:root,stdio:"inherit"});
