// Small authored adapters to the ordinary Yarn/region/shared-combat pipeline.
// This is not recovered event-controller code. See docs/design/story-move-learning.md.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import learning from '../../play/data/story-move-learning.json' with {type:'json'};
import scenes from '../../play/scripts/AuthoredSceneCatalog.js';
const root = new URL('../../', import.meta.url);
const sourcePath = 'tools/scripting/story-move-learning.mjs';
const nativeSources = [{role:'authored-learning-adaptation', locator:sourcePath,
  sha256:createHash('sha256').update(fs.readFileSync(new URL(sourcePath,root))).digest('hex')}];
const move = id => learning.moves.find(m=>m.id===id);
const learned = id => `story.s1.${move(id).slug}.learned`;
const actor = (actorCode,label,modelCode) => ({actorCode,label,modelCode,activityOnly:true});
const fuku=actor('FUKU','Masayuki Fukuhara','FUK_M');
const yama=actor('YAMA','Shigeo Yamagishi','YMG_L');
const shozo=actor('SYZU','Shozo Mizuki','KOG_L');
const guizhang=scenes.scenes.filter(s=>s.worldId==='mfsy').flatMap(s=>s.actorDefinitions).find(a=>a.actorCode==='KISY')
  || scenes.scenes.flatMap(s=>s.actorDefinitions).find(a=>a.actorCode==='KISY');
if(!guizhang)throw Error('Missing source-qualified Gui Zhang model');

// Browser coordinates. Source anchors: KAKG dojo spar, YAMA park route endpoint,
// Alpha Trading payday approach, SYZU evening route endpoints. Offsets, trigger
// extents and practice spacing are authored, not extracted original lesson bounds.
const lessons = [
  {moveId:'pitBlow', area:'JHD0', worldId:'exterior', teacher:fuku, position:[6.9,.96,-24], requires:['story.s1.first-dojo.completed'], hours:[9,19]},
  {moveId:'doubleBlow', area:'D000', worldId:'dobuita', teacher:yama, position:[-12,0,-3.4], requires:['story.s1.yamagishi-black-car.completed'], hours:[10,16.5]},
  {moveId:'swallowDive', area:'MFSY', worldId:'mfsy', teacher:guizhang, position:[25,0,70], partnerOffset:[-1.4,0,0], requires:['story.s1.workday-one-payday.completed'], hours:[17.5,23.5]},
  {moveId:'shadowStep', area:'MFSY', worldId:'mfsy', teacher:shozo, position:[91.5,0,50.3], requires:['story.s1.workday-one-payday.completed','story.s1.chicken-race.completed'], hours:[17.5,23.5]},
  {moveId:'shadowBlade', area:'MFSY', worldId:'mfsy', teacher:shozo, position:[78.4,0,39.8], requires:['story.s1.workday-two-payday.completed',learned('shadowStep')], hours:[17.5,23.5]},
  {moveId:'crossCharge', area:'MFSY', worldId:'mfsy', teacher:shozo, position:[78.4,0,39.8], requires:['story.s1.workday-four-payday.completed',learned('shadowBlade')], hours:[17.5,23.5]},
];
const provenance='Authored optional learning adaptation using the existing shared combat engine and contemporary move guides. Original character models and recovered move commands; captions, placement, offers and retry windows are authored. No per-move proficiency changes.';
// Required Story entries include the original priority-100 dojo/Heartbeats
// imports as well as the newer 200+ routes. Equal selector/priority candidates
// fail before Yarn checks their distinct bounds or prerequisite flags. Keep
// optional lessons below both bands, with distinct priorities for shared areas.
const optionalEntryPriority=50;
const routeBase=(id,area,worldId,requiredFlags=[])=>({id,area,actor:'AKIR',presentActors:[],trigger:'enter',
  priority:optionalEntryPriority,requiredFlags,completedFlag:`story.s1.${id}.completed`,effects:[],voiceIds:[],nativeSources,provenance,
  summary:'Optional move learning through acknowledged personal Story events. Decline/cancel does not teach or grant items.'});
