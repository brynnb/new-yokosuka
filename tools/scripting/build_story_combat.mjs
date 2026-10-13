// Export shared move identities and original placement. Only the Go server
// simulates consequential outcomes; this is not another story engine.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { MARTIAL_ARTS_MOVES, COMMAND_BUFFER_TICKS, COMBAT_TICKS_PER_SECOND } from "../../src/MartialArtsCombat.js";
import { parseAuthMovement, evaluateAuthActor } from "../../src/AuthMovement.js";
const root = path.resolve(import.meta.dirname, "../..");
const server = process.env.NEW_YOKOSUKA_SERVER_DIR;
if (!server) throw new Error("NEW_YOKOSUKA_SERVER_DIR is required");
const spec = JSON.parse(fs.readFileSync(path.join(import.meta.dirname,"story-combat.json")));
const nativeActors = JSON.parse(fs.readFileSync(path.join(root,"play/data/events/nativeActivityActors.json"))).worlds;
const encounters = spec.encounters.map(input => {
  if(input.sourceTime && !["start","end"].includes(input.sourceTime))throw new Error(`Invalid staging time ${input.id}`);
  const bytes = fs.readFileSync(path.join(root,input.sourceActivity));
  if(createHash("sha256").update(bytes).digest("hex")!==input.sha256)throw new Error(`Changed staging ${input.id}`);
  const track = parseAuthMovement(bytes);
  const actors = track.actors.map(actor => {
    const pose = evaluateAuthActor(actor, input.sourceTime === "start" ? 0 : actor.duration);
    if(!input.health[actor.tag])throw new Error(`Missing balance for ${actor.tag}`);
    return {tag:actor.tag,x:-pose.x,y:pose.y,z:pose.z,health:input.health[actor.tag]};
  });
  const actions = input.actions.map(({input:command,move:id,adaptedDamage})=> {
    const move = MARTIAL_ARTS_MOVES[id];
    if(!move?.animation || !move.enemyAnimation)throw new Error(`Incomplete move ${id}`);
    return {input:command,id,label:move.label,playerAnimation:move.animation,enemyAnimation:move.enemyAnimation,
      durationMs:Math.ceil(move.duration*1000/30),startupMs:Math.ceil(move.startup*1000/30),
      range:move.range,arcDegrees:move.arcDegrees,damage:adaptedDamage??move.damage,
      guardDamage:move.guardDamage,hitStunMs:Math.ceil(move.hitStun*1000/30)};
  });
  return {id:input.id,label:input.label,area:input.area,worldId:input.worldId,provenance:input.provenance,
    sourceActivity:input.sourceActivity,sha256:input.sha256,actors,actions,
    actorDefinitions:actors.filter(a=>a.tag!=="AKIR").map(actor=>{
      const def=nativeActors[input.worldId]?.find(def=>def.actorCode===actor.tag);
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
