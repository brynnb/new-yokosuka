#!/usr/bin/env node
// OMG.CHRM props use TEXN records in the matching OMG.PKF, not D000's map
// palette. Produce their shared original pack without converting the images.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { externalTextureKeysFromMt5 } from "../../src/assetLoader.js";

const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root,"extracted_files");
const source=readFileSync(path.join(sourceRoot,"data/SCENE/01/D000/OMG.PKF"));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const sourceHash="2b60a77f6e57d5371ad31d6f74dcf4d6b12c0fd72e0865bf5fb14bb57a415cc4";
if(sha(source)!==sourceHash)throw Error("Unexpected D000/OMG.PKF source");
const pack=extractNativeTexnPack(source,"D000/OMG.PKF"),bytes=pack.bytes;
const index=Mt5Loader.buildTexturePackIndex(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const models=["DENS501G","GACM400G","GAT02L0G","GAT02L3G","HTL02DBG","JIHS5GTG","SEGM4SPG","TELM402G","TKO0101G","TKO0102G","WAGS500G"];
const coverage=models.map(name=>{
  const model=readFileSync(path.join(root,`play/assets/dobuita/${name}.CHRM`));
  const keys=externalTextureKeysFromMt5(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength));
  const missing=[...keys].filter(key=>!index.has(key));
  if(missing.length)throw Error(`${name}: missing ${missing.length} texture references from OMG.PKF`);
  return {model:name,sourceSha256:sha(model),textures:keys.size};
});
const output="play/assets/dobuita/OMG_textures.bin";
writeFileSync(path.join(root,output),bytes);
writeFileSync(path.join(root,"tools/evidence/d000-object-textures.json"),`${JSON.stringify({
  source:"disc1/data/SCENE/01/D000/OMG.PKF",sourceSha256:sourceHash,
  output,outputSha256:sha(bytes),byteLength:bytes.length,textureCount:pack.entries.length,coverage,
},null,2)}\n`);
console.log(`Extracted ${pack.entries.length} original textures (${bytes.length} bytes); ${models.length} model references verified.`);
