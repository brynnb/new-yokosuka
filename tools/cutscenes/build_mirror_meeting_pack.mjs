// Reuse the ordinary original-activity/audio compilers. Yarn supplies the
// reviewed order and a real Left QTE; native warehouse branching is not needed.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,describeNativeAseqHandAssets,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
import {parseAuthSequence} from "../../src/AuthSequence.js";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeAseqCallbackHandPresentation} from "../lib/NativeAseqCallbackPresentation.mjs";
import {extractNativeAseqCallbackObjectPresentation} from "../lib/NativeAseqCallbackObjectPresentation.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(sourceRoot,"data/SCENE/02",p);
const archive=fs.readFileSync(source("MS8A/MS8A.PKS"));
if(sha256(archive)!=="06c3ec11f7d87f565ea627e1118f0281fc24bdae4ed6bbecd8f461138d94c611")throw Error("Changed original MS8A archive");
const map=fs.readFileSync(source("MS8A/MAPINFO.BIN"));
if(sha256(map)!=="30152614ccdccbe621354f36fcd64b51d85c8b5681ad059385dc71be930db135")throw Error("Changed original MS8A associations");
const textureSource=fs.readFileSync(source("MS8A/MS8A.PKF"));
if(sha256(textureSource)!=="5c636beb2198d08fea31694f4a45642d452c4a4f4ea497d95d9cfa41f1d6a52a")throw Error("Changed original MS8A textures");
const textures=extractNativeTexnPack(textureSource,"MS8A/MS8A.PKF");
const members=parseIpacActivityArchive(archive).members;
const callbackEvidence=JSON.parse(fs.readFileSync(path.join(root,"tools/evidence/mirror-meeting-callback-ir.json")));
if(callbackEvidence.source.mapinfoSha256!==sha256(map))throw Error("Changed MS8A callback evidence");
const functions=[callbackEvidence.function,...callbackEvidence.supportingFunctions];
const callbacks=[0xaf0,0x10f4,0x160c,0x200c,0x272c,0x2d8c,0x38b4,0x3e14];
const owner=functions.find(fn=>fn.id==="0x4e2c");
for(const [slot,callback]of callbacks.entries()){
  const calls=owner.blocks.flatMap(b=>b.actions).filter(a=>Number(a.targetFileOffset)===callback);
  if(calls.length!==1||calls[0].arguments[1]?.value!==slot)throw Error(`Unproved MS8A callback slot ${slot}`);
}
const propCues=[];
const activities=Array.from({length:8},(_,slot)=>{
  const file=`SEQDATA${slot}.AUTH`,member=members.find(m=>m.name===file);
  if(!member)throw Error(`Missing original ${file}`);
  const sequence=parseAuthSequence(member.bytes.buffer.slice(member.bytes.byteOffset,member.bytes.byteOffset+member.bytes.byteLength));
  const input={bytes:map,callbackFunction:callbacks[slot],nativeFunction:functions.find(f=>Number(f.id)===callbacks[slot]),
    functions,activitySlot:slot,durationFrames:sequence.durationFrames};
  const hands=extractNativeAseqCallbackHandPresentation(input);
  // Original room setup also initializes resident actors absent from this
  // AUTH. Do not acquire an invisible Chai merely to reset his body fingers.
  hands.nativeBodyHandPoseCues=hands.nativeBodyHandPoseCues.filter(c=>sequence.actors.includes(c.actorTag));
  if(hands.nativeHandPoseCues.some(c=>!sequence.actors.includes(c.actorTag)))throw Error("Unowned MS8A detailed hand cue");
  propCues.push(...extractNativeAseqCallbackObjectPresentation({...input,objectTags:["KAGA"]}).attachedObjectCues);
  return {slot,primaryPointer:0,secondaryPointer:0,file,durationFrames:sequence.durationFrames,frameCount:sequence.frames.length,actors:sequence.actors,...hands};
});
const prefix="play/assets/harbor/mirror-meeting",audioPrefix="public/audio/world/mirror-meeting";
const character=(label,modelCode)=>({label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
  assetPath:`${prefix}/${modelCode}.CHRM`,textureAssetPath:`${prefix}/textures.bin`});
