#!/usr/bin/env node
// Original embedded family-crest presentation. Yarn alone settles its clue.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {buildNativeAseqActivityPack,describeNativeAseqHandAssets,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeAseqCallbackHandPresentation} from "../lib/NativeAseqCallbackPresentation.mjs";
import {extractNativeAseqCallbackObjectPresentation,frameWords} from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import {nativeAseqCallbackFrame} from "../lib/NativeAseqScriptOwnership.mjs";
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
const map=fs.readFileSync(path.join(source,"JOMO/MAPINFO.BIN"));
if(sha256(map)!==mapHash)throw Error("Changed original family-crest map source");
const program=JSON.parse(fs.readFileSync(path.join(root,"tools/evidence/family-crest-callback-ir.json")));
const functions=[program.function,...program.supportingFunctions];
const owner=functions.find(fn=>fn.id==="0x6e62c"),callback=functions.find(fn=>fn.id==="0x6f234");
const ownerActions=owner?.blocks.flatMap(block=>block.actions)||[];
if(program.source.mapinfoSha256!==mapHash||program.source.callbackFunction!=="0x6f234"
  ||!ownerActions.some(a=>a.kind==="childCoroutineLaunch"&&a.targetFileOffset==="0x6f234")
  ||!ownerActions.some(a=>a.semanticId==="native-operation-0050-aseq-activity-control"&&a.arguments[0]?.value===15)
  ||!ownerActions.some(a=>a.operationId===0x019d&&a.arguments[1]?.value===0x9a094)
  ||map.subarray(0x9a094,map.indexOf(0,0x9a094)).toString("ascii")!=="$TUB0210G.MT5") {
  throw Error("Changed original family-crest owner, activity, or handguard association");
}
const input={bytes:map,callbackFunction:0x6f234,nativeFunction:callback,functions,activitySlot:0,durationFrames:1600};
const hands=extractNativeAseqCallbackHandPresentation(input);
const objects=extractNativeAseqCallbackObjectPresentation({...input,objectTags:["TUBA"]});
const frame=action=>nativeAseqCallbackFrame(map,0x6f234,callback,action,functions);
const floatWord=word=>{const bytes=Buffer.alloc(4);bytes.writeUInt32LE(word);return bytes.readFloatLE();};
const operations=callback.blocks.flatMap(block=>block.actions.map(action=>({block,action})))
  .filter(({action})=>action.arguments?.[0]?.ascii==="TUBA");
const nativeVectors=operations.filter(({action})=>["resolved-object-vector-initialize","resolved-object-vector-operation"].includes(action.semanticId))
  .map(({block,action})=>{
    if(action.arguments[1]?.value!==0x38000000)throw Error("Unsupported family-crest object-vector flags");
    const words=frameWords(callback,block,action.arguments[2],action);
    return {activitySlot:0,frame:frame(action),semanticId:action.semanticId,flags:action.arguments[1].value,
      words,callFileOffset:action.callFileOffset,frameVectorOffset:action.arguments[2].offset};
  });
// The native interpreter proves vector arithmetic, but not FIXO's full render
// propagation after a detach. During the bounded tabletop interval only, the
// browser interprets these original operands as an absolute standalone pose.
// Other detached intervals stay hidden; this does not emulate native arithmetic.
const tableVectors=nativeVectors.filter(cue=>cue.frame===325);
const nextGrip=objects.attachedObjectCues.find(cue=>cue.frame>325&&cue.action==="attach");
if(tableVectors.length!==2||nextGrip?.frame!==396)throw Error("Changed original family-crest tabletop interval");
const worldTransforms=[{activitySlot:0,frame:325,lastFrame:nextGrip.frame-1,
  ...Object.fromEntries(tableVectors.map(cue=>[
    cue.semanticId==="resolved-object-vector-initialize"?"position":"rotationRaw",
    cue.semanticId==="resolved-object-vector-initialize"?cue.words.map(floatWord):cue.words.map(word=>word&0xffff),
  ])),sourceCalls:tableVectors.map(cue=>cue.callFileOffset),
}];
const presentation=[{activitySlot:0,frame:0,visible:true,source:"authored-initial-visible-baseline",reason:"Allows the first native grip before the callback's later explicit visibility flags."},
  ...operations.filter(({action})=>action.semanticId==="resolved-object-runtime-flag")
    .map(({action})=>({activitySlot:0,frame:frame(action),visible:action.arguments[1].value===1,callFileOffset:action.callFileOffset}))];
