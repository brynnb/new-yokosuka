#!/usr/bin/env node
// Original Eri model and voices, staged at an authored reachable arcade
// approach. Her exact native evening placement and gestures are not decoded.
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"../..");
const schedule=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/dobuita.json")));
const eri=schedule.actors.find(actor=>actor.actorCode==="TJMA");
if(!eri||eri.modelCode!=="RFD_L"||eri.label!=="Eri Tajima")throw Error("Changed original Eri actor binding");
const pose=(x,y,z,rotationY)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
const scene={id:"s1.d000.eri-nozomi-lead",area:"D000",worldId:"dobuita",actorDefinitions:[],isolateScheduledActors:true,
  provenance:"Original scheduled Eri model and Eri/Ryo speech. The arcade approach, poses, camera and late-evening visit are authored; native Eri event choreography and exact position are not decoded.",
  packageActors:{TJMA:{label:eri.label,modelCode:eri.modelCode,browserFilename:`${eri.modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${eri.modelCode}.CHRM`,textureAssetPath:`play/assets/characters/${eri.textureFile}`}},
  actors:[{tag:"AKIR",pose:pose(20.3,0,31.4,-90),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}},
    {tag:"TJMA",pose:pose(21.6,0,31.7,90),motion:{bank:"mobj",name:"SIN_TATI_LP_F",loop:true}}],
  camera:{positionX:18.7,positionY:2.0,positionZ:29.0,targetX:21,targetY:1.0,targetZ:31.5,roll:0,perspective:65}};
fs.writeFileSync(path.join(root,"play/data/story-nozomi-eri.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_nozomi_eri_staging.mjs",motionBanks:{},scenes:[scene]},null,2)+"\n");
console.log("Prepared Eri's authored arcade conversation using her original model.");
