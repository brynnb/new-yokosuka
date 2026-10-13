// Exact local assets for authored tattoo-parlor staging. No room-controller
// reconstruction; keep the archive and member hashes as provenance.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import { parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const source=fs.readFileSync(path.join(sourceRoot,"data/SCENE/01/TATQ/QTE.PKS"));
if(sha256(source)!=="2c7d24b8f92596871e765852e174e04aef99bcaada5efa1d610aa854302993a8")throw new Error("Changed TATQ QTE archive");
const members=parseIpacActivityArchive(source).members;
const output=path.join(root,"play/assets/characters");fs.mkdirSync(output,{recursive:true});
for(const [name,hash]of [["BIS_L.CHRM","1f3f0f873d8b42d401d2ff7973b95cac14ec67151cf66427a3e41cffbacc1877"],["BIS_F.CHRM","00805064861388a815a54cb3da2aef30e589954119bdf7afc99bd7d32b529719"]]){
 const member=members.find(m=>m.name===name);if(!member||sha256(member.bytes)!==hash)throw new Error(`Changed ${name}`);
 fs.writeFileSync(path.join(output,name),member.bytes);
}
const textureSource=fs.readFileSync(path.join(sourceRoot,"data/SCENE/01/TATQ/QTE.PKF"));
if(sha256(textureSource)!=="9e80455b4c5d526321306a950ee515fba9075f987f65611e1701c264d3eefdd1")throw new Error("Changed TATQ QTE texture archive");
const textures=extractNativeTexnPack(textureSource,"TATQ QTE textures");
fs.writeFileSync(path.join(output,"BIS_textures.bin"),textures.bytes);
execFileSync(process.execPath,[path.join(root,"tools/runtime-assets.mjs"),"update",
 "play/assets/characters/BIS_L.CHRM","play/assets/characters/BIS_F.CHRM","play/assets/characters/BIS_textures.bin"],{cwd:root,stdio:"inherit"});
console.log(`Exported TATQ body, face and ${textures.entries.length} original textures.`);
