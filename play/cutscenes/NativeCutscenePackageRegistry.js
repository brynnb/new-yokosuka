function requireIdentifier(value, label) {
  const identifier = String(value || "").trim();
  if (!identifier) throw new TypeError(`${label} is required`);
  return identifier;
}

function freezeActorDefinitions(definitions, packageId) {
  if (!Array.isArray(definitions)) {
    throw new TypeError(`cutscene package ${packageId} actor definitions are required`);
  }
  return Object.freeze([...definitions]);
}

function validatePackage(definition) {
  const id = requireIdentifier(definition?.id, "cutscene package ID");
  const worldId = requireIdentifier(
    definition?.worldId,
    `cutscene package ${id} world ID`,
  );
  if (!definition.playback.manifest) {
    throw new TypeError(`cutscene package ${id} playback manifest is required`);
  }
  if (!definition.assets || typeof definition.assets !== "object") {
    throw new TypeError(`cutscene package ${id} bundled assets are required`);
  }
  const assets = Object.entries(definition.assets);
  if (
    assets.length === 0
    || assets.some(([path, url]) => !String(path).trim() || !String(url).trim())
  ) {
    throw new TypeError(`cutscene package ${id} has invalid bundled assets`);
  }
  if (!Array.isArray(definition.actorTags)) {
    throw new TypeError(`cutscene package ${id} actor tags are required`);
  }
  if (
    definition.actors?.playerActorAliases !== undefined
    && !Array.isArray(definition.actors.playerActorAliases)
  ) throw new TypeError(`cutscene package ${id} player actor aliases are invalid`);
  if (
    definition.presentation?.facialActorAliases !== undefined
    && (
      !definition.presentation.facialActorAliases
      || typeof definition.presentation.facialActorAliases !== "object"
      || Array.isArray(definition.presentation.facialActorAliases)
    )
  ) throw new TypeError(`cutscene package ${id} facial actor aliases are invalid`);
  return Object.freeze({
    ...definition,
    id,
    worldId,
    actorDefinitions: freezeActorDefinitions(definition.actorDefinitions, id),
  });
}

export class NativeCutscenePackageRegistry {
  #packages;

  constructor(definitions = []) {
    if (!Array.isArray(definitions) || definitions.length === 0) {
      throw new TypeError("native cutscene package definitions are required");
    }
    this.#packages = new Map();
    for (const value of definitions) {
      const definition = validatePackage(value);
      if (this.#packages.has(definition.id)) {
        throw new Error(`duplicate cutscene package ${definition.id}`);
      }
      this.#packages.set(definition.id, definition);
    }
  }

  resolve(packageId) {
    return this.#packages.get(String(packageId || "")) || null;
  }

  definitions() {
    return Object.freeze([...this.#packages.values()]);
  }

  requireForCutscene(cutscene) {
    const cutsceneId = requireIdentifier(cutscene?.id, "cutscene ID");
    const packageId = requireIdentifier(
      cutscene?.packageId,
      `cutscene ${cutsceneId} package ID`,
    );
    const definition = this.resolve(packageId);
    if (!definition) {
      throw new Error(`cutscene ${cutsceneId} references unknown package ${packageId}`);
    }
    if (definition.worldId !== cutscene.worldId) {
      throw new Error(
        `cutscene ${cutsceneId} world does not match package ${packageId}`,
      );
    }
    const programDriven = Boolean(cutscene.program);
    if (!cutscene.activity && !programDriven) {
      throw new Error(`cutscene ${cutsceneId} has no native activity binding`);
    }
    if (cutscene.activity && programDriven) {
      throw new Error(
        `cutscene ${cutsceneId} cannot select an activity and native program`,
      );
    }
    return definition;
  }

  forWorld(worldId) {
    const normalized = String(worldId || "");
    return Object.freeze(
      this.definitions().filter(value => value.worldId === normalized),
    );
  }

  actorDefinitionsForWorld(worldId) {
    const definitions = this.forWorld(worldId).flatMap(
      value => value.actorDefinitions,
    );
    const byActorCode = new Map();
    for (const definition of definitions) {
      const existing = byActorCode.get(definition.actorCode);
      if (existing && existing.modelCode !== definition.modelCode) {
        throw new Error(
          `cutscene actor ${definition.actorCode} has conflicting models`,
        );
      }
      byActorCode.set(definition.actorCode, definition);
    }
    return Object.freeze([...byActorCode.values()]);
  }

  actorTags() {
    return Object.freeze([
      ...new Set(
        this.definitions().flatMap(value => value.actorTags || []),
      ),
    ]);
  }
}

export function createNativeCutscenePackageRegistry(definitions) {
  return new NativeCutscenePackageRegistry(definitions);
}
