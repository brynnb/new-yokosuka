export class ScheduledSceneObjectCatalog {
  constructor(manifest) {
    if (!manifest || !Array.isArray(manifest.worlds)) {
      throw new TypeError("Scheduled scene-object manifest requires worlds");
    }
    this.manifest = manifest;
    this.worlds = new Map();
    for (const world of manifest.worlds) {
      if (!world?.worldId || !Array.isArray(world.sceneObjects)) {
        throw new TypeError("Invalid scheduled scene-object world definition");
      }
      if (this.worlds.has(world.worldId)) {
        throw new Error(`Duplicate scheduled scene-object world ${world.worldId}`);
      }
      const ids = new Set();
      for (const definition of world.sceneObjects) {
        const id = definition.id || definition.code;
        if (!id || ids.has(id)) {
          throw new Error(
            `Duplicate or missing scene-object id in ${world.worldId}`,
          );
        }
        ids.add(id);
      }
      this.worlds.set(world.worldId, world);
    }
  }

  world(worldId) {
    return this.worlds.get(worldId) || null;
  }

  definitions(worldId) {
    return this.world(worldId)?.sceneObjects || [];
  }

  workCount(worldId) {
    return this.definitions(worldId).length;
  }
}
