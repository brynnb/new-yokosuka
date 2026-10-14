// Original motion only. The existing authored scene player/Yarn own its
// presentation and outcome; this does not reconstruct the crate controller.
import fs from "node:fs";
import path from "node:path";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
const root=path.resolve(import.meta.dirname,"../..");
const archive=fs.readFileSync(path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT||path.join(root,"extracted_disc2_v2"),"data/SCENE/02/MFSY/MBUI.PKS"));
if(sha256(archive)!=="2bca65f726a8b939a7a0bb8c8b0fbb4b2bd49faab64000150ee42f8ecf9193b3")throw Error("Changed original MBUI archive");
const member=parseIpacActivityArchive(archive).members.find(m=>m.name==="M_0153A.MOTN");
if(!member||sha256(member.bytes)!=="5a941d6205a10bb95862f2a7af6d1e9d9633354365c35495e3140b0b9746d19c")throw Error("Changed original MBUI motion");
const sequence=MotnLoader.parse(member.bytes).sequences[1];
if(sequence.name!=="AKI_HAIRU_MADO_SOUKO_0153"||sequence.valueData?.complete!==true)throw Error("Incomplete original entering-window clip");
const prefix="play/assets/harbor/warehouse-eight",output=path.join(root,prefix);
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,member.name),member.bytes);
fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify({schema:"new-yokosuka-authored-story-assets-v1",generatedBy:"tools/cutscenes/build_warehouse_story_assets.mjs",
 source:{disc:2,path:"disc2/SCENE/02/MFSY/MBUI.PKS",sha256:sha256(archive)},
 outputs:[{path:`${prefix}/${member.name}`,byteLength:member.bytes.length,sha256:sha256(member.bytes)}],
 sequences:[{index:1,name:sequence.name,durationFrames:sequence.durationFrames,controllerFamilyIndex:sequence.controllerFamilyIndex}],
 adaptation:"Original entering-window clip with authored platform alignment and shot. Crate physics, incremental climb and original window-controller cues are not reproduced. Server settlement owns the original MS8S arrival."},null,2)+"\n");
console.log("Built original MBUI Story motion bank");
