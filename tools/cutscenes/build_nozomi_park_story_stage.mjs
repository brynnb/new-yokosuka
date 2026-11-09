#!/usr/bin/env node
// Adapt the existing original DNOZ films into a private Story stage. The live
// residence remains loaded while the dedicated original park geometry is leased.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root=path.resolve(import.meta.dirname,"../.."),source=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const originalMap=fs.readFileSync(path.join(source,"data/SCENE/01/DNOZ/MAPINFO.BIN"));
const chrs=originalMap.indexOf("CHRS"),binding=parseChrtSceneObjectBindings(originalMap.subarray(chrs)).find(x=>x.actorTag==="HRSK");
if(binding?.model!=="NZM_M")throw Error("Original DNOZ Nozomi binding changed");
const original=fs.readFileSync(path.join(source,"data/SCENE/01/MODEL/CHARA/NZM_M.MT5"));
const sourceHash="1f705b462f4bdc8cff50c4f1a5a0f57c35b163c1560d4b05b414169aa2138c79";
if(sha256(original)!==sourceHash)throw Error("Original DNOZ Nozomi model changed");
const prefix="play/assets/sakuragaoka/nozomi-park-story",outputs=[];
const write=(name,bytes)=>{const p=`${prefix}/${name}`,f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});if(fs.existsSync(f)&&!fs.readFileSync(f).equals(bytes))throw Error(`Refusing to overwrite ${p}`);fs.writeFileSync(f,bytes);outputs.push({path:p,byteLength:bytes.length,sha256:sha256(bytes)});};
write("NZM_M.CHRM",original);write("NZM_textures.bin",extractNativeTexnPack(original,"NZM_M.MT5").bytes);
const actor={label:"Nozomi Harasaki",modelCode:"NZM_M",browserFilename:"NZM_M.CHRM",assetFormat:"MT5",characterScale:1,assetPath:`${prefix}/NZM_M.CHRM`,textureAssetPath:`${prefix}/NZM_textures.bin`,sourceBinding:{...binding,mapInfoChrsOffset:chrs}};
const environment=JSON.parse(fs.readFileSync(path.join(root,"play/assets/sakuragaoka/dnoz-environment/manifest.json")));
const stageOutputs=environment.layers.map(layer=>({path:`play/assets/sakuragaoka/dnoz-environment/${layer.outputName}`,byteLength:layer.byteLength,sha256:layer.sha256}));
for(const item of stageOutputs){const b=fs.readFileSync(path.join(root,item.path));if(b.length!==item.byteLength||sha256(b)!==item.sha256)throw Error(`Changed original park layer ${item.path}`);}
const manifests=[];
for(const [name,sourceName]of [["confession","dnoz-ski"],["tears","dnoz"]]){
  const m=JSON.parse(fs.readFileSync(path.join(root,`play/assets/sakuragaoka/${sourceName}/manifest.json`)));
  m.generatedBy="tools/cutscenes/build_nozomi_park_story_stage.mjs";
  m.packageActors={...(m.packageActors||{}),HRSK:actor};m.outputs=[...m.outputs,...outputs,...stageOutputs];
  // The viewer's original DNOZ package borrows the scheduled NZM_L model;
  // this private stage uses the CHRS-bound NZM_M, which has the same -66/-65
  // hand seams. Keep the source hand rig while declaring its actual body.
  if(m.handAssets?.HRSK?.bodyModelCode!=="NZM_L")throw Error("Changed DNOZ source hand assignment");
  m.handAssets.HRSK.bodyModelCode=binding.model;
  m.activities=m.activities.map(a=>({...a,binding:{kind:"map-embedded-slot"},browserMapVisibility:[],browserIsolatedStage:true,browserIsolatedEnvironment:false}));
  const p=`${prefix}/${name}.json`;fs.writeFileSync(path.join(root,p),JSON.stringify(m,null,2)+"\n");manifests.push(p);
}
const provenance=`${prefix}/manifest.json`;
fs.writeFileSync(path.join(root,provenance),JSON.stringify({schema:"new-yokosuka-authored-scene-assets-v1",generatedBy:"tools/cutscenes/build_nozomi_park_story_stage.mjs",source:{model:"disc1/SCENE/01/MODEL/CHARA/NZM_M.MT5",sha256:sourceHash,map:"disc1/SCENE/01/DNOZ/MAPINFO.BIN",mapSha256:sha256(originalMap),binding},outputs},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",provenance,...manifests,...outputs.map(o=>o.path),...stageOutputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log("Prepared original Nozomi and park stage for isolated Story playback.");
