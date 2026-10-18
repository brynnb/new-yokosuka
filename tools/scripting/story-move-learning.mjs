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
const routeBase=(id,area,worldId,requiredFlags=[])=>({id,area,actor:'AKIR',presentActors:[],trigger:'enter',
  priority:600,requiredFlags,completedFlag:`story.s1.${id}.completed`,effects:[],voiceIds:[],nativeSources,provenance,
  summary:'Optional move learning through acknowledged personal Story events. Decline/cancel does not teach or grant items.'});
const regions=[];
function region(route,worldId,position,radius=1.5){
  route.bounds=`s1.${route.area.toLowerCase()}.${route.id}`;
  const [x,y,z]=position;
  regions.push({id:route.bounds,area:route.area,worldId,actor:'AKIR',playMode:'story',openingCompleted:true,
    requiredFlags:route.requiredFlags,completedFlag:route.completedFlag,
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
  Object.assign(route,{priority:600+index,title:`${m.teacher} — ${m.name}`,hours:lesson.hours,
    effects:[learned(m.id)],challenge:moveLearningEncounters[index].id,yarnTemplate:'story-move-lesson.yarn',
    authoredText:{prompt:`I can practice ${m.name} with ${m.teacher} here.`,receipt:`I've learned ${m.name}.`}});
  region(route,lesson.worldId,lesson.position);
  return route;
});
// Approaches reuse reviewed rooms/shelf areas, not invented clickable props.
for(const [id,area,worldId,position,requires] of [
  ['twinBlades','JOMO','interior',[-22.1,0,-1.1],[]],
  ['shadowReaper','JOMO','interior',[1.4,0,.5],[]],
  ['stabArmor','YDB1','ydb1',[-6.2,0,3],['story.s1.basement-visited']],
]){
  const m=move(id),route=routeBase(`${m.slug}-scroll`,area,worldId,requires);
  Object.assign(route,{priority:620+moveLearningRoutes.length,title:`${m.location} — move scroll`,items:[{key:m.itemKey,quantity:1}],
    yarnTemplate:'story-scroll-pickup.yarn',authoredText:{prompt:`There is a move scroll here in ${m.location}.`,
      receipt:id==='stabArmor'?'This scroll is in Chinese. I should ask Master Chen to translate it.':`The ${m.name} scroll. I can read it in my inventory to learn the move.`}});
  region(route,worldId,position,.9);moveLearningRoutes.push(route);
}
const translation=routeBase('stab-armor-translation','MS08','ms08',['story.s1.master-chen.completed']);
Object.assign(translation,{title:'Master Chen — translate Stab Armor',priority:640,trigger:'automatic',
  requiredItems:[{key:move('stabArmor').itemKey,quantity:1}],effects:[move('stabArmor').requiredFlag],yarnTemplate:'story-scroll-translation.yarn'});
moveLearningRoutes.push(translation);
moveLearningRoutes.push({...routeBase('bunkado-move-scrolls','DKTY','dkty'),actor:'OISI',trigger:undefined,priority:650,
  title:'Bunkado Antiques — move scrolls',repeatable:true,shop:learning.moves.filter(m=>m.price),yarnTemplate:undefined});
export const moveLearningRegions=regions;
export const moveLearningChallenges=moveLearningEncounters.map(({id,label})=>({id,label,kind:'training'}));
