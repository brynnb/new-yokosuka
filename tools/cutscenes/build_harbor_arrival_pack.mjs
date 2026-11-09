#!/usr/bin/env node
// Original harbor-arrival film and sound, consumed by the existing Story
// activity player. Selecting this lower-population variant is an adaptation;
// the original MFSY owner also conditionally selects SEQDATA6.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeAseqCountedNodeTransformLoop} from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import {nativeAseqGoverningActivityFrame} from "../lib/NativeAseqScriptOwnership.mjs";

const root=path.resolve(import.meta.dirname,"../.."),disc=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(disc,"data/SCENE/02",p),archivePath=source("MFSY/YBUSFLY.PKS"),archiveBytes=fs.readFileSync(archivePath);
const archiveHash="2fe8137b1c39f1d636ca07bd697f85bc9439cb198c7bbd659001e5fe919bff30";
if(sha256(archiveBytes)!==archiveHash)throw Error("Changed original harbor arrival archive");
const archive=parseIpacActivityArchive(archiveBytes),textureBytes=fs.readFileSync(source("MFSY/YBUSFLY.PKF"));
const textureHash="e525f76bc8ac0fa243577efcb7bd5e11c8ff2e756c5494e3ff62dd7dfca370df";
if(sha256(textureBytes)!==textureHash)throw Error("Changed original harbor arrival textures");
const textureArchive=parseIpacActivityArchive(textureBytes),chrt=textureArchive.members.find(m=>m.name==="CHARA.CHRT");
if(!chrt)throw Error("Missing original harbor arrival bindings");
const bindings=parseChrtSceneObjectBindings(chrt.bytes),prefix="play/assets/harbor/bus-arrival",audioPrefix="public/audio/world/harbor-bus-arrival";
const required=["BLU1","FOK2","SOU3","YEL1","EXT1","BLU2"],outputMembers=[];
const binding=tag=>{const b=bindings.find(x=>x.actorTag===tag);if(!b)throw Error(`Missing source binding ${tag}`);const name=`${b.model}.CHRM`,m=archive.members.find(x=>x.name===name);if(!m)throw Error(`Missing source model ${name}`);outputMembers.push(name);return {...b,member:name,memberSha256:sha256(m.bytes)};};
const records=Object.fromEntries(required.map(tag=>[tag,binding(tag)])),texturePath=`${prefix}/textures.bin`;
const sceneObjects=Object.fromEntries(["BLU1","FOK2","SOU3","YEL1","BLU2"].map(tag=>[tag,{model:records[tag].model,browserFilename:records[tag].member,assetPath:`${prefix}/${records[tag].member}`,textureAssetPath:texturePath,sourceBinding:records[tag]}]));
// The bus itself is a shared HUMAN archive object, not a YBUSFLY member.
sceneObjects.BUS_={model:"BUSS530G",browserFilename:"BUSS530G.CHRM",assetPath:"play/assets/dobuita/BUSS530G.CHRM",textureAssetPath:"play/assets/dobuita/BUSS530G_textures.bin"};
const packageActors={EXT1:{label:"Harbor worker",modelCode:records.EXT1.model,browserFilename:records.EXT1.member,assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/${records.EXT1.member}`,textureAssetPath:texturePath,sourceBinding:records.EXT1}};
const motionPath=path.join(root,".disc-work/runtime-motion/MOTION.BIN"),motionHash="aca6a41b967b9f9f92ad847c9495e780058b8194e359bca9a9c2763b0d337b23";
const callbackEvidence="tools/evidence/harbor-flyover-callback-ir.json",ir=JSON.parse(fs.readFileSync(path.join(root,callbackEvidence))),map=fs.readFileSync(source("MFSY/MAPINFO.BIN"));
if(ir.source.mapinfoSha256!==sha256(map)||ir.function.id!=="0x2ce7c")throw Error("Changed original harbor arrival callback");
const door=ir.supportingFunctions.find(f=>f.id==="0x2c268"),launches=ir.function.blocks.flatMap(b=>b.actions).filter(a=>a.kind==="childCoroutineLaunch"&&a.targetFileOffset==="0x2c268");
if(!door||launches.length!==2||launches[0].arguments[0]?.value!==3||launches[1].arguments[0]?.value!==2)throw Error("Changed original harbor bus door ownership");
const nodeTransforms=launches.flatMap(launch=>extractNativeAseqCountedNodeTransformLoop({nativeFunction:door,selector:launch.arguments[0].value,
  firstFrame:nativeAseqGoverningActivityFrame(map,0x2ce7c,Number(launch.callFileOffset)),activitySlot:0}).map(({objectTag,...cue})=>({...cue,activityId:"YBUSFLY/SEQDATAD.AUTH",source:{evidence:callbackEvidence}})));
const manifest=buildNativeAseqActivityPack({generatedBy:"tools/cutscenes/build_harbor_arrival_pack.mjs",resourceName:"YBUSFLY",disc:2,
  sourcePath:archivePath,sourceManifestPath:"disc2/SCENE/02/MFSY/YBUSFLY.PKS",archiveSha256:archiveHash,
  expectedMembers:archive.members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:"docs/design/story-event-template.md#bus-to-new-yokosuka-harbor",
  selectionRule:"MFSY owner 0x29bcc selects one of original SEQDATA6 or SEQDATAD harbor arrivals. Use the less-populated D alternative; exact branch conditions are unresolved.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:16,member:"M_01BUS.MOTN"},{bank:0,sourcePath:motionPath,assetPath:"play/assets/dobuita/jimmy-escaped/MOTION.BIN",byteLength:1826804,sha256:motionHash,parseOptions:{sequenceIndices:[101]}},{bank:2,sourcePath:motionPath,assetPath:"play/assets/dobuita/jimmy-escaped/MOTION.BIN",byteLength:1826804,sha256:motionHash,parseOptions:{sequenceIndices:[128,222]}}],
  activities:[{slot:0,file:"SEQDATAD.AUTH",binding:{kind:"map-embedded-slot"},durationFrames:1730,actors:["BLU1","FOK2","SOU3","YEL1","BUS_","AKIR","EXT1","BLU2"],
    // The original source uses bank 2/index 222 for this moving worker, but
    // resolving it against the available global bank yields an unrelated
    // crouched ARPD animation. The same original AUTH later selects bank 0/101
    // (ordinary walking) for this same actor; use that during the unresolved
    // section until the real bank binding is recovered.
    authoredMotionSubstitutions:[{actorTag:"EXT1",sourceBank:2,sourceIndex:222,targetBank:0,targetIndex:101,reason:"Unresolved original worker bank; reuse the walk authored later in this same film."}]}],
  sceneObjects,packageActors,attachedObjects:{BUS_:{browserFilename:"BUSS530G.CHRM",sceneObject:true,attachments:[],nodeTransforms}},outputMembers:[...new Set(outputMembers)],generatedAssets:[{assetPath:texturePath,bytes:extractNativeTexnPack(textureBytes,"YBUSFLY.PKF").bytes,source:{path:"disc2/SCENE/02/MFSY/YBUSFLY.PKF",sha256:textureHash}}],
  externalAssets:[{sourcePath:path.join(root,"play/assets/dobuita/BUSS530G.CHRM"),assetPath:"play/assets/dobuita/BUSS530G.CHRM",byteLength:100360,sha256:"6d7a04141e652476b120a1bcd07ca3e864ca95526a7cd25427012779b0c932ff"},{sourcePath:path.join(root,"play/assets/dobuita/BUSS530G_textures.bin"),assetPath:"play/assets/dobuita/BUSS530G_textures.bin",byteLength:146804,sha256:"beb93fc87a1e6b639813283d03a932d5fff428979f3ee12e498c2d3520eb3315"}],
});
const runtimePaths=[`${prefix}/manifest.json`,...manifest.outputs.map(x=>x.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_harbor_arrival_pack.mjs",disc:2,authDirectory:path.join(root,prefix),authFiles:["SEQDATAD.AUTH"],authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,stream:null,
    soundBank:{label:"A1_BUSNO.SND",path:source("SOUND/A1_BUSNO.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_BUSNO.SND",sha256:"40c2e792ea21e45f4a406dff4b2b84bd3b7f172d4de2056a0d05d8a337e8b5a8"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),python:process.env.DTPK_PYTHON||"python3",vgmstream:null});
  runtimePaths.push(`${audioPrefix}/manifest.json`,...audio.sounds.filter(x=>x.asset).map(x=>x.asset));
  console.log(`Prepared ${audio.sounds.length} original harbor arrival sounds.`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(runtimePaths)],{cwd:root,stdio:"inherit"});
console.log("Prepared original YBUSFLY harbor arrival.");
