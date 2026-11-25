import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack, describeNativeAseqHandAssets, parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeAseqCallbackObjectPresentation} from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import {extractNativeAseqCallbackPresentation} from "../lib/NativeAseqCallbackPresentation.mjs";
import {nativeAseqCallbackFrame} from "../lib/NativeAseqScriptOwnership.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const disc=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02");
const prefix="play/assets/sakuragaoka/yamagishi-mirror";
const audioPrefix="public/audio/world/yamagishi-mirror";
const evidence="tools/evidence/yamagishi-mirror-callback-ir.json";
const generatedBy="tools/cutscenes/build_yamagishi_mirror_pack.mjs";
const original=(file,hash)=>{
  const bytes=fs.readFileSync(path.join(disc,file));
  if(sha256(bytes)!==hash)throw Error("Changed original Yamagishi asset: "+file);
  return bytes;
};
const map=original("JD00/MAPINFO.BIN","218dbd969148b157828e374d256cfd874e712069f7936b01c94b9eea906d178d");
const archive=original("JD00/INYO.PKS","f99998a03194dbcc2fa7ccb83499f73ffe33532865795eef2b9a8ed460960638");
const pkf=original("JD00/INYO.PKF","38c7e72372248ef7fd7df18a0c71bb57e6e819861ccd99d8b58f4d88a80e3592");
const ir=JSON.parse(fs.readFileSync(path.join(root,evidence)));
if(ir.source.mapinfoSha256!==sha256(map)||ir.function.id!=="0x5cd04")throw Error("Changed INYO callback");
const functions=[ir.function,...ir.supportingFunctions];
const actions=id=>functions.find(f=>f.id===id).blocks.flatMap(b=>b.actions);
if(!actions("0x5dbdc").some(a=>a.kind==="childCoroutineLaunch"&&a.targetFileOffset==="0x5cd04")
   ||!actions("0x5dbdc").some(a=>a.targetFileOffset==="0x5cbd0"&&a.arguments[0]?.value===0)
   ||!actions("0x5cbd0").some(a=>a.operationHex==="0x0050"&&a.callFileOffset==="0x5cc6a"))throw Error("Changed INYO slot owner");
