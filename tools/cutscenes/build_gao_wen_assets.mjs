#!/usr/bin/env node
// Original assets for authored staging, not a reconstruction of the KOJI owner.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";

const root=path.resolve(import.meta.dirname,"../..");
const source=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const exact=(relative,hash)=>{
  const bytes=fs.readFileSync(path.join(source,relative));
  if(sha256(bytes)!==hash)throw new Error(`Changed original asset ${relative}`);
  return bytes;
};
const pks="data/SCENE/01/JD00/KOJI.PKS",pkf="data/SCENE/01/JD00/KOJI.PKF";
const pksHash="0443e8099ea5d0e25aa1319b7cc539d160283d95b79b1e18ef95b6f8696d85a6";
const pkfHash="c18dbffe894b3e1e2e70643651c16cdb3e81583b412b6a996060603754497e55";
const archive=parseIpacActivityArchive(exact(pks,pksHash));
const textureArchive=exact(pkf,pkfHash);
const bindings=parseChrtSceneObjectBindings(parseIpacActivityArchive(textureArchive).members.find(m=>m.name==="CHARA.CHRT").bytes);
if(bindings.find(b=>b.actorTag==="CHRL")?.model!=="BIK_L"||bindings.find(b=>b.actorTag==="FBB_")?.model!=="FBB0201G")throw new Error("KOJI actor/model binding changed");
const prefix="play/assets/sakuragaoka/gao-wen";
const outputs=[];
const write=(assetPath,bytes,sourceRecord)=>{
  const filename=path.join(root,assetPath);fs.mkdirSync(path.dirname(filename),{recursive:true});
  if(fs.existsSync(filename)&&!fs.readFileSync(filename).equals(bytes))throw new Error(`Refusing to overwrite nonmatching ${assetPath}`);
  fs.writeFileSync(filename,bytes);
  outputs.push({path:assetPath,byteLength:bytes.length,sha256:sha256(bytes),source:sourceRecord});
};
for(const [name,hash,assetPath]of[
  ["BIK_L.CHRM","29bd5864daa461b8c455d5895e1df105418a1d9860ea5846869992ba34a49c52","play/assets/characters/BIK_L.CHRM"],
  ["FBB0201G.CHRM","5d27cea0f483ec2906346af2fc468729b8c2f9276ca221e3f47389278549583e",`${prefix}/FBB0201G.CHRM`],
  ["M_KOJI.MOTN","c8c7f32075a825975289a988cf22de0c9c06281abd3e40bd2de33f3aa5024c70",`${prefix}/M_KOJI.MOTN`],
]){
  const bytes=archive.members.find(m=>m.name===name)?.bytes;
  if(!bytes||sha256(bytes)!==hash)throw new Error(`Changed KOJI member ${name}`);
  write(assetPath,bytes,{path:pks,sha256:pksHash,member:name});
}
write("play/assets/characters/BIK_textures.bin",extractNativeTexnPack(textureArchive,"KOJI.PKF").bytes,{path:pkf,sha256:pkfHash});
// These original full MT5s also contain their TEXN pixels. Keep the existing
// character loader's model/texture-pack contract rather than inventing aliases.
for(const [code,hash]of[
  ["KMD","c4024cba2a9da3b4d45272ef65e44c456b00113289698e54704934bb41f5e8c1"],
  ["KAZ","bdb90f5a5463be74307967fcc9a75bfa5d47014c0554ed222650abb293d308e7"],
  ["OKA","eb2ee99ddb37b3e4c70705597d3b540dd6d0cc54cfa8a4174fbf6dbc1e7eb087"],
  ["PPL","2dc4a2a2f38dfd684b8fe7dd88e40207a9218b68ec206bf664271ecc550a29fc"],
]){
  const p=`data/SCENE/01/MODEL/CHARA/${code}_L.MT5`,bytes=exact(p,hash),sourceRecord={path:p,sha256:hash};
  write(`play/assets/characters/${code}_L.CHRM`,bytes,sourceRecord);
  write(`play/assets/characters/${code}_textures.bin`,extractNativeTexnPack(bytes,p).bytes,sourceRecord);
}
const manifestPath=`${prefix}/manifest.json`;
fs.writeFileSync(path.join(root,manifestPath),JSON.stringify({schema:"new-yokosuka-authored-scene-assets-v1",
  generatedBy:"tools/cutscenes/build_gao_wen_assets.mjs",bindings,outputs},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifestPath,...outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log("Built original Gao Wen cast, ball and motion assets. No story effects or publication.");
