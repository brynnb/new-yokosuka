import {
  scheduledActorMotionRequirements,
} from "./ScheduledActorMotionRequirements.js";

function requireDefinitions(definitions, label) {
  if (!Array.isArray(definitions)) {
    throw new TypeError(`${label} must be an array`);
  }
  return definitions;
}

function freezeMotionRequirements(requirements = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(requirements).map(([bank, names]) => {
      if (!Array.isArray(names)) {
        throw new TypeError(
          `scheduled actor motion requirements for ${bank} must be an array`,
        );
      }
      return [bank, Object.freeze([...new Set(names)])];
    }),
  ));
}

/**
 * Scheduled actor definitions are an array with non-enumerable dependency
 * metadata. Keeping construction here prevents ordinary array operations from
 * silently separating compact definitions from the motion and attachment
 * resources that were generated for them.
 */
export function createScheduledActorDefinitionCollection(
  definitions,
  options = {},
) {
  const sourceDefinitions = requireDefinitions(
    definitions,
    "scheduled actor definitions",
  );
  const collection = [...sourceDefinitions];
  const localObjectModels = options.localObjectModels
    ?? sourceDefinitions.localObjectModels
    ?? [];
  const motionRequirements = options.motionRequirements
    ?? scheduledActorMotionRequirements(sourceDefinitions);
  if (!Array.isArray(localObjectModels)) {
    throw new TypeError("scheduled actor local-object models must be an array");
  }
  Object.defineProperties(collection, {
    localObjectModels: {
      value: Object.freeze([...new Set(localObjectModels)].sort()),
    },
    motionRequirements: {
      value: freezeMotionRequirements(motionRequirements),
    },
  });
  return Object.freeze(collection);
}

/**
 * Compose compact scheduled residents with supplemental actor collections.
 * Each input contributes through its own dependency contract: generated
 * compact arrays use their attached metadata, while full definitions are
 * inspected by the normal requirement extractor. This keeps cutscene-only
 * actors from erasing ordinary world animation and prop dependencies.
 */
export function composeScheduledActorDefinitions(
  collections,
  {
    localObjectModelRequirements = null,
    worldId = null,
  } = {},
) {
  requireDefinitions(collections, "scheduled actor collections");
  const residentActorCodes = new Set(
    collections.flatMap(collection => (
      requireDefinitions(collection, "scheduled actor collection")
        .filter(definition => definition.activityOnly !== true)
        .map(definition => definition.actorCode)
    )),
  );
  const definitions = [];
  const localObjectModels = new Set();
  const motionRequirements = new Map();

  for (const collection of collections) {
    requireDefinitions(collection, "scheduled actor collection");
    definitions.push(...collection.filter(definition => (
      definition.activityOnly !== true
      || !residentActorCodes.has(definition.actorCode)
    )));

    for (const [bank, names] of Object.entries(
      scheduledActorMotionRequirements(collection),
    )) {
      const combined = motionRequirements.get(bank) || new Set();
      for (const name of names) combined.add(name);
      motionRequirements.set(bank, combined);
    }

    const requiredLocalObjects = localObjectModelRequirements
      ? localObjectModelRequirements(collection, worldId)
      : collection.localObjectModels || [];
    if (!Array.isArray(requiredLocalObjects)) {
      throw new TypeError(
        "scheduled actor local-object requirement resolver must return an array",
      );
    }
    for (const model of requiredLocalObjects) localObjectModels.add(model);
  }

  return createScheduledActorDefinitionCollection(definitions, {
    localObjectModels: [...localObjectModels],
    motionRequirements: Object.fromEntries(
      [...motionRequirements].map(([bank, names]) => [bank, [...names]]),
    ),
  });
}
