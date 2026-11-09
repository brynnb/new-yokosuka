#!/usr/bin/env node
// Extract the original event motion bank; the native DYNAMICS controller is
// not decoded and must not be represented as recovered choreography.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {parseChrtSceneObjectBindings} from "../lib/chrt_scene_object_bindings.js";

const root=path.resolve(import.meta.dirname,"../..");
const source=process.env.SHENMUE_DISC1_EXTRACTED_ROOT||path.join(root,"extracted_files");
const archives=[
  ["data/SCENE/01/JU00/JQSO.PKS","956fd7b8441f3538c3a99a59aae840f522dc8238089ba202fc15d98d0b3db87f"],
  ["data/SCENE/01/JU00/JQSO.PKF","ef9663f127fd955c6c7a90ef4496744df11360ccee34725110b4a3cc3553997e"],
];
const read=([relative,hash])=>{const bytes=fs.readFileSync(path.join(source,relative));if(sha256(bytes)!==hash)throw Error(`Changed original asset ${relative}`);return parseIpacActivityArchive(bytes);};
const [models,bindingsArchive]=archives.map(read);
const bindings=parseChrtSceneObjectBindings(bindingsArchive.members.find(m=>m.name==="CHARA.CHRT").bytes);
if(bindings.find(b=>b.actorTag==="FBB_")?.model!=="FBB0201G")throw Error("Original football binding changed");
const ball=models.members.find(m=>m.name==="FBB0201G.CHRM")?.bytes;
if(!ball||sha256(ball)!=="5d27cea0f483ec2906346af2fc468729b8c2f9276ca221e3f47389278549583e"
  ||!fs.readFileSync(path.join(root,"play/assets/sakuragaoka/gao-wen/FBB0201G.CHRM")).equals(ball))throw Error("Existing original football asset is missing or differs");
const motion=models.members.find(m=>m.name==="M_01113.MOTN")?.bytes;
if(!motion||sha256(motion)!=="2e229983ef457320f771a5465f6a240318fe6c55df37fedac9d72c17db1212b8")throw Error("Original football motions changed");
const prefix="play/assets/yamanose/football",assetPath=`${prefix}/M_01113.MOTN`,filename=path.join(root,assetPath);
fs.mkdirSync(path.dirname(filename),{recursive:true});
if(fs.existsSync(filename)&&!fs.readFileSync(filename).equals(motion))throw Error(`Refusing to overwrite ${assetPath}`);
fs.writeFileSync(filename,motion);
const manifestPath=`${prefix}/manifest.json`;
fs.writeFileSync(path.join(root,manifestPath),JSON.stringify({schema:"new-yokosuka-authored-scene-assets-v1",generatedBy:"tools/cutscenes/build_yamanose_football_assets.mjs",bindings,outputs:[{path:assetPath,byteLength:motion.length,sha256:sha256(motion),source:{path:archives[0][0],sha256:archives[0][1],member:"M_01113.MOTN"}}],reusedBall:{path:"play/assets/sakuragaoka/gao-wen/FBB0201G.CHRM",sha256:sha256(ball),source:{path:archives[0][0],sha256:archives[0][1],member:"FBB0201G.CHRM"}}},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",manifestPath,assetPath],{cwd:root,stdio:"inherit"});
console.log("Extracted original football motions; the native event controller remains undecoded.");
