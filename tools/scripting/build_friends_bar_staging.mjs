#!/usr/bin/env node
// The original SA1018 controller borrows the regular bar residents. Give the
// personal Story scene its own cast so another player's schedule cannot remove
// a speaker, and release that cast when the conversation ends or is cancelled.
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"../..");
const schedule=JSON.parse(fs.readFileSync(path.join(root,"play/data/scheduled-actors/dbyo.json")));
const actor=tag=>{const a=schedule.actors.find(x=>x.actorCode===tag);if(!a)throw Error(`Missing original bar actor ${tag}`);return {label:a.label,modelCode:a.modelCode,browserFilename:`${a.modelCode}.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${a.modelCode}.CHRM`,textureAssetPath:`play/assets/characters/${a.textureFile}`};};
const pose=(x,z,rotationY)=>({x,y:0,z,rotationX:0,rotationY,rotationZ:0});
const scene={id:"s1.dbyo.friends-lead",area:"DBYO",worldId:"dbyo",actorDefinitions:[],isolateScheduledActors:true,
  provenance:"Original DBYO 0x1ab44 dialogue uses Akemi, Saijo and Yoko's ordinary scheduled bodies. This private cast, standing positions, idle poses and camera approximate the original dynamic room choreography.",
  packageActors:Object.fromEntries(["AKMI","SAJO","YOKO"].map(tag=>[tag,actor(tag)])),
  actors:[{tag:"AKIR",pose:pose(3.5,-1.9,90),motion:{bank:"free",name:"AKI_AKI_STAND_LP",loop:true}},
    {tag:"AKMI",pose:pose(1,-1.4,-90),motion:{bank:"mobj",name:"SIN_TATI_LP_F",loop:true}},
    {tag:"SAJO",pose:pose(4,-3,90),motion:{bank:"mobj",name:"YKI_TATI_2_LP_F",loop:true}},
    {tag:"YOKO",pose:pose(2.1,-2.95,180),motion:{bank:"mobj",name:"SIN_TATI_LP_F",loop:true}}],
  camera:{positionX:.2,positionY:1.55,positionZ:-3.8,targetX:3,targetY:1.0,targetZ:-2,roll:0,perspective:65}};
fs.writeFileSync(path.join(root,"play/data/story-friends-bar.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_friends_bar_staging.mjs",motionBanks:{},scenes:[scene]},null,2)+"\n");
console.log("Prepared a private bar cast for the original SA1018 dialogue.");
