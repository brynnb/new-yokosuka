#!/usr/bin/env node
// Reuse the original CATA1 final shot while Yarn presents the food choice.
// No choice, inventory or progress is determined by presentation.
import fs from "node:fs";
import path from "node:path";
import {parseAuthSequence} from "../../src/AuthSequence.js";
import {parseAuthMovement,evaluateAuthActor} from "../../src/AuthMovement.js";
import {parseAuthCamera,evaluateAuthCamera} from "../../src/AuthCamera.js";
import {MotnLoader} from "../../src/MotnLoader.js";
import {sha256} from "../lib/NativeAseqActivityPack.mjs";

const root=path.resolve(import.meta.dirname,"../.."),server=process.env.NEW_YOKOSUKA_SERVER_DIR;
if(!server)throw Error("NEW_YOKOSUKA_SERVER_DIR is required");
const prefix="play/assets/yamanose/cata1";
const manifest=JSON.parse(fs.readFileSync(path.join(root,prefix,"manifest.json")));
const read=filename=>{
  const record=manifest.outputs.find(item=>item.path===`${prefix}/${filename}`);
  if(!record)throw Error(`Missing CATA1 output ${filename}`);
  const bytes=fs.readFileSync(path.join(root,record.path));
  if(sha256(bytes)!==record.sha256)throw Error(`Changed CATA1 output ${filename}`);
  return bytes;
};
const auth=read("SEQDATA0.AUTH"),sequence=parseAuthSequence(auth);
const movement=parseAuthMovement(auth),camera=parseAuthCamera(auth),bank=MotnLoader.parse(read("M_01CAT.MOTN"));
const frame=sequence.durationFrames,time=frame/30;
const pose=tag=>{
  const actor=movement.actors.find(item=>item.tag===tag);
  if(!actor)throw Error(`Missing CATA1 movement ${tag}`);
  return Object.fromEntries(Object.entries(evaluateAuthActor(actor,time)).filter(([key])=>["x","y","z","rotationX","rotationY","rotationZ"].includes(key)));
};
const frozen=tag=>{
  const event=sequence.motions.filter(item=>item.actorTag===tag&&item.frame<=frame).at(-1);
  const clip=bank.sequences[event?.sequenceIndex];
  // The AUTH player stops applying at endFrame-startFrame and retains the
  // previous sample, including clips that finish before the shot ends.
  const sample=event&&event.startFrame-1+Math.min(frame-event.frame,event.endFrame-event.startFrame-1);
  if(event?.motionBank!==16||!clip?.valueData.complete||!Number.isSafeInteger(sample)||sample<0||sample>=clip.durationFrames)throw Error(`Unresolved CATA1 held motion ${tag}`);
  return {bank:"kittenChoice",name:clip.name,loop:false,elapsedSeconds:sample/30};
};
const box=pose("NBOX"),sourceCamera=evaluateAuthCamera(camera.cameras[0],time);
// The choice panel occupies the bottom of our screen. Aim the source shot
// slightly lower without moving its camera through the shrine wall.
const choiceCamera={...sourceCamera,
  targetY:sourceCamera.targetY-.6};
const scene={
  id:"s1.ju00.first-kitten.choice",area:"JU00",worldId:"yamanose",actorDefinitions:[],
  provenance:"CATA1 SEQDATA0 final actor roots and last applied MOTN samples. The source camera aims lower to accommodate the authored choice panel; this held shot is a presentation adaptation.",
  actors:["AKIR","MEGM","CATM"].map(tag=>({tag,pose:pose(tag),motion:frozen(tag)})),
  packageActors:{CATM:manifest.packageActors.CATM},
  sceneObjects:{NBOX:{...manifest.sceneObjects.NBOX,lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[box.x,box.y,box.z],rotationDegrees:[box.rotationX,box.rotationY,box.rotationZ],scale:[1,1,1]}}},
  objectTransforms:[{object:"BOX1",visible:false}],
  camera:choiceCamera,
};
fs.writeFileSync(path.join(root,"play/data/story-kitten.generated.json"),JSON.stringify({
  schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_kitten_choice.mjs",
  motionBanks:{kittenChoice:`${prefix}/M_01CAT.MOTN`},scenes:[scene],
},null,2)+"\n");
const file=path.join(server,"internal/scriptcontent/commands.v1.json");
let registry=fs.readFileSync(file,"utf8").split("\n").filter(line=>!line.includes('"kind":"sequence"')||!line.includes(`"identifier":"${scene.id}.`)).join("\n");
registry=registry.replace('"capabilities": [','"capabilities": [\n'+["start","finish"].map(part=>"    "+JSON.stringify({kind:"sequence",identifier:`${scene.id}.${part}`,description:"Hold and release the original kitten scene's final shot during the food choice; presentation only."})+",").join("\n"));
JSON.parse(registry);fs.writeFileSync(file,registry);
console.log("Generated the CATA1 final-shot choice tableau.");
