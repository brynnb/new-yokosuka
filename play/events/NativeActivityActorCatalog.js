const SCHEMA = "new-yokosuka-native-activity-actors-v1";
const ACTOR_CODE = /^[A-Z0-9_]{4}$/;
const MODEL_CODE = /^[A-Z0-9]{3}_[LM]$/;

function requireText(value, label, pattern = null) {
  const text = String(value || "").trim();
  if (!text || (pattern && !pattern.test(text))) {
    throw new TypeError(`${label} is invalid`);
  }
  return text;
}

function freezeDefinition(value, worldId) {
  if (value?.activityOnly !== true) {
    throw new TypeError(
      `native activity actor in ${worldId} must be explicitly activity-only`,
    );
  }
  return Object.freeze({
    actorCode: requireText(value.actorCode, "native activity actor code", ACTOR_CODE),
    label: requireText(value.label, "native activity actor label"),
    modelCode: requireText(value.modelCode, "native activity model code", MODEL_CODE),
    activityOnly: true,
  });
}

export class NativeActivityActorCatalog {
  constructor(manifest) {
    if (manifest?.schema !== SCHEMA) {
      throw new Error(
        `unsupported native activity actor manifest ${manifest?.schema || "<missing>"}`,
      );
    }
    const exactModelCodes = new Set(manifest.modelCodes || []);
    this.worlds = new Map();
    for (const [worldIdValue, values] of Object.entries(manifest.worlds || {})) {
      const worldId = requireText(worldIdValue, "native activity world ID");
      if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError(`native activity world ${worldId} has no actors`);
      }
      const definitions = values.map(value => freezeDefinition(value, worldId));
      const actorCodes = definitions.map(value => value.actorCode);
      if (new Set(actorCodes).size !== actorCodes.length) {
        throw new Error(`native activity world ${worldId} has duplicate actor codes`);
      }
      for (const definition of definitions) {
        if (!exactModelCodes.has(definition.modelCode)) {
          throw new Error(
            `native activity actor ${definition.actorCode} has an unverified model`,
          );
        }
      }
      this.worlds.set(worldId, Object.freeze(definitions));
    }
    if (this.worlds.size === 0) {
      throw new Error("native activity actor manifest has no worlds");
    }
  }

  forWorld(worldId) {
    return this.worlds.get(String(worldId || "")) || Object.freeze([]);
  }
}

export function createNativeActivityActorCatalog(manifest) {
  return new NativeActivityActorCatalog(manifest);
}
