#!/usr/bin/env node
// Original battle bodies, one bounded render pool and ordinary combat data.
// Wave composition/balance are explicit adaptations, not native AI recovery.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {afsMembers} from "../lib/NativeAseqAudioPack.mjs";
import {parseIpacActivityArchive,sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";
const root=path.resolve(import.meta.dirname,"../.."),prefix="play/assets/harbor/seventy-man",generatedBy="tools/scripting/build_final_battle.mjs";
const source=path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT||path.join(root,"extracted_disc3_v2"),"data/SCENE/03/MFBT");
const pins={"MPK00.PKS":"5fd31560b02db5f5c7a536962961f455747f6dcfd65dad3362834ccd31f508ec","MPK00.PKF":"90993e6bd9dd305bccab7645580e257df308f135a50baf6f52a1e7f1a723b135","BATTLE70.AFS":"419e1e2d0fd7c5405d716cb74e7f2ca22bc55a20d484b2281c474e4c4641c4d5"};
const inputs=Object.fromEntries(Object.entries(pins).map(([name,hash])=>{const b=fs.readFileSync(path.join(source,name));if(sha256(b)!==hash)throw Error("Changed original battle source "+name);return[name,b]}));
const members=parseIpacActivityArchive(inputs["MPK00.PKS"]).members;
const afs=afsMembers(inputs["BATTLE70.AFS"],"BATTLE70.AFS"),nested=afs.find(m=>m.name==="BTC_S.PKS");
if(!nested)throw Error("Missing original BTC_S archive");
const small=parseIpacActivityArchive(nested.bytes).members.find(m=>m.name==="BTC_S.CHRM");
if(!small)throw Error("Missing original BTC_S body");
const outputs=[],sources=[];fs.mkdirSync(path.join(root,prefix),{recursive:true});
function output(name,bytes,provenance){const assetPath=`${prefix}/${name}`;fs.writeFileSync(path.join(root,assetPath),bytes);outputs.push({path:assetPath,byteLength:bytes.length,sha256:sha256(bytes)});sources.push({output:assetPath,...provenance});return assetPath}
const textures=output("textures.bin",extractNativeTexnPack(inputs["MPK00.PKF"],"MPK00.PKF").bytes,{archive:"MPK00.PKF",sha256:pins["MPK00.PKF"]});
const smallPKF=afs.find(m=>m.name==="BTC_S.PKF");if(!smallPKF)throw Error("Missing original BTC_S textures");
const smallTextures=output("BTC_S-textures.bin",extractNativeTexnPack(smallPKF.bytes,"BTC_S.PKF").bytes,{archive:"BATTLE70.AFS",sha256:pins["BATTLE70.AFS"],member:"BTC_S.PKF"});
const codes=["BTA_S","BTH_S","BTK_S","BTM_S","BTN_S","BTO_S","BTP_S","BTC_S"];
const definitions=codes.map((code,index)=>{
  const bytes=code==="BTC_S"?small.bytes:members.find(m=>m.name===code+".CHRM")?.bytes;
  if(!bytes)throw Error("Missing original fighter "+code);
  const assetPath=output(code+".CHRM",bytes,{archive:code==="BTC_S"?"BATTLE70.AFS":"MPK00.PKS",sha256:pins[code==="BTC_S"?"BATTLE70.AFS":"MPK00.PKS"],member:code==="BTC_S"?"BTC_S.PKS/BTC_S.CHRM":code+".CHRM"});
  return{actorCode:`R00${index+1}`,label:"Mad Angels fighter",modelCode:code,browserFilename:code+".CHRM",assetFormat:"MT5",characterScale:1,assetPath,textureAssetPath:code==="BTC_S"?smallTextures:textures,activityOnly:true};
});
const shared=(filename,pin)=>{const b=fs.readFileSync(path.join(root,filename));if(sha256(b)!==pin)throw Error("Changed shared battle cast "+filename);return JSON.parse(b).packageActors};
const chen=shared("play/assets/harbor/master-chen/manifest.json","a997ad1a777bc5e175e733245002de2245eec3550dc253e0e79057b73041de9b");
const rescue=shared("play/assets/harbor/nozomi-rescue/manifest.json","e5ead3f29e62608ab03873c5c3d419ae10924b8d4122a029bd29c175f573d9e0");
for(const [tag,code]of [["TERY","ACS_M"],["STSI","KMA_L"],["MRSK","PPL_L"],["PEDR","JNC_L"]])if(rescue[tag]?.modelCode!==code)throw Error("Incorrect character-table binding "+tag);
definitions.push(...["KISY","MRSK","PEDR","STSI"].map(actorCode=>({actorCode,...(actorCode==="KISY"?chen:rescue)[actorCode],activityOnly:true})));
const origin=[-23.4,0,65.8]; // Existing rendered clear Combat Practice floor.
const formation={AKIR:[0,0,0],KISY:[1.6,0,0],R001:[0,0,-4],R002:[3,0,-3],R003:[-3,0,-3],R004:[4,0,1],R005:[-4,0,1],R006:[3,0,4],R007:[-3,0,4],R008:[0,0,5],MRSK:[0,0,-5],PEDR:[2,0,-5],STSI:[-2,0,-5]};
const scene={id:"s1.mfbt.seventy-man",area:"MFBT",worldId:"mfbt",actorDefinitions:definitions,
  provenance:"Original MFBT MPK00/BATTLE70 bodies; named boss mappings from project character table. Authored13-model render pool,67 regular opponents plus3 bosses over10 reinforcements; not recovered native roster, spawns or AI. Use the existing rendered clear practice floor. Gui Zhang is a friendly autonomous ally; original moves, adapted health/balance and arrival holds.",
  actors:Object.entries(formation).map(([tag,p])=>({tag,pose:{x:-(origin[0]+p[0]),y:0,z:origin[2]+p[2],rotationX:0,rotationY:0,rotationZ:0},motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}})),
  camera:{positionX:-origin[0],positionY:3,positionZ:origin[2]+6,targetX:-origin[0],targetY:1,targetZ:origin[2]-2,roll:0,perspective:60}};
const manifest={schema:"new-yokosuka-original-battle-assets-v1",generatedBy,sources,outputs,actorDefinitions:definitions,provenance:scene.provenance};
fs.writeFileSync(path.join(root,prefix,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
const victory={...scene,id:"s1.mfbt.seventy-man-victory",actors:scene.actors.filter(a=>["AKIR","KISY"].includes(a.tag)),actorDefinitions:definitions.filter(a=>a.actorCode==="KISY"),
  provenance:"Authored unvoiced acknowledgement after independently simulated70-opponent victory. Original Ryo/Gui Zhang bodies and standing motion, held clear-floor roots and camera; no original boss ending, Terry result or departing outcome is claimed."};
fs.writeFileSync(path.join(root,"play/data/story-final-battle.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy,motionBanks:{},scenes:[scene,victory]},null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",`${prefix}/manifest.json`,...outputs.map(o=>o.path)],{cwd:root,stdio:"inherit"});
console.log("Built original battle bodies and a13-model shared pool; no enemy defeats or story effects.");
