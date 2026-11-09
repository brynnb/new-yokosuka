#!/usr/bin/env node
// Original event models and motions, arranged on a verified walkable street.
// DYNAMICS, ball physics, exact stage marks, timing and camera remain unknown.
import fs from "node:fs";
import path from "node:path";
import {curveTrack} from "../lib/AuthoredChase.mjs";

const root=path.resolve(import.meta.dirname,"../..");
const pose=(x,y,z,rotationY=0)=>({x,y,z,rotationX:0,rotationY,rotationZ:0});
// The browser recovery query reports this road's supported actor origin;
// subtracting the controller's capsule height buries the cinematic cast.
const ground=1.916;
const character=(label,code)=>({label,modelCode:`${code}_L`,browserFilename:`${code}_L.CHRM`,assetFormat:"MT5",characterScale:1,assetPath:`play/assets/characters/${code}_L.CHRM`,textureAssetPath:`play/assets/characters/${code}_textures.bin`});
const packageActors={KOTA:character("Kota","KTA"),YASU:character("Yasuo","YSO"),KAYO:character("Kayoko","KYK")};
const actorDefinitions=Object.entries(packageActors).map(([actorCode,d])=>({actorCode,label:d.label,modelCode:d.modelCode,activityOnly:true}));
const bank="yamanoseFootball",motion=(name,loop=false)=>({bank,name,loop});
const camera={positionX:-36.5,positionY:3.8,positionZ:51.6,targetX:-39.8,targetY:2.6,targetZ:50,roll:0,perspective:85};
const actors=(ryo,kota,yasuo,kayoko)=>[
  {tag:"AKIR",pose:pose(-38.7,ground,49.2,180),motion:motion(ryo)},
  {tag:"KOTA",pose:pose(-40.2,ground,50.2,0),motion:motion(kota)},
  {tag:"YASU",pose:pose(-40.8,ground,51.1,0),motion:motion(yasuo)},
  {tag:"KAYO",pose:pose(-39.7,ground,49.7,0),motion:motion(kayoko)},
];
const ball={model:"FBB0201G",browserFilename:"FBB0201G.CHRM",assetPath:"play/assets/sakuragaoka/gao-wen/FBB0201G.CHRM",textureAssetPath:"play/assets/characters/BIK_textures.bin",lifecycle:{kind:"room-script-persistent"},initialPresentation:{position:[-40,ground+.2,50.5],rotationDegrees:[0,0,0],scale:[1,1,1]}};
const common={area:"JU00",worldId:"yamanose",packageActors,actorDefinitions,isolateScheduledActors:true,camera,
  provenance:"Original JQSO character motions and FBB0201G ball; source event controller, timing, stage positions, camera and ball path not decoded. This is an authored approximation."};
const scenes=[
  {...common,id:"s1.ju00.football-intro",actors:actors("AKI_SOCCOR_HURIKAERU_QTE","GAK_CTA_SOCCOR_MATU_QTE","GAK_YAS_SOCCOR_SEIKOU_A_QTE","KOD_KAY_SOCCOR_SEIKOU_A_LP_QTE"),sceneObjects:{FBB_:ball}},
  {...common,id:"s1.ju00.football-prompt",durationSeconds:2,waitForMotionCompletion:false,
    actors:actors("AKI_SOCCOR_HURIKAERU_QTE","GAK_CTA_SOCCOR_MATU_QTE","GAK_YAS_SOCCOR_SEIKOU_A_QTE","KOD_KAY_SOCCOR_SEIKOU_A_LP_QTE"),sceneObjects:{FBB_:ball},
    sceneObjectTracks:{FBB_:curveTrack([{time:0,value:pose(-40,ground+.2,50.5)},{time:2,value:pose(-38.7,ground+1,49.2)}])}},
  {...common,id:"s1.ju00.football-catch",actors:actors("AKI_SOCCOR_SEIKOU_A_QTE","GAK_CTA_SOCCOR_SEIKOU_A_QTE","GAK_YAS_SOCCOR_SEIKOU_A_QTE","KOD_KAY_SOCCOR_SEIKOU_A_LP_QTE"),
    attachedObjects:{FBB_:{browserFilename:ball.browserFilename,assetPath:ball.assetPath,textureAssetPath:ball.textureAssetPath,attachments:[{activityId:"s1.ju00.football-catch",frame:0,parentActorTag:"AKIR",controlId:18,translation:[0,0,.08],rotationRaw:[0,0,0]}]}}},
  {...common,id:"s1.ju00.football-miss",durationSeconds:2,waitForMotionCompletion:false,actors:actors("AKI_SOCCOR_SIPPAI_A_QTE","GAK_CTA_SOCCOR_SIPPAI_A_QTE","GAK_YAS_SOCCOR_SIPPAI_A_QTE","KOD_KAY_SOCCOR_SIPPAI_A_LP_QTE"),sceneObjects:{FBB_:ball},
    sceneObjectTracks:{FBB_:curveTrack([{time:0,value:pose(-38.7,ground+1,49.2)},{time:2,value:pose(-39.7,ground+.2,49.7)}])}},
];
fs.writeFileSync(path.join(root,"play/data/story-yamanose-football.generated.json"),JSON.stringify({schema:"new-yokosuka-authored-story-scenes-v1",generatedBy:"tools/scripting/build_yamanose_football_staging.mjs",motionBanks:{[bank]:"play/assets/yamanose/football/M_01113.MOTN"},scenes},null,2)+"\n");
console.log("Prepared approximate football staging with original event animations and ball.");
