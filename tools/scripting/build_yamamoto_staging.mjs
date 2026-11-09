#!/usr/bin/env node
// Shared staged-scene runtime, original E1044 positions/camera, and a short
// authored park-to-house path. This does not emulate the native controller.
import fs from "node:fs";
import path from "node:path";
import {createChasePath,curveTrack} from "../lib/AuthoredChase.mjs";

const root=path.resolve(import.meta.dirname,"../.."),output=path.join(root,"play/data/story-yamamoto-scenes.generated.json");
// Cut from the park to a short arrival outside the house. The original park
// exit route has not been recovered; inventing a straight line cuts through
// trees and fences. These last steps are an authored approximation.
const pathPoints=[[-12.5,0,-1.0],[-12,0,.1],[-11.5,0,1.5]];
const pathData=createChasePath(pathPoints),distance=pathData.cumulative.at(-1),duration=Math.ceil(distance/1.1);
const sample=(fn,offset=0)=>pathData.cumulative.map(d=>({time:d/distance*duration,value:fn(Math.min(distance-.001,d),offset)}));
const pose=(d,offset)=>{const p=pathData.pose(d);return{...p,x:p.x+offset};};
// Keep the camera close to the arrival rather than behind the park foliage.
const camera=d=>{const c=pathData.camera(d);return{...c,
  positionX:c.positionX+(c.targetX-c.positionX)*.4,
  positionY:c.positionY+.5,
  positionZ:c.positionZ+(c.targetZ-c.positionZ)*.4};};
const idleRyo={bank:"free",name:"AKI_AKI_STAND_LP",loop:true},idleKame={bank:"mobj",name:"JIJ_TATI_TEKUMU_LP_F",loop:true};
const scenes=[{
  id:"s1.jd00.yamamoto-request",area:"JD00",worldId:"sakuragaoka",actorDefinitions:[],
  provenance:"Original JD00 0x61556/0x61642 Ryo/Kame positions and first key of ECAM 6003. Two held idle poses and a single camera shot approximate the native changing gestures and cuts.",
  actors:[{tag:"AKIR",pose:{x:10.175000190734863,y:0,z:26.86199951171875,rotationX:0,rotationY:0,rotationZ:0},motion:idleRyo},
    {tag:"KAME",pose:{x:10.453300476074219,y:0,z:24.876100540161133,rotationX:0,rotationY:84.9969482421875,rotationZ:0},motion:idleKame}],
  camera:{positionX:10.747099876403809,positionY:3.625499963760376,positionZ:14.974699974060059,targetX:8.957799911499023,targetY:1.707200050354004,targetZ:24.22719955444336,roll:0,perspective:59.98540115356445},
},{
  id:"s1.jd00.yamamoto-escort",area:"JD00",worldId:"sakuragaoka",actorDefinitions:[],durationSeconds:duration,
  provenance:"Authored cinematic cut from the park to a short arrival at Yamamoto's house using original generic walking clips. The park-to-house route, camera and final positions are approximations rather than the native escort controller.",
  actors:[{tag:"AKIR",pose:pose(0,.7),motion:{bank:"free",name:"AKI_AKI_WALK_LP",loop:true},endMotion:idleRyo,movement:curveTrack(sample(pose,.7))},
    {tag:"KAME",pose:pose(0,0),motion:{bank:"mobj",name:"JIJ_JIJ_WALK_ARM_LP",loop:true},endMotion:idleKame,movement:curveTrack(sample(pose,0))}],
  camera:camera(0),cameraTrack:curveTrack(sample(camera)),
}];
fs.writeFileSync(output,'{\n  "schema":"new-yokosuka-authored-story-scenes-v1",\n  "generatedBy":"tools/scripting/build_yamamoto_staging.mjs",\n  "motionBanks":{},\n  "scenes":[\n'+scenes.map(scene=>"    "+JSON.stringify(scene)).join(",\n")+'\n  ]\n}\n');
console.log(`Built Yamamoto scenes with a ${duration}-second authored escort.`);
