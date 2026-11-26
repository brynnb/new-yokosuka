// MKSG's flashlight coroutine reads a named six-channel DYNA track from EVENT.PKS.
import fs from "node:fs";
import path from "node:path";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root=path.resolve(import.meta.dirname,"../..");
const area=path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root,"extracted_disc2_v2"),"data/SCENE/02/MKSG");
const map=fs.readFileSync(path.join(area,"MAPINFO.BIN"));
const archive=fs.readFileSync(path.join(area,"EVENT.PKS"));
if (sha256(map)!=="8c26c6de22132f8b42a450b31fb3ad4f0a954948e794419319528ac63ce790ae" ||
    sha256(archive)!=="278572918f746220750e700c65b42a57c9872c3bc68baec95e41d61938d617a3") throw Error("Changed original flashlight director or archive");
const members=parseIpacActivityArchive(archive).members;
const packed=name=>members.find(member=>member.name===name)?.bytes;
const dynamics=packed("DYNAMICS.DYNM");
if(dynamics.toString("ascii",0,4)!=="DYNA" || dynamics.readUInt32LE(4)!==dynamics.length ||
  dynamics.toString("ascii",8,12)!==map.toString("ascii",0x320c0,0x320c4) || dynamics.readUInt32LE(12)!==dynamics.length-8) throw Error("Missing MKSG KCDT track");
const bank=MotnLoader.parse(packed("M_0153.MOTN")).sequences;
const motion=index=>({bank:"oldDistrict",name:bank[index].name,loop:false});
const prefix="s1.mfsy.old-district-";
const dataPath=path.join(root,"play/data/authored-story-scenes.json");
const original=fs.readFileSync(dataPath,"utf8");
const catalog=JSON.parse(original);
const staged=catalog.scenes.find(row=>row.id===prefix+"head-bump");
const pose=staged.actors[0].pose;
const camera=staged.camera;
const vector=offset=>[0,4,8].map(i=>map.readFloatLE(offset+i));
const sourceActor=vector(0x320f8), sourceLight=vector(0x320a8);
// The standing harbor mark faces the opposite direction to MKSG's raw yaw 0x4000.
if (pose.rotationY!==270 || map.readUInt32LE(0x21468)!==0x4000) throw Error("Changed flashlight stage alignment");
const turn=65536, fps=30;
const lightBase=[pose.x-(sourceLight[0]-sourceActor[0]),pose.y+sourceLight[1]-sourceActor[1],pose.z-(sourceLight[2]-sourceActor[2])];
const fields=["x","y","z","rotationX","rotationY","rotationZ"];
let cursor=20;
const curves=fields.map(field=>{
  const count=dynamics.readUInt32LE(cursor); cursor+=4;
  if (count<2 || cursor+count*8>dynamics.length) throw Error("Invalid KCDT channel "+field);
  const samples=[];
  for(let i=0;i<count;i++,cursor+=8){
    const frame=dynamics.readUInt32LE(cursor), value=dynamics.readFloatLE(cursor+4);
    if(!Number.isFinite(value) || (i && frame<=samples[i-1].frame)) throw Error("Invalid KCDT key");
    samples.push({frame,value});
  }
  if(samples[0].frame!==0 || samples.at(-1).frame!==160) throw Error("Unexpected KCDT frame range");
  return samples;
});
if(cursor!==dynamics.length-4 || dynamics.readUInt32LE(cursor)!==0) throw Error("Unexpected KCDT tail");

function sample(keys,frame){
  const i=keys.findIndex(key=>key.frame>=frame);
  if(i<0)return keys.at(-1).value;
  if(i===0 || keys[i].frame===frame)return keys[i].value;
  const a=keys[i-1],b=keys[i];
  return Math.fround(a.value+Math.fround((frame-a.frame)/(b.frame-a.frame))*Math.fround(b.value-a.value));
}
// On this authored MFSY set the staged player rig reaches a different X/Z
// mark from the MKSG actor. Register the complete trajectory to the observed
// frame-80 grip on that rig with one planar translation. Retain native height
// so the failed branch lands on the floor. All phases use the same transform.
const gripMark={x:pose.x+1.84,z:pose.z+0.131};
const captureKey=60;
lightBase[0]=gripMark.x+Math.fround(sample(curves[0],captureKey)*10);
lightBase[2]=gripMark.z+Math.fround(sample(curves[2],captureKey)*10);
function stageValue(axis,value){
  // The room multiplies the first three channels by ten. Engine op 0x008a
  // interpolates the other three in degrees then truncates to 16-bit turns.
  if(axis<3)return lightBase[axis]+(axis===1?1:-1)*Math.fround(value*10);
  const raw=Math.trunc(Math.fround(Math.fround(value/360)*turn));
  return (axis===4?180:0)+raw*360/turn;
}
function lightTrack(duration,first,last,delay=0){
  const channels=Object.fromEntries(fields.map((field,axis)=>{
    const keys=curves[axis];
    const frames=[0,delay,...keys.filter(key=>key.frame>first&&key.frame<last).map(key=>delay+key.frame-first),delay+last-first,duration];
    const timeline=[...new Set(frames)];
    return [field,{interpolation:"linear",times:timeline.map(t=>t/fps),
      values:timeline.map(t=>stageValue(axis,sample(keys,Math.min(last,first+Math.max(0,t-delay)))))}];
  }));
  return {channels};
}
const assetPrefix="play/assets/harbor/old-district-entry/";
const object={model:"KAIS500G",browserFilename:"KAIS500G.CHRM",assetPath:assetPrefix+"KAIS500G.CHRM",textureAssetPath:assetPrefix+"EVENT.PKF"};
function scene(name,duration,actor,extras={}){
  return {id:prefix+name,area:"MFSY",worldId:"mfsy",durationSeconds:duration/fps,actorDefinitions:[],
    actors:[{tag:"AKIR",pose,...actor}],camera,continuationGroup:prefix+"flashlight",continuesPrevious:name!=="head-bump",
    holdEndPose:true,retainOnFinish:name!=="catch",sceneObjects:{KAIS:object},attachedObjects:{KAIS:attached},...extras};
}
function flying(duration,first,last,delay){
  return {sceneObjectTracks:{KAIS:lightTrack(duration,first,last,delay)}};
}
const cue=(frame,index,start,rate=1)=>({atSeconds:frame/fps,motion:motion(index),startSeconds:start/fps,playbackRate:rate});
function effect(command, frame) {
  return {kind:"effect", asset:"public/audio/world/e1kaiqte/"+command+".wav", atSeconds:frame/fps};
}
const bumpStart=133, release=380, lead=14, poll=30, reach=14;
const bumpTicks=release-bumpStart+lead;
const promptStart=2+lead, resultFrame=promptStart+poll, handoff=resultFrame+reach;
const grip={
  translation:vector(0x2176c),
  rotationRaw:[0,4,8].map(offset=>map.readUInt32LE(0x21778+offset)),
};
const attached={...object,sceneObject:true,attachments:[{activityId:prefix+"catch",frame:0,parentActorTag:"AKIR",controlId:18,...grip}],
  presentation:[{activityId:prefix+"catch",frame:0,visible:true}]};
