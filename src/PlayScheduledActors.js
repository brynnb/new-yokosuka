import {
  createScheduledActorDefinitionCollection,
} from "./ScheduledActorDefinitionCollection.js";
import {
  SCHEDULED_ACTOR_WORLD_SHARD_LOADERS,
} from "./PlayScheduledActorShardLoaders.generated.js";
import nativeRoomActors from "../play/data/nativeRoomActors.js";

const SHENMUE2_CROWD_SHARD_LOADERS = Object.freeze({
  s2ak00: () => import(
    "../play/data/shenmue2-crowd/s2ak00.json"
  ),
  s2ar02: () => import(
    "../play/data/shenmue2-crowd/s2ar02.json"
  ),
  s2ar03: () => import(
    "../play/data/shenmue2-crowd/s2ar03.json"
  ),
  s2wb00: () => import(
    "../play/data/shenmue2-crowd/s2wb00.json"
  ),
  s2we00: () => import(
    "../play/data/shenmue2-crowd/s2we00.json"
  ),
  s2wk00: () => import(
    "../play/data/shenmue2-crowd/s2wk00.json"
  ),
  s2wn00: () => import(
    "../play/data/shenmue2-crowd/s2wn00.json"
  ),
  s2wr00: () => import(
    "../play/data/shenmue2-crowd/s2wr00.json"
  ),
  s2ws00: () => import(
    "../play/data/shenmue2-crowd/s2ws00.json"
  ),
  s2wt00: () => import(
    "../play/data/shenmue2-crowd/s2wt00.json"
  ),
});

const WORLD_SHARD_LOADERS = Object.freeze({
  ...SCHEDULED_ACTOR_WORLD_SHARD_LOADERS,
  ...SHENMUE2_CROWD_SHARD_LOADERS,
});

const actorsByWorld = new Map();

export async function scheduledActorsForWorld(worldId) {
  if (actorsByWorld.has(worldId)) return actorsByWorld.get(worldId);
  const loadShard = WORLD_SHARD_LOADERS[worldId];
  const roomActors = nativeRoomActors.worlds?.[worldId] || [];
  if (!loadShard && roomActors.length === 0) {
    actorsByWorld.set(worldId, Object.freeze([]));
    return actorsByWorld.get(worldId);
  }
  const shard = loadShard
    ? (await loadShard()).default
    : { actors: [], areaWorlds: {}, localObjectModels: [], motionRequirements: {} };
  const actors = createScheduledActorDefinitionCollection(
    [
      ...shard.actors.map((actor) => Object.freeze({
        ...actor,
        areaWorlds: shard.areaWorlds,
      })),
      ...roomActors.map((actor) => Object.freeze({ ...actor })),
    ],
    {
      localObjectModels: shard.localObjectModels,
      motionRequirements: shard.motionRequirements,
    },
  );
  actorsByWorld.set(worldId, actors);
  return actors;
}

export function clearScheduledActorShardCache() {
  actorsByWorld.clear();
}
