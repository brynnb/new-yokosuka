#!/usr/bin/env node
// Original AUTH presentation inside authored Story progression. Scene order and
// prop bindings are reviewed adaptations, not execution of the MS08 controller.
import fs from "node:fs";
import path from "node:path";
import {buildNativeAseqActivityPack,parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {buildNativeAseqAudioPack} from "../lib/NativeAseqAudioPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const source=p=>path.join(sourceRoot,"data/SCENE/02",p);
const prefix="play/assets/harbor/master-chen",audioPrefix="public/audio/world/master-chen";
const archive=fs.readFileSync(source("MS08/MS08.PKS"));
const archiveHash="248536436354c9cd22221140886f5583282f5879fc2a5ca240bc1c3b4f8da64f";
if(sha256(archive)!==archiveHash)throw Error("Changed original MS08 archive");
// The whole archive pin authenticates every member; do not duplicate 46 hand-
// maintained hashes. The shared compiler independently validates AUTH/motions.
const members=parseIpacActivityArchive(archive).members;
const map=fs.readFileSync(source("MS08/MAPINFO.BIN"));
if(sha256(map)!=="693131be8e2106c08975b75959780006dec6a79a981c910819f614b324e73e90")throw Error("Changed original MS08 bindings");
const texturesArchive=fs.readFileSync(source("MS08/MS08.PKF"));
if(sha256(texturesArchive)!=="f17779437c82b2858cc1458f68ae0bfbcb5343756d6df4d1483a1f38259f1fd4")throw Error("Changed original MS08 textures");
const textures=extractNativeTexnPack(texturesArchive,"MS08/MS08.PKF");
const activities=[
  [0,0x2ca34,0,"SARA AKIR",140,6],
  [1,0x2ca46,1,"AKIR TAIJ KISY",1320,20],
  [2,0x2ca58,3,"AKIR TAIJ KISY",1830,32],
  [3,0x2ca6a,6,"SARA AKIR TAIJ KISY",2360,75],
].map(([slot,primaryPointer,number,tags,durationFrames,frameCount])=>{
  const nativeName=`SEQDATA${number}.BIN`;
  if(map.subarray(primaryPointer,primaryPointer+nativeName.length).toString("ascii")!==nativeName
    ||map.subarray(primaryPointer+13,primaryPointer+17).toString("ascii")!=="MS08")throw Error(`Changed original ${nativeName} resource pair`);
  return {slot,primaryPointer,secondaryPointer:primaryPointer+13,file:`SEQDATA${number}.AUTH`,actors:tags.split(" "),durationFrames,frameCount};
});
const character=(label,modelCode)=>({label,modelCode,browserFilename:`${modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,
  assetPath:`${prefix}/${modelCode}.CHRM`,textureAssetPath:`${prefix}/textures.bin`});
const letterAttach=(frame,parentActorTag)=>({activitySlot:3,frame,parentActorTag,controlId:18,translation:[0,0,0],rotationRaw:[0,0,0]});
const manifest=buildNativeAseqActivityPack({
  generatedBy:"tools/cutscenes/build_harbor_meeting_pack.mjs",resourceName:"MS08",disc:2,
  sourcePath:source("MS08/MS08.PKS"),sourceManifestPath:"disc2/SCENE/02/MS08/MS08.PKS",archiveSha256:archiveHash,
  expectedMembers:members.map(m=>({name:m.name,byteLength:m.bytes.length,sha256:sha256(m.bytes)})),
  bindingEvidence:"docs/design/story-event-template.md#master-chens-first-meeting",
  selectionRule:"AUTH-extension ordinals with original MAPINFO filename/resource literals; authored progression selects 0, 6, 1, 3. Native owner branching is not reconstructed.",
  audioManifest:`${audioPrefix}/manifest.json`,outputDirectory:path.join(root,prefix),outputAssetPrefix:prefix,manifestPath:path.join(root,prefix,"manifest.json"),
  motionBanks:[{bank:16,member:"M_0154.MOTN"}],activities,
  outputMembers:["SYU_M.CHRM","KIS_M.CHRM","NSR02YKG.CHRM","MALS507G.CHRM"],
  generatedAssets:[{assetPath:`${prefix}/textures.bin`,bytes:textures.bytes,source:{path:"disc2/SCENE/02/MS08/MS08.PKF",sha256:sha256(texturesArchive)}}],
  packageActors:{TAIJ:character("Master Chen","SYU_M"),KISY:character("Chen Gui Zhang","KIS_M")},
  // NSR02YKG is the original small dish (0.338 x 0.311 x 0.036 m).
  // Its SARA binding is a declared adaptation; original AMOV supplies the fall.
  sceneObjects:{SARA:{model:"NSR02YKG.CHRM",browserFilename:"NSR02YKG.CHRM",assetPath:`${prefix}/NSR02YKG.CHRM`,textureAssetPath:`${prefix}/textures.bin`}},
  attachedObjects:{TEGS:{browserFilename:"MALS507G.CHRM",assetPath:`${prefix}/MALS507G.CHRM`,textureAssetPath:`${prefix}/textures.bin`,
    attachments:[letterAttach(1530,"AKIR"),letterAttach(1850,"TAIJ")],
    presentation:[{activitySlot:3,frame:0,visible:false},{activitySlot:3,frame:1530,visible:true}],
  }},
});
console.log(`Built Master Chen presentation: ${manifest.activities.length} original AUTH segments`);

if(process.argv.includes("--audio")){
  const first=paths=>paths.filter(Boolean).find(fs.existsSync);
  const dtpkDump=first([process.env.DTPK_DUMP,path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py")]);
  const vgmstream=first([process.env.VGMSTREAM_CLI,path.join(root,".disc-work/tooling/vgmstream/vgmstream-cli"),"/usr/local/bin/vgmstream-cli"]);
  if(!dtpkDump||!vgmstream)throw Error("Set DTPK_DUMP and VGMSTREAM_CLI to the existing native audio tools");
  // These four exact authored references are absent from the MS08-requested
  // A1_CHIDE bank. Retain explicit unavailable records, never substitute audio.
  const unavailableSounds=Object.fromEntries([
    ["a9042400","smallobject/Swich2"],["a9041f00","cloths2/furimuki_n01"],
    ["a9041b00","foot/Akirafoot1a"],["a9042700","smallobject/latterpocket"],
  ].map(([hex,name])=>[`${hex}:/p16/prj16m5/AUTH01/0154/SE/${name}.aiff`,{
    reason:"Original AUTH reference is absent from the original MS08-requested A1_CHIDE sound bank; incidental effect omitted.",
    evidence:"disc2/SCENE/02/MS08/MAPINFO.BIN#A1_CHIDE.SND; SHA256 693131be8e2106c08975b75959780006dec6a79a981c910819f614b324e73e90",
  }]));
  const audio=buildNativeAseqAudioPack({generatedBy:"tools/cutscenes/build_harbor_meeting_pack.mjs",disc:2,
    authDirectory:path.join(root,prefix),authFiles:activities.map(a=>a.file),authManifest:`${prefix}/manifest.json`,resourceBindingEvidence:manifest.nativeBinding.evidence,
    stream:{label:"A0154.AFS",path:source("STREAM/A0154.AFS"),manifestPath:"disc2/SCENE/02/STREAM/A0154.AFS",sha256:"d45fb726e2c90f5bd0c4c64e97de1f326bd26e8920606f58317a2da1efdc91b6"},
    soundBank:{label:"A1_CHIDE.SND",path:source("SOUND/A1_CHIDE.SND"),manifestPath:"disc2/SCENE/02/SOUND/A1_CHIDE.SND",sha256:"145dafb358c5cb796c1f529e95e861e83fa3f59bae4e1ac83c9d27a4f2ebaf71"},
    unavailableSounds,outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,dtpkDump,vgmstream,python:process.env.DTPK_PYTHON||"python3",
  });
  console.log(`Built Master Chen audio: ${audio.voices.length} voices; ${audio.sounds.filter(s=>!s.unavailable).length} effects, ${audio.sounds.filter(s=>s.unavailable).length} explicitly unavailable`);
}
