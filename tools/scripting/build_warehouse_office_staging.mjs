// Recover the workers, postures and camera for the original upstairs listening scene.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {composeEventCameraShots} from "../lib/StagedEventCamera.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";

const root = path.resolve(import.meta.dirname, "../..");
const area = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2"), "data/SCENE/02/MS8S");
const mapFile = path.join(area, "MAPINFO.BIN");
const map = fs.readFileSync(mapFile);
if (sha256(map) !== "0f0914b81f40fb73e87b073d955a1b9f5c46e4b094efeabf1215e3ea16e947c2") throw Error("Changed MS8S director");
const archive = parseIpacActivityArchive(fs.readFileSync(path.join(area, "MPK00.PKS")));
const prefix = "play/assets/harbor/warehouse-eight";
const assetRegistry = path.join(root, "src/runtime-assets.generated.json");
const registry = JSON.parse(fs.readFileSync(assetRegistry));
const catalogPath = path.join(root, "play/data/authored-story-scenes.json");
let catalogText = fs.readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogText);
function bank(key, name, expected) {
  const bytes = archive.members.find(member => member.name === name)?.bytes;
  if (!bytes || sha256(bytes) !== expected) throw Error("Changed MS8S motion " + name);
  const target = prefix + "/" + name;
  fs.writeFileSync(path.join(root, target), bytes);
  registry.assets[target] = {sha256: expected, size: bytes.length};
  if (catalog.motionBanks[key] && catalog.motionBanks[key] !== target) throw Error("Conflicting bank " + key);
  if (!catalog.motionBanks[key]) catalogText = catalogText.replace('"motionBanks":{', '"motionBanks":{' + JSON.stringify(key) + ':' + JSON.stringify(target) + ',');
  const clips = MotnLoader.parse(bytes).sequences;
  return (index, loop) => ({bank: key, name: clips[index].name, loop});
}
const listen = bank("warehouseOfficeRyo", "M_0153.MOTN", "b64317c6c2340df367025b80673dae6054ba8371283f00e2d08b512bf5699cde");
const workers = bank("warehouseOfficeStaff", "M_MS8S.MOTN", "dadd2b76d28260333b187170cec10af6dff1a6ab34b69013e70e921da8307979");
const staff = [
  {actorCode:"TMHN",label:"Tomohito Niizato",modelCode:"KWA_L",activityOnly:true},
  {actorCode:"TKSA",label:"Tsukasa Takagi",modelCode:"SGK_L",activityOnly:true}
];
for (const {modelCode} of staff) {
  const name = modelCode + ".CHRM";
  const member = archive.members.find(member => member.name === name);
  if (!member?.bytes.equals(fs.readFileSync(path.join(root, "play/assets/characters", name)))) throw Error("MS8S worker model mismatch " + modelCode);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ny-warehouse-office-"));
let cameras;
try {
  const out = path.join(temp,"cameras.json");
  const numbers = [1000,1101,1102,1103,1104,1105,1106,1300];
  execFileSync("python3",["-m","tools.scripting.extract_event_camera_catalog",mapFile,"--out",out,
    ...numbers.flatMap(number=>["--camera",String(number)])],{cwd:root,stdio:"pipe"});
  cameras = new Map(JSON.parse(fs.readFileSync(out)).records.map(record=>[record.cameraNumber,record]));
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}

const group="s1.ms8s.warehouse-eight-office";
const pose=(x,y,z,turn)=>({x,y,z,rotationX:0,rotationY:turn*360/65536,rotationZ:0});
const staticPose=(offset,turn)=>pose(map.readFloatLE(offset),map.readFloatLE(offset+4),map.readFloatLE(offset+8),turn);
const atWall=staticPose(0x2bea0,8192);
const byWindow=staticPose(0x27f30,map.readUInt32LE(0x27f3c));
const talker=pose(15.5600004196167,4.275000095367432,131.08999633789062,40413);
const listener=pose(16.779199600219727,4.275000095367432,132.35000610351562,7094);
// MOTION.BIN uses one-based request IDs. Slot 902 is the original
// 0x387 standing motion used here and in the downstairs light director.
const standingBank=fs.readFileSync(path.resolve(area,"../../../MOTION/MOTION.BIN"));
const inspectionName="AKI_AKI_TATI_IWA_L";
const [standing]=MotnLoader.parse(standingBank,{sequenceNames:[inspectionName]}).sequences;
if (!standing?.valid || !standing.valueData?.complete || standing.index+1!==0x387) {
  throw Error("The original MS8S standing request no longer resolves to its MOTION.BIN clip");
}
const registeredStand={bank:"free",name:standing.name,loop:false};
const idle={bank:"free",name:"AKI_AKI_STAND_LP",loop:true};
const walk={bank:"free",name:"AKI_AKI_WALK_LP",loop:true};
const ryo={tag:"AKIR",pose:atWall,motion:idle};
const tomohito={tag:"TMHN",pose:talker,motion:workers(1,true)};
const tsukasa={tag:"TKSA",pose:listener,motion:workers(0,true)};
const heldStaff=[{...tomohito,playbackRate:0},{...tsukasa,playbackRate:0}];
const lean={...ryo,motion:listen(1,false),motionStartSeconds:40/30};
const heldRyo={...lean,motionStartSeconds:160/30,playbackRate:0};
const actorsAtExit=[{...ryo,pose:byWindow,motion:registeredStand},{...tomohito,continueMotion:true},{...tsukasa,continueMotion:true}];
const fields=["positionX","positionY","positionZ","targetX","targetY","targetZ"];
const shot=(number,frames)=>composeEventCameraShots(cameras,[{frame:0,cameraNumber:number}],frames);
const faceCatalog = JSON.parse(fs.readFileSync(path.join(root, "play/assets/cutscenes/native-faces/manifest.generated.json")));
const ryoFace = faceCatalog.facialAssets.AKIR;
for (const source of [ryoFace.model, ryoFace.table]) {
  const original = path.join(area, "../MODEL/FACE", path.basename(source.path));
  if (sha256(fs.readFileSync(original)) !== source.sha256) throw Error("Changed Disc 2 Ryo FACE resource " + original);
}
// The MS8S director supplies an absolute target and a duration to FACE mode 2.
const gazePoint = [0, 4, 8].map(offset => map.readFloatLE(0x2bec4 + offset));
const phase=(suffix,frames,actors,extra)=>({
  id:suffix?group+"."+suffix:group,area:"MS8S",worldId:"ms8s",continuationGroup:group,
  ...(suffix?{continuesPrevious:true}:{}),durationSeconds:frames/30,
  waitForMotionCompletion:false,actorDefinitions:staff,facialAssets:{AKIR:ryoFace},isolateScheduledActors:true,actors,...extra,
});

// 1103 starts from the live 1102 endpoint after exactly 350 scheduler frames.
// Zero-valued initial position, target and perspective keys are supplied by
// the predecessor; the record's later keys and tangents are left intact.
for (const field of [...fields,"perspective"]) {
  const curve=cameras.get(1103).curves[field];
  if (curve.values[0]!==0) throw Error("Changed 1103 incoming key "+field);
  curve.values[0]=cameras.get(1102).curves[field].values.at(-1);
}
// At 0x27ec6 both anchors for 1300 are Ryo, whose new source pose was just written.
function anchorCamera(number, anchor) {
  const relativeCamera = cameras.get(number);
  const angle = anchor.rotationY * Math.PI / 180;
  for (const field of ["position","target"]) {
    const x = relativeCamera.curves[field+"X"];
    const y = relativeCamera.curves[field+"Y"];
    const z = relativeCamera.curves[field+"Z"];
    if (JSON.stringify(x.times) !== JSON.stringify(z.times)) throw Error("Changed relative camera keys");
    for (const key of ["values","slopes"]) {
      const xs = x[key].slice(), zs = z[key].slice();
      const translate = key === "values";
      x[key] = xs.map((v,i) => Math.cos(angle)*v + Math.sin(angle)*zs[i] + (translate ? anchor.x : 0));
      z[key] = xs.map((v,i) => -Math.sin(angle)*v + Math.cos(angle)*zs[i] + (translate ? anchor.z : 0));
    }
    y.values = y.values.map(value => value + anchor.y);
  }
}
const timedStart=staticPose(0x2be94,8192);
anchorCamera(1300,byWindow);
anchorCamera(1101,timedStart);
const lightPoint=staticPose(0x2bf58,0);
const downstairs=staticPose(0x2bf4c,0);
downstairs.rotationY=Math.atan2(lightPoint.x-downstairs.x,lightPoint.z-downstairs.z)*180/Math.PI;
const approachFrames=60,firstFrames=190;
const approach={channels:Object.fromEntries(Object.entries(atWall).map(([key,end])=>[
  key,{times:[0,approachFrames/30,firstFrames/30],values:[end,end,end],interpolation:"linear"}]))};
// MAPINFO emits 0x002e with eight endpoint bytes; only the leading alpha
// channel varies. Each call is followed by a -1 query loop before proceeding.
function blackFade(call, durationInstruction, alphaLiteral, reveal = false) {
  if (map.readUInt16LE(call)!==0x400b || map.readUInt16LE(call-6)!==0xe52e
    || map[durationInstruction+1]!==0xe4 || map.readUInt32LE(alphaLiteral)!==255) {
    throw Error("Changed MS8S screen transition at "+call.toString(16));
  }
  return {callFileOffset:call,durationFrames:map[durationInstruction],fromAlpha:reveal?255:0,toAlpha:reveal?0:255};
}
const scenes=[
  phase("",firstFrames,[{...ryo,motion:walk,movement:approach,movementFromPlayer:true,
    motionCues:[{atSeconds:approachFrames/30,motion:idle}]},...heldStaff],{
    ...composeEventCameraShots(cameras,[{frame:0,cameraNumber:1105},{frame:approachFrames,cameraNumber:1106}],firstFrames),
    cameraFromCurrent:[...fields,"perspective"],dialogueCues:[{voiceId:"E1009BA013",atSeconds:approachFrames/30}],
    provenance:"Native physical approach mode 0 issues XMPT to 0x2bea0, takes 1105 then 1106 and plays A013. Story fits the approach from the actual player position to the two-second 1105 move."}),
  phase("lean",121,[lean,...heldStaff],{continueCamera:true,
    faceCommands:[{name:"face-gaze",actorTag:"AKIR",mode:2,durationNativeTicks:60,target:{kind:"world-point",position:gazePoint},callFileOffset:"0x27762"}],
    dialogueCues:[{voiceId:"E1009BB001",atSeconds:120/30}],
    provenance:"0x2772a starts the dedicated listening motion at frame 40. The director waits for frame 160 before starting the staff exchange."}),
  phase("staff",675,[heldRyo,tomohito,{...tsukasa,playbackRate:0.5}],{
    ...composeEventCameraShots(cameras,[{frame:0,cameraNumber:1102},{frame:350,cameraNumber:1103}],675),
    provenance:"0x2784e/0x278a2 start the two worker motions. TKSA runs at half speed. Camera coroutine 0x26e74 cuts to 1103 after 350 frames."}),
  phase("staff-hold",60,[heldRyo,{...tomohito,continueMotion:true},{...tsukasa,continueMotion:true,playbackRate:0}],{
    continueCamera:true,provenance:"0x27afe stops TKSA's motion before B003; the camera coroutine and TMHN continue."}),
  phase("listen-out",31,[heldRyo,{...tomohito,continueMotion:true},{...tsukasa,continueMotion:true,playbackRate:0}],{
    continueCamera:true,dialogueCues:[{voiceId:"E1009BA014",atSeconds:1}],
    provenance:"0x27bd8 waits 30 frames after the final worker line before Ryo reacts."}),
  phase("reaction",150,[heldRyo,{...tomohito,continueMotion:true},{...tsukasa,continueMotion:true,playbackRate:0}],{
    faceCommands:[{name:"face-clip",actorTag:"AKIR",clipGroup:2,selector:0,durationNativeTicks:60,callFileOffset:"0x27c28"}],
    ...shot(1104,150),cameraFromCurrent:[...fields,"roll"],provenance:"At 0x27c0c ECAM 1104 picks up the current staff camera and turns to Ryo for A014."}),
  phase("departure",250,actorsAtExit,{...shot(1300,250),
    faceCommands:[
      {name:"face-clip",actorTag:"AKIR",clipGroup:0,selector:0,durationNativeTicks:1,callFileOffset:"0x27df2"},
      {name:"face-gaze",actorTag:"AKIR",mode:0,durationNativeTicks:16,callFileOffset:"0x27e06"},
    ],
    screenFades:{
      beforeReposition:blackFade(0x27cec,0x27cdc,0x27d0c),
      afterReposition:blackFade(0x27fa2,0x27f92,0x27fcc,true),
      beforeTravel:blackFade(0x280da,0x280ca,0x28100),
    },
    provenance:"0x27e50 places Ryo back beside the window facing 0xa000. The Ryo-relative ECAM 1300 plays for the Old Warehouse District line A017 before MFSY/5."}),
];
// The alternate director covers the actual gameplay view, then positions Ryo at
// 0x2be94 and selects his relative ECAM 1101. Its two one-tick waits and a
// ten-tick hold at 0x274c0 precede the XMPT approach and ECAM 1105.
scenes.push({
  ...phase("timed",13,[{...ryo,pose:timedStart,motion:registeredStand},...heldStaff],{
    ...shot(1101,13),
    screenFades:{beforeReposition:blackFade(0x272fe,0x272ee,0x27320)},
    dialogueCues:[{voiceId:"E1009BA013",atSeconds:12/30}],
    provenance:"MS8S mode 1 covers the gameplay frame before moving AKIR to 0x2be94, facing 0x2000, and selecting ECAM 1101 at 0x273d6."}),
  continuesPrevious:false,
});
const timedMovement={channels:Object.fromEntries(Object.keys(atWall).map(key=>[
  key,{...approach.channels[key],values:[timedStart[key],atWall[key],atWall[key]]}]))};
scenes.push(phase("timed-approach",firstFrames,[{...ryo,motion:walk,movement:timedMovement,
  motionCues:[{atSeconds:approachFrames/30,motion:idle}]},...heldStaff],{
  ...composeEventCameraShots(cameras,[{frame:0,cameraNumber:1105},{frame:approachFrames,cameraNumber:1106}],firstFrames),
  cameraFromCurrent:[...fields,"perspective"],
  screenFades:{afterReposition:{...blackFade(0x27596,0x27586,0x275b8,true),holdFrames:map.readInt8(0x2751e)}},
  dialogueCues:[{voiceId:"E1009BA013",atSeconds:approachFrames/30}],
  provenance:"0x27500 begins the common XMPT. In mode 1 the director reveals the 1105 approach over 30 frames, then switches to 1106 for A013."}));
const inspectionStages=[
  {slug:"empty-floor",wait:0x26bcc,motionAfterWait:true},
  {slug:"office-door",wait:0x26cd8,motionAfterWait:false},
  {slug:"inner-office",wait:0x26dbc,motionAfterWait:false},
].map(({slug,wait,motionAfterWait})=>{
  if(map.readUInt16LE(wait)!==0xe41e)throw Error("Changed MS8S inspection lead");
  const durationSeconds=map.readInt8(wait)/30;
  return {id:"s1.ms8s.warehouse-eight-"+slug,area:"MS8S",worldId:"ms8s",actorDefinitions:[],
    durationSeconds,useGameplayCamera:true,actors:[{tag:"AKIR",motion:registeredStand,
      ...(motionAfterWait?{motionAtSeconds:durationSeconds}:{})}],
    provenance:"Room director 0x26b84 retains Ryo's placement and view, requests motion 0x387 and waits 30 source ticks before speaking. Its shared return at 0x28528 restores player controls."};
});
scenes.push(...inspectionStages);
const lightId="s1.ms8s.warehouse-light-hint";
scenes.push({id:lightId,area:"MS8S",worldId:"ms8s",actorDefinitions:[],durationSeconds:60/30,
  actors:[{tag:"AKIR",pose:downstairs,motion:registeredStand,lookAt:[-lightPoint.x,lightPoint.y,lightPoint.z]}],
  ...shot(1000,60),waitForMotionCompletion:false,
  screenFades:{beforeReposition:blackFade(0x281dc,0x281cc,0x28208),
    afterReposition:blackFade(0x28302,0x282f2,0x28344,true)},
  finishAtPlayerPose:true,
  provenance:"MS8S 0x28198 relocates AKIR to 0x2bf4c, faces the light at 0x2bf58, selects standing motion 0x387 and full look-point control 6, and reveals ECAM 1000. A018 ends back in MS8S at that location."});
// These are compact rows in a larger hand-maintained catalog. Retain its other rows.
const lines=catalogText.split("\n");
const belongs=line=>inspectionStages.some(scene=>line.trimStart().startsWith('{"id":"'+scene.id+'"'))||line.trimStart().startsWith('{"id":"'+lightId+'"')||line.trimStart().startsWith('{"id":"'+group+'"')||line.trimStart().startsWith('{"id":"'+group+'.');
const first=lines.findIndex(belongs);
if(first<0)throw Error("Missing office scene entry");
const outside=lines.filter(line=>!belongs(line));
outside.splice(first,0,...scenes.map(scene=>"    "+JSON.stringify(scene)+","));
fs.writeFileSync(catalogPath,outside.join("\n"));
fs.writeFileSync(assetRegistry, JSON.stringify(registry,null,2)+"\n");