const object=model=>({model,browserFilename:`${model}.CHRM`,assetPath:`${prefix}/${model}.CHRM`,textureAssetPath:`${prefix}/textures.bin`});
const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(textureSource).members.find(m=>m.name==="CHARA.CHRT").bytes);
const sceneObjects=Object.fromEntries(["KAGA","CLE1","CLE2"].map(tag=>{
  const binding=bindings.find(b=>b.actorTag===tag);
  if(!binding)throw Error(`Missing original MS8A prop ${tag}`);
  return [tag,{...object(binding.model),source:binding}];
}));
const handAssets={},handMembers=[];
for(const [actorTag,handCode]of Object.entries({TAIJ:"SYU",KISY:"KIS",CHAI:"CHA"})){
  const record=name=>{const member=members.find(m=>m.name===name);if(!member)throw Error(`Missing original ${name}`);handMembers.push(name);return {path:`${prefix}/${name}`,bytes:member.bytes};};
  handAssets[actorTag]=describeNativeAseqHandAssets({actorTag,bodyModelCode:`${handCode}_M`,handCode,
    left:record(`${handCode}_TL.CHRM`),right:record(`${handCode}_TR.CHRM`),rig:record(`${handCode}_HM.BIN`),
    texturePack:{path:`${prefix}/textures.bin`,byteLength:textures.bytes.length,sha256:sha256(textures.bytes)}});
}
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_mirror_meeting_pack.mjs",resourceName:"MS8A",disc:2,
  sourcePath:source("MS8A/MS8A.PKS"),sourceManifestPath:"disc2/SCENE/02/MS8A/MS8A.PKS",archiveSha256:sha256(archive),
  expectedMembers:members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:"docs/design/story-event-template.md#return-to-master-chen",
  selectionRule:"Original owner 0x4e2c binds the callback for each AUTH ordinal. Original hand poses and FIXO grips are compiled as finite data. Authored sequence 6,0,1,2,3; real Left input selects 5 versus failed 4; only successful 5 continues to 7. Native gaze/debris and native QTE branching are not reconstructed.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  // Original MS8A AUTH requests bank 17 (unlike the earlier meeting's 16).
  motionBanks:[{bank:17,member:"M_0159.MOTN"}],activities,
  outputMembers:["SYU_M.CHRM","KIS_M.CHRM","CHA_M.CHRM","PNX02H6G.CHRM","B570501G.CHRM","B570502G.CHRM",...handMembers],
  handAssets,nativeHandPoseTables:Object.assign({},...activities.map(a=>a.nativeHandPoseTables)),
  generatedAssets:[{assetPath:`${prefix}/textures.bin`,bytes:textures.bytes,source:{path:"disc2/SCENE/02/MS8A/MS8A.PKF",sha256:sha256(textureSource)}}],
  packageActors:{TAIJ:character("Master Chen","SYU_M"),KISY:character("Chen Gui Zhang","KIS_M"),CHAI:character("Chai","CHA_M")},
  sceneObjects,
  // No guessed permanent wrist override: AUTH moves the existing mirror
  // except where the original callback explicitly gives FIXO ownership.
  attachedObjects:{KAGA:{...sceneObjects.KAGA,sceneObject:true,attachments:propCues}},
});
console.log(`Built mirror meeting: ${manifest.activities.length} original AUTH segments`);
if(process.argv.includes("--audio")){
  if(!map.toString("latin1").toLowerCase().includes("a1_honkn.snd"))throw Error("Missing original MS8A sound association");
  const stream=fs.readFileSync(source("STREAM/A0159.AFS")),sound=fs.readFileSync(source("SOUND/A1_HONKN.SND"));
  if(sha256(stream)!=="11d8b96cb0794beb0191185dbc33c78ab4bcd063d537a26a2fd098161850580c")throw Error("Changed A0159 dialogue");
  if(sha256(sound)!=="102ede3f1a17ccb18b5a24f29bc3923ae32eaf71a33e3647a621911e243b9853")throw Error("Changed A1_HONKN sound bank");
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_mirror_meeting_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:activities.map(a=>a.file),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
    stream:{label:"A0159.AFS",path:source("STREAM/A0159.AFS"),manifestPath:"disc2/SCENE/02/STREAM/A0159.AFS",sha256:sha256(stream)},
    soundBank:{label:"A1_HONKN.SND",path:source("SOUND/A1_HONKN.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_HONKN.SND",sha256:sha256(sound)},
    unavailableVoices:Object.fromEntries(["A0159A005.str","A0159C003.str","A0159A026.str","A0159A010.str"].map(name=>[name,{
      reason:"This exact AUTH voice reference is absent from both original A0159.AFS and its IDX directory. Retain the cue without substitute speech.",
      evidence:"disc2/SCENE/02/STREAM/A0159.AFS and A0159.IDX",
    }])),
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream:process.env.VGMSTREAM_CLI||path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),python:process.env.DTPK_PYTHON||"python3",
  });
  console.log(`Built mirror meeting audio: ${audio.voices.length} voices; ${audio.sounds.length} effects`);
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
