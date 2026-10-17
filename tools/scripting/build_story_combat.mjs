// Compile original placement/client encounters plus the small server result contract.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseAuthMovement, evaluateAuthActor } from "../../src/AuthMovement.js";
import authoredScenes from "../../play/scripts/AuthoredSceneCatalog.js";
import { storyCombatContract } from "../../src/StoryCombatContract.js";
const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname,"story-combat.json")));
const nativeActors = JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeActivityActors.json"))).worlds;
const music=JSON.parse(fs.readFileSync(path.join(root,"public/music/manifest.json"))).tracks;
const scenes=authoredScenes.scenes;
const encounters = spec.encounters.map(input => {
  if(input.musicTrack&&!music[input.musicTrack])throw Error(`Missing reviewed combat music ${input.id}/${input.musicTrack}`);
  if(input.sourceTime && !["start","end"].includes(input.sourceTime))throw new Error(`Invalid staging time ${input.id}`);
  let poses,definitions;
  if(input.sourceScene){
    if(input.sourceActivity||input.sourceTime)throw new Error(`Ambiguous staging ${input.id}`);
    const scene=scenes.find(s=>s.id===input.sourceScene);
    if(!scene||scene.area!==input.area||scene.worldId!==input.worldId)throw new Error(`Wrong authored staging ${input.id}`);
    poses=scene.actors.filter(a=>input.health[a.tag]).map(a=>({tag:a.tag,...a.pose}));
    definitions=scene.actorDefinitions;
  }else{
    const bytes = fs.readFileSync(path.join(root,input.sourceActivity));
    if(createHash("sha256").update(bytes).digest("hex")!==input.sha256)throw new Error(`Changed staging ${input.id}`);
    const track = parseAuthMovement(bytes);
    poses=track.actors.filter(actor=>Object.hasOwn(input.health,actor.tag)).map(actor=>({tag:actor.tag,...evaluateAuthActor(actor,input.sourceTime==="start"?0:actor.duration)}));
    // A new authored encounter can borrow an original activity's placement
    // while introducing a reviewed private cast not present in street schedules.
    // Keep those definitions on the encounter, not in a global shadow NPC list.
    if(input.sourcePackage){
      const manifest=JSON.parse(fs.readFileSync(path.join(root,input.sourcePackage)));
      if(!manifest.outputs.some(o=>o.path===input.sourceActivity&&o.sha256===input.sha256))throw Error(`Combat package does not own its source ${input.id}`);
      // The native film and the subsequent fight borrow the same source-qualified
      // actor models. Do not copy archive-only characters into a global pool or
      // maintain a second hand-written cast/model association for combat.
      definitions=Object.entries(manifest.packageActors).map(([actorCode,definition])=>{
        const actor={actorCode,...definition,activityOnly:true};
        const shared=scenes.filter(scene=>scene.worldId===input.worldId).flatMap(scene=>scene.actorDefinitions).find(d=>d.actorCode===actorCode);
        if(!shared)return actor;
        // Reuse an existing world actor only when the package explicitly uses
        // that same source-qualified model/texture pair. Redundant metadata must
        // not create a second, conflicting MRSK/OKYS definition at world load.
        // Identical archive-owned pairs can be shared too (the biker fight and
        // interrogation). Different source pairs remain an explicit error.
        if(shared.modelCode!==definition.modelCode||shared.label!==definition.label||
          definition.assetPath!==(shared.assetPath||`play/assets/characters/${shared.modelCode}.CHRM`)||
          definition.textureAssetPath!==(shared.textureAssetPath||`play/assets/characters/${shared.modelCode.split("_")[0]}_textures.bin`)||
          definition.assetFormat!=="MT5"||definition.characterScale!==1)throw Error(`Conflicting package/shared combat actor ${input.id}/${actorCode}`);
        return shared;
      });
    }else definitions=input.actorDefinitions||nativeActors[input.actorWorldId||input.worldId];
  }
  if(poses.length!==Object.keys(input.health).length||poses[0]?.tag!=="AKIR")throw new Error(`Incomplete combat cast ${input.id}`);
  const actors = poses.map(pose => {
    if(!input.health[pose.tag]||![pose.x,pose.y,pose.z].every(Number.isFinite))throw new Error(`Invalid placement ${pose.tag}`);
    return {tag:pose.tag,x:-pose.x,y:pose.y,z:pose.z,health:input.health[pose.tag],
      ...(input.teams?.[pose.tag]?{team:input.teams[pose.tag]}:{}),...(input.damageScales?.[pose.tag]?{damageScale:input.damageScales[pose.tag]}:{})};
  });
  if(input.formation){
    // Cinematic grab/end poses are not necessarily safe combat starts. An
    // authored formation gives every fighter a reviewed local offset before
    // the existing rigid world placement; never silently mix the two sources.
    if(Object.keys(input.formation).length!==actors.length)throw Error(`Incomplete authored formation ${input.id}`);
    for(const actor of actors){const p=input.formation[actor.tag];if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error(`Invalid formation ${input.id}/${actor.tag}`);[actor.x,actor.y,actor.z]=p;}
    if(actors[0].x||actors[0].y||actors[0].z)throw Error(`Formation player origin must be zero ${input.id}`);
  }
  if(input.placement){
    const {position,yaw}=input.placement;
    if(!Array.isArray(position)||position.length!==3||![...position,yaw].every(Number.isFinite))throw Error(`Invalid authored combat placement ${input.id}`);
    const origin={...actors[0]},c=Math.cos(yaw),s=Math.sin(yaw);
    // A rigid authoring-time relocation lets ordinary encounters share a cast
    // and formation without a duplicate scene or a runtime teleport command.
    for(const actor of actors){const x=actor.x-origin.x,z=actor.z-origin.z;actor.x=position[0]+x*c+z*s;actor.y=position[1]+actor.y-origin.y;actor.z=position[2]-x*s+z*c;}
  }
  const waves=input.waves?.map(wave=>({label:wave.label,...(wave.bossTag?{bossTag:wave.bossTag}:{}),introMs:wave.introMs||0,actors:wave.actors.map(tag=>{
    const spawn=actors.find(a=>a.tag===tag);if(!spawn||tag==="AKIR"||spawn.team==="ally")throw Error(`Invalid wave opponent ${input.id}/${tag}`);return {...spawn};
  })}));
  return {id:input.id,label:input.label,area:input.area,worldId:input.worldId,provenance:input.provenance,
    ...(input.placement?{placement:input.placement}:{}),...(input.formation?{formation:input.formation}:{}),...(input.actorWorldId?{actorWorldId:input.actorWorldId}:{}),
    ...(input.sourceScene?{sourceScene:input.sourceScene}:{sourceActivity:input.sourceActivity,sha256:input.sha256}),...(input.sourcePackage?{sourcePackage:input.sourcePackage}:{}),actors,
    actorDefinitions:actors.filter(a=>a.tag!=="AKIR").map(actor=>{
      const def=definitions?.find(def=>def.actorCode===actor.tag);
      if(!def)throw new Error(`No reviewed actor model ${actor.tag}`);return def;
    }),
    bounds:{minX:Math.min(...actors.map(a=>a.x))-input.arenaPadding,maxX:Math.max(...actors.map(a=>a.x))+input.arenaPadding,
      minZ:Math.min(...actors.map(a=>a.z))-input.arenaPadding,maxZ:Math.max(...actors.map(a=>a.z))+input.arenaPadding},
    playerSpeed:input.playerSpeed,enemySpeed:input.enemySpeed,maxAttackers:input.maxAttackers,timeoutMs:input.timeoutMs,
    ...(input.practiceDurationMs?{practiceDurationMs:input.practiceDurationMs}:{}),
    ...(waves?{waves,waveDelayMs:input.waveDelayMs||0}:{}),...(input.musicTrack?{musicTrack:input.musicTrack}:{}),
    };
});
const catalog = {schema:spec.schema,encounters};
fs.writeFileSync(path.join(root,"play/data/story-combat.json"),JSON.stringify(catalog,null,2)+"\n");
fs.writeFileSync(path.join(server,"internal/scriptevent/combats.json"),JSON.stringify(storyCombatContract(catalog),null,2)+"\n");
console.log(`Exported ${encounters.length} combat definitions from original staging/shared moves.`);