const regions=[];
function region(route,worldId,position,radius=1.5){
  route.bounds=`s1.${route.area.toLowerCase()}.${route.id}`;
  const [x,y,z]=position;
  regions.push({id:route.bounds,area:route.area,worldId,actor:'AKIR',playMode:'story',openingCompleted:true,
    requiredFlags:route.requiredFlags,completedFlag:route.completedFlag,
    ...(route.trigger==='use'?{trigger:'use'}:{}),
    ...(route.hours?{hours:route.hours}:{}),
    min:[x-radius,y-.5,z-radius],max:[x+radius,y+2,z+radius],provenance});
}
export const moveLearningEncounters=lessons.map((lesson,index)=>{
  const m=move(lesson.moveId), counter=['shadowStep','shadowBlade','crossCharge'].includes(m.id);
  const partner=lesson.position.map((v,i)=>v+(lesson.partnerOffset||[0,0,1.4])[i]);
  return {id:`s1.${lesson.area.toLowerCase()}.${m.slug}`,label:`Learn ${m.name}`,area:lesson.area,worldId:lesson.worldId,
    provenance,authoredActors:[{tag:'AKIR',position:lesson.position},{tag:lesson.teacher.actorCode,position:partner}],
    actorDefinitions:[lesson.teacher],health:{AKIR:100,[lesson.teacher.actorCode]:100},
    playerSpeed:2.4,enemySpeed:counter?1.6:0,maxAttackers:counter?1:0,timeoutMs:0,arenaPadding:1.2,
    training:{moveId:m.id,completionMoveId:m.id,requiresContact:counter,...(counter?{attackMoveId:'tigerKnuckle'}:{}),
      instruction:counter?'Counter the approaching punch. Your partner will keep trying; mistakes cannot kill you.':`Complete ${m.name}. You do not need to hit your partner.`}};
});
export const moveLearningRoutes=lessons.map((lesson,index)=>{
  const m=move(lesson.moveId),route=routeBase(m.slug,lesson.area,lesson.worldId,lesson.requires);
  Object.assign(route,{priority:optionalEntryPriority+index,title:`${m.teacher} — ${m.name}`,hours:lesson.hours,
    effects:[learned(m.id)],challenge:moveLearningEncounters[index].id,yarnTemplate:'story-move-lesson.yarn',
    authoredText:{prompt:`I can practice ${m.name} with ${m.teacher} here.`,receipt:`I've learned ${m.name}.`}});
  region(route,lesson.worldId,lesson.position);
  return route;
});
// JOMO's captured original scroll-shaped object is in Fuku's room; the rear
// passage scroll sits inside a closed basket. Use the scroll or its basket
// instead of interrupting every approach to an approximate room volume
// (which also covered Iwao's unrelated desk).
for(const [id,area,worldId,position,requires,object] of [
  ['twinBlades','JOMO','interior',[-23.46,0,-4.275],[],'imk1'],
  ['shadowReaper','JOMO','interior',[-5.98,0,2.6],[],'bkgu'],
]){
  const m=move(id),route=routeBase(`${m.slug}-scroll`,area,worldId,requires);
  Object.assign(route,{priority:optionalEntryPriority+moveLearningRoutes.length,title:`${m.location} — move scroll`,items:[{key:m.itemKey,quantity:1}],
    yarnTemplate:'story-scroll-pickup.yarn',authoredText:{prompt:`There is a move scroll here in ${m.location}.`,
      receipt:`The ${m.name} scroll. I can read it in my inventory to learn the move.`}});
  if(object)Object.assign(route,{trigger:'use',object,objectLabel:id==='shadowReaper'?'Basket':`${m.name} scroll`,
    provenance:`${provenance} Object ${object} and its position are original JOMO placements; the correspondence to this scroll is inferred from its model and location, not a recovered native selection callback.`});
  region(route,worldId,position,object?1.5:.9);moveLearningRoutes.push(route);
}
// BOOK mode 1 inspects the original title; mode 2 takes it and sets 2:969.
const book=routeBase('stab-armor-scroll','YDB1','ydb1',['story.s1.basement-visited']);
Object.assign(book,{
  disc:2,trigger:'use',object:'BOOK',objectLabel:'Martial arts book',priority:optionalEntryPriority+moveLearningRoutes.length,
  title:'Stab Armor in the basement',items:[{key:move('stabArmor').itemKey,quantity:1}],
  yarnTemplate:'story-basement-stab-armor.yarn',staging:'s1.ydb1.stab-armor-inspect',
  nativeEffects:[{address:'2:969',value:1}],excludedNativeFlags:['2:969'],
  dialogueArchive:{path:'data/SCENE/02/STREAM/E1012.AFS',sha256:'fd632f02c074aa6918f51f3ea71176816f29d809702cfb9d2409dcee9c5b60b9'},
  nativeSources:[{role:'basement-book-owner',locator:'disc2/SCENE/02/YDB1/MAPINFO.BIN#0x6c1e,0xf940-0xfa7e,0x23c16',sha256:'3c954c79cf22327bc736c0ef07f95126468880074c55247cf04085c51ebbf0f1'},
    {role:'basement-book-placement',locator:'disc2/SCENE/02/YDB1/MPK00.PKF#CHARA.CHRT/BOOK@0x1520',sha256:'45f0e55e465e8e9ff1eeb72827d77b0a1b355b273fac22cec091722459d3b981'}],
  summary:'Examine the original basement martial arts book, then take it to Gui Zhang.',
  provenance:'Original YDB1 BOOK placement, two inspection lines and possession write. The inspection camera, reach and take/leave labels adapt the original inspect/take modes to Story.',
});
region(book,'ydb1',[-2.803,0,7.4078],1.5);
regions.at(-1).provenance='Authored reachable volume around the native MPK00/CHARA.CHRT BOOK at browser [-2.803,1.002,7.4078].';
moveLearningRoutes.push(book);
const translation=routeBase('stab-armor-translation','MS08','ms08',['story.s1.master-chen.completed']);
Object.assign(translation,{
  title:'Gui Zhang — translate Stab Armor', priority:640, trigger:'automatic', disc:2,
  participants:['KISY'], staging:'s1.ms08.stab-armor-reading',
  requiredItems:[{key:move('stabArmor').itemKey,quantity:1,nativeOwnership:'2:969'}],
  excludedNativeFlags:['2:549'],nativeEffects:[{address:'2:549',value:1}],destination:'s1.harbor.old-district-gate',
  effects:[move('stabArmor').requiredFlag], yarnTemplate:'story-scroll-translation.yarn',
  dialogueArchive:{path:'data/SCENE/02/STREAM/SA1108.AFS',sha256:'c7af7a97889b807a41b42acc48dbda1fc38d4966d46989cd311b95e9d67eaab6'},
  nativeSources:[{role:'native-stab-armor-dialogue-owner',locator:'disc2/SCENE/02/MK80/MAPINFO.BIN#0x2e4e,0x5394-0x542d',sha256:'a7199bfad279dc3737acb90bfc9bd7579f674fc5257a747b4e0fc402e612ba59'}],
  provenance:'Original SA1108 lines, actors, voice and lip cues in the warehouse room controller order. The player invitation uses adapted staging. Native branch settlement returns to MFSY entry 1.',
});
moveLearningRoutes.push(translation);
moveLearningRoutes.push({...routeBase('bunkado-move-scrolls','DKTY','dkty'),actor:'OISI',trigger:undefined,priority:650,
  title:'Bunkado Antiques — move scrolls',repeatable:true,shop:learning.moves.filter(m=>m.price),yarnTemplate:undefined});
export const moveLearningRegions=regions;
export const moveLearningChallenges=moveLearningEncounters.map(({id,label})=>({id,label,kind:'training'}));
