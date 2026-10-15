// Export shared move identities and original placement. Only the Go server
// simulates consequential outcomes; this is not another story engine.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { MARTIAL_ARTS_MOVES, COMMAND_BUFFER_TICKS, COMBAT_TICKS_PER_SECOND } from "../../src/MartialArtsCombat.js";
import { parseAuthMovement, evaluateAuthActor } from "../../src/AuthMovement.js";
import authoredScenes from "../../play/scripts/AuthoredSceneCatalog.js";
const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname,"story-combat.json")));
const nativeActors = JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeActivityActors.json"))).worlds;
const scenes=authoredScenes.scenes;
const encounters = spec.encounters.map(input => {
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
    poses=track.actors.map(actor=>({tag:actor.tag,...evaluateAuthActor(actor,input.sourceTime==="start"?0:actor.duration)}));
    // A new authored encounter can borrow an original activity's placement
    // while introducing a reviewed private cast not present in street schedules.
    // Keep those definitions on the encounter, not in a global shadow NPC list.
    definitions=input.actorDefinitions||nativeActors[input.worldId];
  }
  if(poses.length!==Object.keys(input.health).length||poses[0]?.tag!=="AKIR")throw new Error(`Incomplete combat cast ${input.id}`);
  const actors = poses.map(pose => {
    if(!input.health[pose.tag]||![pose.x,pose.y,pose.z].every(Number.isFinite))throw new Error(`Invalid placement ${pose.tag}`);
    return {tag:pose.tag,x:-pose.x,y:pose.y,z:pose.z,health:input.health[pose.tag]};
  });
  if(input.placement){
    const {position,yaw}=input.placement;
    if(!Array.isArray(position)||position.length!==3||![...position,yaw].every(Number.isFinite))throw Error(`Invalid authored combat placement ${input.id}`);
    const origin={...actors[0]},c=Math.cos(yaw),s=Math.sin(yaw);
    // A rigid authoring-time relocation lets ordinary encounters share a cast
    // and formation without a duplicate scene or a runtime teleport command.
    for(const actor of actors){const x=actor.x-origin.x,z=actor.z-origin.z;actor.x=position[0]+x*c+z*s;actor.y=position[1]+actor.y-origin.y;actor.z=position[2]-x*s+z*c;}
  }
  const actions = input.actions.map(({input:command,move:id,adaptedDamage})=> {
    const move = MARTIAL_ARTS_MOVES[id];
    if(!move?.animation || !move.enemyAnimation)throw new Error(`Incomplete move ${id}`);
    return {input:command,id,label:move.label,playerAnimation:move.animation,enemyAnimation:move.enemyAnimation,
      durationMs:Math.ceil(move.duration*1000/30),startupMs:Math.ceil(move.startup*1000/30),
      range:move.range,arcDegrees:move.arcDegrees,damage:adaptedDamage??move.damage,
      guardDamage:move.guardDamage,hitStunMs:Math.ceil(move.hitStun*1000/30)};
  });
  return {id:input.id,label:input.label,area:input.area,worldId:input.worldId,provenance:input.provenance,
    ...(input.placement?{placement:input.placement}:{}),
    ...(input.sourceScene?{sourceScene:input.sourceScene}:{sourceActivity:input.sourceActivity,sha256:input.sha256}),actors,actions,
    actorDefinitions:actors.filter(a=>a.tag!=="AKIR").map(actor=>{
      const def=definitions?.find(def=>def.actorCode===actor.tag);
      if(!def)throw new Error(`No reviewed actor model ${actor.tag}`);return def;
    }),
    bounds:{minX:Math.min(...actors.map(a=>a.x))-input.arenaPadding,maxX:Math.max(...actors.map(a=>a.x))+input.arenaPadding,
      minZ:Math.min(...actors.map(a=>a.z))-input.arenaPadding,maxZ:Math.max(...actors.map(a=>a.z))+input.arenaPadding},
    playerSpeed:input.playerSpeed,enemySpeed:input.enemySpeed,maxAttackers:input.maxAttackers,timeoutMs:input.timeoutMs,
    ...(input.practiceDurationMs?{practiceDurationMs:input.practiceDurationMs}:{}),
    inputBufferMs:Math.ceil(COMMAND_BUFFER_TICKS*1000/COMBAT_TICKS_PER_SECOND)};
});
fs.writeFileSync(path.join(server,"internal/scriptevent/combats.json"),JSON.stringify({schema:spec.schema,encounters},null,2)+"\n");
console.log(`Exported ${encounters.length} combat definitions from original staging/shared moves.`);