const input={bytes:map,callbackFunction:0x5cd04,nativeFunction:ir.function,functions,activitySlot:0,durationFrames:2742};
// FACE target requests query a live object. Retain expressions and hands
// independently of that unsupported gaze channel.
const facialFunction={...ir.function,blocks:ir.function.blocks.map(b=>({...b,actions:b.actions.filter(a=>a.semanticId!=="resolved-object-face-record-request")}))};
const {unresolved,...cues}=extractNativeAseqCallbackPresentation({...input,nativeFunction:facialFunction});
const props=parseChrtSceneObjectBindings(parseIpacActivityArchive(pkf).members.find(m=>m.name==="CHARA.CHRT").bytes);
const object=tag=>{
  const binding=props.find(b=>b.actorTag===tag);
  if(!binding)throw Error("Missing original INYO object "+tag);
  const name=binding.model+".CHRM";
  return {browserFilename:name,model:binding.model,assetPath:prefix+"/"+name,textureAssetPath:prefix+"/textures.bin",source:binding};
};
const mirror=object("PNXM");
const attachments=extractNativeAseqCallbackObjectPresentation({...input,objectTags:["PNXM"]}).attachedObjectCues;
const presentation=actions(ir.function.id).filter(a=>a.semanticId==="resolved-object-runtime-flag"&&a.arguments[0].ascii==="PNXM").map(a=>({
  activitySlot:0,frame:nativeAseqCallbackFrame(map,0x5cd04,ir.function,a,functions),
  visible:a.arguments[1].value===1,callFileOffset:a.callFileOffset,
}));
const generatedAssets=[];
const add=(name,bytes,source)=>{
  const assetPath=prefix+"/"+name;
  generatedAssets.push({assetPath,bytes,source});
  return {path:assetPath,bytes};
};
add("textures.bin",extractNativeTexnPack(pkf,"INYO.PKF").bytes,{path:"disc2/SCENE/02/JD00/INYO.PKF",sha256:sha256(pkf)});
const sourceHand=(name,hash)=>add(name,original("MODEL/HAND/"+name,hash),{path:"disc2/SCENE/02/MODEL/HAND/"+name,sha256:hash});
const left=sourceHand("YMG_TL.MT5","003f9047079444adece2ba0653dd50f0f506c5eec85d673bf3731938741de419");
const right=sourceHand("YMG_TR.MT5","a1c01d3cc6df5bebf495fed8b38a64c66e57842e15213ac16d55b9da42c6682b");
const rig=sourceHand("YMG_HM.BIN","756f07c80fa715636fb1a92e480e2ef8d045c5ede1040faa388ed2fd43682f74");
const handTextures=add("ymg-hand-textures.bin",extractNativeTexnPack(left.bytes,"YMG_TL.MT5").bytes,{path:"disc2/SCENE/02/MODEL/HAND/YMG_TL.MT5",sha256:sha256(left.bytes)});
const hand=describeNativeAseqHandAssets({actorTag:"YAMA",bodyModelCode:"YMG_L",handCode:"YMG",left,right,rig,texturePack:{path:handTextures.path,byteLength:handTextures.bytes.length,sha256:sha256(handTextures.bytes)}});
const manifest=buildNativeAseqActivityPack({
  generatedBy,resourceName:"INYO",disc:2,sourcePath:path.join(disc,"JD00/INYO.PKS"),sourceManifestPath:"disc2/SCENE/02/JD00/INYO.PKS",
  archiveSha256:sha256(archive),expectedMembers:parseIpacActivityArchive(archive).members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:evidence,selectionRule:"JD00 owner 0x5dbdc leases the INYO archive and calls 0x5cbd0(0). The sole original AUTH stream is SEQDATA7.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:audioPrefix+"/manifest.json",
  motionBanks:[{bank:16,member:"M_01INY.MOTN"}],
  activities:[{slot:0,binding:{kind:"map-embedded-slot"},file:"SEQDATA7.AUTH",durationFrames:2742,actors:["AKIR","YAMA","COP_"],...cues}],
  packageActors:{YAMA:{label:"Shigeo Yamagishi",modelCode:"YMG_L",browserFilename:"YMG_L.CHRM",assetFormat:"MT5",characterScale:1,
    assetPath:"play/assets/characters/YMG_L.CHRM",textureAssetPath:"play/assets/characters/YMG_textures.bin"}},
  sceneObjects:{COP_:object("COP_")},attachedObjects:{PNXM:{...mirror,attachments,presentation}},
  handAssets:{YAMA:hand},nativeHandPoseTables:cues.nativeHandPoseTables,
  outputMembers:["CUPK300G.CHRM","PNX02M6G.CHRM"],generatedAssets,
});
const outputs=[prefix+"/manifest.json",...manifest.outputs.map(m=>m.path)];
if(process.argv.includes("--audio")){
  const audio=buildNativeAseqAudioPack({generatedBy,disc:2,authDirectory:path.join(root,prefix),authFiles:["SEQDATA7.AUTH"],authManifest:prefix+"/manifest.json",resourceBindingEvidence:evidence,
    stream:{label:"01INY.AFS",path:path.join(disc,"STREAM/01INY.AFS"),manifestPath:"disc2/SCENE/02/STREAM/01INY.AFS",sha256:"9dccb5c49b4c0e1fdba2d1540ade26dae9d4c6099fd48a96a50bcb769495d7e7"},
    soundBank:{label:"A1_INYOU.SND",path:path.join(disc,"SOUND/A1_INYOU.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_INYOU.SND",sha256:"ce80bc4eeeae2c147d86bc13b2968b353fce9e21990e8d1502ee35d25ad940ad"},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),python:process.env.DTPK_PYTHON||"python3",vgmstream:process.env.VGMSTREAM_CLI||"vgmstream-cli",
  });
  outputs.push(audioPrefix+"/manifest.json",...[...audio.voices,...audio.sounds].filter(c=>c.asset).map(c=>c.asset));
  console.log("Original INYO recordings:",audio.voices.length,"voices,",audio.sounds.length,"sounds");
}
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...new Set(outputs)],{cwd:root,stdio:"inherit"});