const assetSources=[
  ["JOMO/TUB0210G.MT5",45548,"65cbbf5d36cea3add3b5184bb9a3027137871ef13c15614df7a58b848fcd09e4"],
  ["MODEL/HAND/YKB_TL.MT5",40704,"517a3423b4cb2c7f96f9cb71475e3f34bc6891af1a0fe892b85c8810826936ec"],
  ["MODEL/HAND/YKB_TR.MT5",40760,"1564720156a4967703256cf4e1070e69c660cd57296bdf3b8ea13bffc46dccb8"],
  ["MODEL/HAND/YKB_HM.BIN",9264,"bd81f3033c0be237e5f52aa1976166e1376dd1c8c2b3ec66948f25d08fbc9729"],
  ["MODEL/HAND/INE_TL.MT5",47812,"25e9cd4b53d933f76887fb0a9e1cfe168a54e4032d5856e8b96e7d54dabe117e"],
  ["MODEL/HAND/INE_TR.MT5",47868,"4ce6cec8fd94d7ce04bc8fe3cedffc7eb28475bcd27bf25ef7a05e9ff8ede101"],
  ["MODEL/HAND/INE_HM.BIN",9264,"c386a4f223da87a797bfafb9990507fb02cc72e122d47ccaa6fc43d417a72ff5"],
];
for(const [filename,byteLength,digest] of assetSources)members.push({name:path.basename(filename),sourcePath:path.join(source,filename),
  sourceManifestPath:`disc2/SCENE/02/${filename}`,byteLength,sha256:digest});
const handAsset=name=>{
  const sourceMember=members.find(member=>member.name===name);
  return {path:`${prefix}/${name}`,sourcePath:sourceMember.sourceManifestPath,bytes:fs.readFileSync(sourceMember.sourcePath)};
};
const handAssets=Object.fromEntries([["AKIR","YKC_M","YKB"],["INE_","INE_M","INE"]].map(([actorTag,bodyModelCode,handCode])=>[
  actorTag,describeNativeAseqHandAssets({actorTag,bodyModelCode,handCode,left:handAsset(`${handCode}_TL.MT5`),
    right:handAsset(`${handCode}_TR.MT5`),rig:handAsset(`${handCode}_HM.BIN`)}),
]));
const attachedObjects={TUBA:{model:"TUB0210G",browserFilename:"S1_JOMO_TUB0210G.MT5",assetPath:`${prefix}/TUB0210G.MT5`,
  // This loose MT5 contains its original TEXD/TEXN texture payload. It is not
  // byte-identical to the Bunkado CHRM and must not reuse that shop's model.
  source:{path:"disc2/SCENE/02/JOMO/TUB0210G.MT5",sha256:assetSources[0][2],ownerFunction:"0x6e62c",requestStringOffset:"0x9a094"},
  attachments:objects.attachedObjectCues.filter((cue,index,all)=>all.findLastIndex(other=>other.frame===cue.frame)===index),
  worldTransforms,presentation,
  standalonePoseAdaptation:{kind:"bounded-original-vector-operands-as-absolute-pose",firstFrame:325,lastFrame:395,nativeVectorOperations:nativeVectors,
    reason:"Only frames 325-395 use the original position/rotation operands as an absolute standalone pose; native FIXO-to-world render propagation is not recovered. Other detached intervals remain hidden."},
}};
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_handguard_family_pack.mjs",resourceName:"01136",disc:2,
  sourceMembers:members,expectedMembers:members,bindingEvidence:evidence,
  selectionRule:"Exact embedded JOMO AUTH at native slot 15, owned by 0x6e62c and callback 0x6f234; packaged as slot 0. Original hand poses, component animation, attachments and visibility are compiled as data. Frames 325-395 use original vector operands as an absolute tabletop pose, with an authored initial visibility baseline; native FIXO-to-world propagation remains unresolved.",
  outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),audioManifest:`${audioPrefix}/manifest.json`,
  motionBanks:[{bank:17,member:"M_01136.MOTN",expectedSequences:[{index:5,name:"AKI_SUWARU_YUKIWA_BUTUMA_0136"},{index:4,name:"JIJ_INE_AT1_YUKIWA_BUTUMA_0100"}]}],
  activities:[{slot:0,binding:{kind:"map-embedded-slot",nativeSlot:15,ownerFunction:"0x6e62c",callbackFunction:"0x6f234"},file:"CREST.AUTH",actors:["AKIR","INE_"],durationFrames:1600,frameCount:28,...hands}],
  handAssets,nativeHandPoseTables:hands.nativeHandPoseTables,attachedObjects,
  outputMembers:assetSources.map(([filename])=>path.basename(filename)),
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
// Presentation-only rebuilds must register their added binaries as well.
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...manifest.outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log("Built original family-crest presentation; no story settlement or publication.");