const catchFrom=66+reach;
const missDuration=Math.max(160-resultFrame,60+Math.ceil((bank[26].durationFrames-40)/0.8));
const scenes=[
  scene("head-bump",bumpTicks,{motion:motion(0),motionStartSeconds:bumpStart/fps},{
    // AKIR dispatches track 1 at motion frame 360 (0x2140a).
    // KAIS dispatches track 2 when the room releases the prop (0x20abe).
    soundCues:[effect("A9040100",360-bumpStart),effect("A9040200",release-bumpStart)],
    ...flying(bumpTicks,2,promptStart,release-bumpStart),provenance:"MKSG 0x21342 starts slot 0 at 133. At 380 the director releases KAIS; the Right prompt opens fourteen room ticks later."}),
  scene("prompt",poll,{motion:motion(0),motionStartSeconds:(release+lead)/fps},{
    ...flying(poll,promptStart,resultFrame),waitForMotionCompletion:false,playThroughFinish:true,waitForChallenge:prefix+"flashlight",
    provenance:"MKSG 0x224e8/0x225d4 opens the input after fourteen ticks and polls for thirty. On an authored retry the prompt resumes at this mark."}),
  scene("reach",reach,{motion:motion(10),motionStartSeconds:66/fps},{
    ...flying(reach,resultFrame,handoff),provenance:"MKSG 0x214da starts the catch at 66. State eight raises flag 7 fourteen ticks later at 0x2267e."}),
  scene("catch",140-catchFrom+bank[25].durationFrames-70,{motion:motion(10),motionStartSeconds:catchFrom/fps,
    motionCues:[cue(140-catchFrom,25,70)]},{
    // Flag 7 dispatches track 4 at the grip (0x214fe), then track 5 at motion frame 92 (0x21634).
    soundCues:[effect("A9040400",0),effect("A9040500",92-catchFrom)],
    provenance:"MKSG 0x215ea installs the light on AKIR control 18 at the original translation and fixed-turn angles; 0x21680 switches to the success escape from frame 70."}),
  scene("miss",missDuration,{motion:motion(29),motionStartSeconds:60/fps,motionCues:[cue(60,26,40,0.8)]},{
    // AKIR dispatches track 3 at frame 75 of the missed reach (0x21894).
    soundCues:[effect("A9040300",75-60)],
    ...flying(missDuration,resultFrame,160),releaseOnCommit:true,provenance:"MKSG 0x2184a reaches and misses from frame 60. At 120 the director changes to slot 26 from frame 40, playing at 0.8. Story then offers its existing retry."}),
];
const ids=new Set(scenes.map(s=>s.id));
const oldRows=catalog.scenes.filter(row=>ids.has(row.id));
const startIndex=catalog.scenes.indexOf(oldRows[0]);
if(startIndex<0 || !catalog.scenes.slice(startIndex,startIndex+oldRows.length).every(row=>ids.has(row.id)))throw Error("Missing contiguous flashlight scenes");
function rowStart(id){
  const offset=original.indexOf('"id":"'+id+'"');
  if(offset<0)throw Error("Missing flashlight row boundary");
  return original.lastIndexOf("{",offset);
}
const start=rowStart(oldRows[0].id);
const next=rowStart(catalog.scenes[startIndex+oldRows.length].id);
const end=original.lastIndexOf("}",next-1)+1;
fs.writeFileSync(dataPath,original.slice(0,start)+scenes.map(s=>JSON.stringify(s)).join(",\n    ")+original.slice(end));
