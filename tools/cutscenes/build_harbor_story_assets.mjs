// Deterministic extraction for authored harbor events. Motion/model bytes stay
// original; Yarn and the shared presenter own gameplay and declared staging.
import fs from "node:fs";
import path from "node:path";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2");
const definitions=[{
  folder:"goro-encounter",archive:"MFSY/MGQB.PKS",sha256:"01b474e199a9c029bdb547ea5de32b94aba67739455248d8c9bb463ffceebd5c",
  motion:"M_MGQB.MOTN",motionSha256:"e347dfa4f127eee23a76f879c7b86a935a0002e7ad4437c333856269db2703a4",
  sequences:[[0,"OTH_THO_TALK_STAND_YANKII_LP_F"],[3,"OTH_GRO_TANOMU_KATUAGE_QTE"],[6,"AKI_SEIKOU_W3QTE"],[7,"OTH_TKA_SEIKOU_W3QTE"],[31,"OTH_MAN_BIBIRU_LP_QTE"]],
  adaptation:"Original bank, authored phone-booth staging and shot. Winning motion follows server-validated Left/A/B. Native DYNAMICS branching/camera choreography is not reproduced.",
},{
  folder:"warehouse-eight",archive:"MFSY/MBUI.PKS",sha256:"2bca65f726a8b939a7a0bb8c8b0fbb4b2bd49faab64000150ee42f8ecf9193b3",
  motion:"M_0153A.MOTN",motionSha256:"5a941d6205a10bb95862f2a7af6d1e9d9633354365c35495e3140b0b9746d19c",
  sequences:[[1,"AKI_HAIRU_MADO_SOUKO_0153"]],
  adaptation:"Original entering-window motion aligned to original MFSY return entry 5, not the two-window object's origin. Shot, platform alignment and climb confirmation are authored; crate physics/incremental climb are omitted. Server settlement owns the MS8S arrival.",
},{
  folder:"old-district-entry",archive:"MKSG/EVENT.PKS",sha256:"278572918f746220750e700c65b42a57c9872c3bc68baec95e41d61938d617a3",
  motion:"M_0153.MOTN",motionSha256:"34c93d4ed46449c91fe8ed522f4e25d99303badecfdd4b73f2667e883358d406",
  sequences:[[0,"AKI_ATAMABUTUKERU1_0153"],[10,"AKI_KAITYUUDENTOUTORU1_0153"],[12,"AKI_KANGAETEIRU_STAND_LP_0132"],[19,"AKI_OIDASU_SOUKOGAI_F"],[38,"GRD_KAIWA_STAND_LP_0132"],[39,"GRD_STAND_LP_0132"]],
  models:[{name:"KAIS500G.CHRM",sha256:"3163fd040eb7538b1bb7c230f18051a9d3202b2e4e45c1877e92b4dfc8df2d47"}],
  textures:{path:"MKSG/EVENT.PKF",sha256:"6f9938cb2d140e66046887b50d7a8501b8de5f889d87242aca42b294d8efbcf8"},
  adaptation:"Original head-bump/flashlight-catch bank and prop. Authored close-up at the harbor gate, held QTE pose and right-hand binding/cue. Right is server validated before original compound arrival; this does not complete stealth. Original room-controller, falling trajectory and guard-station choreography are not reconstructed.",
}];

for(const def of definitions){
  const archive=fs.readFileSync(path.join(sourceRoot,"data/SCENE/02",def.archive));
  if(sha256(archive)!==def.sha256)throw Error(`Changed original ${def.archive}`);
  const members=parseIpacActivityArchive(archive).members;
  const required=[{name:def.motion,sha256:def.motionSha256},...(def.models||[])];
  const outputs=required.map(row=>{
    const member=members.find(m=>m.name===row.name);
    if(!member||sha256(member.bytes)!==row.sha256)throw Error(`Changed ${def.archive} member ${row.name}`);
    return {name:row.name,bytes:member.bytes};
  });
  const bank=MotnLoader.parse(outputs[0].bytes);
  const sequences=def.sequences.map(([index,name])=>{
    const s=bank.sequences[index];
    if(s?.name!==name||s.valueData?.complete!==true)throw Error(`Incomplete ${def.archive} clip ${index}`);
    return {index,name,durationFrames:s.durationFrames,controllerFamilyIndex:s.controllerFamilyIndex};
  });
  if(def.textures){
    const bytes=fs.readFileSync(path.join(sourceRoot,"data/SCENE/02",def.textures.path));
    if(sha256(bytes)!==def.textures.sha256)throw Error(`Changed ${def.textures.path}`);
    outputs.push({name:"EVENT.PKF",bytes});
  }
  const prefix=`play/assets/harbor/${def.folder}`,output=path.join(root,prefix);
  fs.mkdirSync(output,{recursive:true});
  for(const file of outputs)fs.writeFileSync(path.join(output,file.name),file.bytes);
  fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify({
    schema:"new-yokosuka-authored-story-assets-v1",generatedBy:"tools/cutscenes/build_harbor_story_assets.mjs",
    source:{disc:2,path:`disc2/SCENE/02/${def.archive}`,sha256:def.sha256},
    ...(def.textures?{textureSource:{path:`disc2/SCENE/02/${def.textures.path}`,sha256:def.textures.sha256}}:{}),
    outputs:outputs.map(file=>({path:`${prefix}/${file.name}`,byteLength:file.bytes.length,sha256:sha256(file.bytes)})),
    sequences,adaptation:def.adaptation,
  },null,2)+"\n");
  console.log(`Built original harbor Story assets: ${def.folder}`);
}
