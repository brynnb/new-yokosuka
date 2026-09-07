import {
  scheduledActorMotionRequirements,
} from "../../src/ScheduledActorMotionRequirements.js";
import { vehicleSpawnManifest } from "../../src/VehicleSpawns.js";
import scheduledActorLocalObjectModels
  from "../../play/data/scheduledActorLocalObjectModels.js";
import {
  SCHEDULED_SECONDARY_OBJECTS,
} from "../../play/config/scheduledSecondaryObjects.js";
import {
  linkedRoutesByOffset,
  runtimeJourneys,
} from "./runtime_npc_manifest.js";

function operationsOf(actor) {
  return (actor.journeys || []).flatMap(
    (journey) => journey.operations || [],
  );
}

function renderRoutes(actor) {
  const routes = [];
  const routesByPoints = new Map();
  const add = (id, points) => {
    if (!id || !points?.length) return;
    const pointsKey = JSON.stringify(points);
    const existing = routesByPoints.get(pointsKey);
    if (existing) {
      if (existing.id !== id && !existing.aliases?.includes(id)) {
        existing.aliases ||= [];
        existing.aliases.push(id);
      }
      return;
    }
    const route = { id, points };
    routesByPoints.set(pointsKey, route);
    routes.push(route);
  };
  for (const operation of operationsOf(actor)) {
    if (operation.operation === 1) {
      add(operation.routeId, operation.points);
    }
    if (operation.operation === 0x1c) {
      add(operation.routeId, operation.secondaryRoute?.points);
      add(
        operation.secondaryHandoff?.routeId,
        operation.secondaryHandoff?.points,
      );
    }
    if (operation.operation === 0x16) {
      add(
        operation.linkedPlacement?.controllerRouteId,
        operation.linkedPlacement?.controllerRoutePoints,
      );
      add(
        operation.linkedPlacement?.handoffRouteId,
        operation.linkedPlacement?.handoffRoutePoints,
      );
    }
  }
  return routes;
}

function secondaryObject(actor) {
  const operations = operationsOf(actor);
  const forklift = operations.find((operation) => (
    operation.operation === 0x1c
    && operation.secondaryObjectCode?.startsWith("FK0")
  ));
  if (forklift) {
    return {
      objectCode: forklift.secondaryObjectCode,
      kind: "forklift",
      model: vehicleSpawnManifest.defaultForkliftModel,
    };
  }
  const attachment = operations.find((operation) => (
    operation.operation === 0x24
    && SCHEDULED_SECONDARY_OBJECTS[operation.secondaryObjectCode]
  ));
  if (!attachment) return null;
  return {
    objectCode: attachment.secondaryObjectCode,
    ...SCHEDULED_SECONDARY_OBJECTS[attachment.secondaryObjectCode],
  };
}

function renderActor(actor) {
  const projected = {
    instanceId: actor.instanceId,
    actorCode: actor.actorCode,
    label: actor.label,
    modelCode: actor.modelCode,
    textureFile: actor.textureFile,
    modelOverrides: (actor.modelOverrides || []).map((override) => ({
      modelCode: override.modelCode,
      textureFile: override.textureFile,
    })),
    authoritative: true,
    routes: renderRoutes(actor),
  };
  const secondary = secondaryObject(actor);
  if (secondary) projected.secondaryObject = secondary;
  return projected;
}

function localObjectModels(runtimeActors, worldId) {
  const registry = scheduledActorLocalObjectModels.worlds?.[worldId] || {};
  const models = new Set();
  for (const actor of runtimeActors) {
    for (const operation of operationsOf(actor)) {
      if (operation.operation !== 0x10) continue;
      const registration = operation.localTransform;
      const model = (
        registry[registration?.locationCode]
        || registration?.resolvedModel
      );
      if (model) models.add(model);
    }
  }
  return [...models].sort();
}

export function scheduledActorRenderWorldShards(manifest) {
  const linkedRoutes = linkedRoutesByOffset(manifest);
  const runtimeActorsByWorld = new Map();
  for (const actor of manifest.actors) {
    if (!actor.scheduleVariants.some((variant) => (
      variant.scheduleVariantId === actor.defaultScheduleVariantId
    ))) {
      throw new Error(
        `Missing default schedule variant for ${actor.instanceId}.`,
      );
    }
    const runtimeActor = {
      ...actor,
      journeys: actor.scheduleVariants.flatMap(
        (variant) => runtimeJourneys(actor, variant, linkedRoutes),
      ),
    };
    for (const worldId of actor.playbackWorldIds) {
      const actors = runtimeActorsByWorld.get(worldId) || [];
      actors.push(runtimeActor);
      runtimeActorsByWorld.set(worldId, actors);
    }
  }

  return new Map(
    [...runtimeActorsByWorld].sort().map(([worldId, runtimeActors]) => [
      worldId,
      {
        schema: "new-yokosuka-play-scheduled-actors-v2",
        generatedFrom: "play/data/scheduled-actors.json",
        worldId,
        areaWorlds: manifest.areaWorlds,
        motionRequirements: scheduledActorMotionRequirements(runtimeActors),
        localObjectModels: localObjectModels(runtimeActors, worldId),
        actors: runtimeActors.map(renderActor),
      },
    ]),
  );
}

export function scheduledActorWorldShardLoaderSource(worldIds) {
  const entries = [...new Set(worldIds)].sort().map((worldId) => (
    `  ${JSON.stringify(worldId)}: () => import(\n`
    + `    "../play/data/scheduled-actors/${worldId}.json"\n`
    + "  ),"
  ));
  return [
    "// Generated by tools/actors/build_play_scheduled_actor_shards.mjs.",
    "// Rebuild with `npm run build:scheduled-actors`; do not edit by hand.",
    "export const SCHEDULED_ACTOR_WORLD_SHARD_LOADERS = Object.freeze({",
    ...entries,
    "});",
    "",
  ].join("\n");
}
