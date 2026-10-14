// Original MGQB motion bank for authored harbor staging; no QTE-controller
// reconstruction. The server challenge remains the only success authority.
import fs from "node:fs";
import path from "node:path";
import { parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { MotnLoader } from "../../src/MotnLoader.js";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2");
const archive=fs.readFileSync(path.join(sourceRoot,"data/SCENE/02/MFSY/MGQB.PKS"));
if(sha256(archive)!=="01b474e199a9c029bdb547ea5de32b94aba67739455248d8c9bb463ffceebd5c")throw Error("Changed original MGQB archive");
const member=parseIpacActivityArchive(archive).members.find(m=>m.name==="M_MGQB.MOTN");
if(!member||member.bytes.length!==174608||sha256(member.bytes)!=="e347dfa4f127eee23a76f879c7b86a935a0002e7ad4437c333856269db2703a4")throw Error("Changed original MGQB motion");
const bank=MotnLoader.parse(member.bytes);
const reviewed=[
 [0,"OTH_THO_TALK_STAND_YANKII_LP_F"], [3,"OTH_GRO_TANOMU_KATUAGE_QTE"],
 [6,"AKI_SEIKOU_W3QTE"], [7,"OTH_TKA_SEIKOU_W3QTE"], [31,"OTH_MAN_BIBIRU_LP_QTE"],
];
for(const [index,name] of reviewed)if(bank.sequences[index]?.name!==name||bank.sequences[index].valueData?.complete!==true)throw Error(`Incomplete original MGQB clip ${index}`);
const prefix="play/assets/harbor/goro-encounter",output=path.join(root,prefix);
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,member.name),member.bytes);
const manifest={schema:"new-yokosuka-authored-story-assets-v1",generatedBy:"tools/cutscenes/build_goro_story_assets.mjs",
 source:{disc:2,path:"disc2/SCENE/02/MFSY/MGQB.PKS",sha256:sha256(archive)},
 outputs:[{path:`${prefix}/${member.name}`,byteLength:member.bytes.length,sha256:sha256(member.bytes)}],
 sequences:reviewed.map(([index])=>{const s=bank.sequences[index];return{index,name:s.name,durationFrames:s.durationFrames,controllerFamilyIndex:s.controllerFamilyIndex};}),
 adaptation:"Original motion bank with authored phone-booth staging and held challenge shot. Original winning paired clip plays only after the server accepts Left/A/B. Native DYNAMICS branching/camera choreography is not reproduced."};
fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Built original MGQB Story motion bank");
