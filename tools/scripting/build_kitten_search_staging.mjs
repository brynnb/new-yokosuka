#!/usr/bin/env node
// Use the shared Story staging runtime with original character models and idle
// clips. The two camera/position arrangements are explicitly authored, not a
// reconstruction of the missing native E1041 controller.
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"../..");
const first=JSON.parse(fs.readFileSync(path.join(root,"play/data/story-kitten.generated.json"))).scenes[0];
const nozomi=JSON.parse(fs.readFileSync(path.join(root,"play/assets/harbor/nozomi-amulet/manifest.json"))).packageActors.HRSK;
const cat=first.packageActors.CATM,pose=(x,y,z,rotationY)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
const standingRyo={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
const standingMegumi={bank:"mobj",name:"KOD_TATI_LP_F",loop:true};
const standingNozomi={bank:"mobj",name:"SIN_TATI_LP_F",loop:true};
const sittingKitten={bank:"kittenChoice",name:"KCT_SUWARU_LP2",loop:true};
const scenes=[{
  id:"s1.ju00.kitten-found",area:"JU00",worldId:"yamanose",actorDefinitions:[],isolateScheduledActors:true,
  provenance:"Authored lower-stair tableau near the walkthrough's laundry landmark. Held idle poses and camera approximate the original E1041 event; there is no recovered pickup or native walk path.",
  packageActors:{CATM:cat,HRSK:nozomi},actors:[
    {tag:"AKIR",pose:pose(-29.2845,.91,72.1065,-140),motion:standingRyo},
    {tag:"CATM",pose:pose(-30.5,.91,72.8,0),motion:sittingKitten},
    {tag:"HRSK",pose:pose(-29,.91,73.5,25),motion:standingNozomi}],
  camera:{positionX:-28,positionY:2.8,positionZ:72,targetX:-29.8,targetY:1.45,targetZ:72.65,roll:0,perspective:80},
},{
  id:"s1.ju00.kitten-reunion",area:"JU00",worldId:"yamanose",actorDefinitions:[],isolateScheduledActors:true,
  provenance:"Authored cut back to the shrine; Megumi, Ryo and the kitten use the original first-kitten scene positions, with Nozomi placed nearby. Held poses, camera and carry transition are approximations.",
  packageActors:{CATM:cat,HRSK:nozomi},actors:[
    {tag:"AKIR",pose:first.actors.find(x=>x.tag==="AKIR").pose,motion:standingRyo},
    {tag:"MEGM",pose:first.actors.find(x=>x.tag==="MEGM").pose,motion:standingMegumi},
    {tag:"CATM",pose:first.actors.find(x=>x.tag==="CATM").pose,motion:sittingKitten},
    {tag:"HRSK",pose:pose(-35.2,2.6,41.5,0),motion:standingNozomi}],
  camera:{positionX:-35,positionY:3.5,positionZ:38.2,targetX:-35.2,targetY:2.5,targetZ:40.2,roll:0,perspective:85},
}];
fs.writeFileSync(path.join(root,"play/data/story-kitten-search.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_kitten_search_staging.mjs",motionBanks:first.motionBanks||{"kittenChoice":"play/assets/yamanose/cata1/M_01CAT.MOTN"},scenes},null,2)+"\n");
console.log("Prepared two authored kitten search tableaus using original models and idle motions.");
