const TEXT = /^[\x20-\x7e]+$/u;

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0 || !TEXT.test(value)) {
    throw new TypeError(`${label} must be non-empty printable text`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requireUnique(records, key, label) {
  const seen = new Set();
  for (const record of records) {
    const value = requireText(record?.[key], `${label} ${key}`);
    if (seen.has(value)) throw new Error(`${label} ${value} is duplicated`);
    seen.add(value);
  }
  return seen;
}

/**
 * The canonical, renderer-independent source graph emitted by native
 * cutscene extraction. This deliberately accepts only the current schema;
 * stale generated formats are regenerated rather than adapted here.
 */
export function createNativeCutsceneSourceGraph(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("native cutscene source graph definition is required");
  }
  requireText(definition.id, "cutscene id");
  requireText(definition.area, "cutscene area");
  requireText(definition.source?.mapinfo?.sha256, "MAPINFO SHA-256");
  requireText(definition.program?.entryFunction, "program entry function");

  const resources = requireArray(definition.resources, "resources");
  const resourceIds = requireUnique(resources, "logicalId", "resource");
  for (const resource of resources) {
    requireText(resource.contentIdentity, `${resource.logicalId} content identity`);
    if (!Number.isInteger(resource.byteLength) || resource.byteLength <= 0) {
      throw new TypeError(`${resource.logicalId} byte length is invalid`);
    }
  }

  const activities = requireArray(definition.activities, "activities");
  requireUnique(activities, "logicalId", "activity");
  for (const activity of activities) {
    if (!resourceIds.has(activity.resourceId)) {
      throw new Error(`${activity.logicalId} references an unknown resource`);
    }
  }

  const models = requireArray(definition.models, "models");
  const modelIds = requireUnique(models, "logicalId", "model");
  for (const model of models) {
    if (!resourceIds.has(model.resourceId)) {
      throw new Error(`${model.logicalId} references an unknown model resource`);
    }
  }
  const motions = requireArray(definition.motions, "motions");
  const motionIds = requireUnique(motions, "logicalId", "motion");
  for (const motion of motions) {
    if (!resourceIds.has(motion.resourceId)) {
      throw new Error(`${motion.logicalId} references an unknown motion resource`);
    }
  }
  for (const binding of requireArray(definition.motionCompatibility, "motion compatibility")) {
    if (!motionIds.has(binding.motionId)) {
      throw new Error(`motion binding references unknown motion ${binding.motionId}`);
    }
    for (const modelId of requireArray(binding.compatibleModelIds, "compatible model ids")) {
      if (!modelIds.has(modelId)) {
        throw new Error(`motion binding references unknown model ${modelId}`);
      }
    }
  }

  if (!Array.isArray(definition.compile?.blockers)) {
    throw new TypeError("compile blockers must be an array");
  }

  return Object.freeze({
    schema: "new-yokosuka-native-cutscene-source-graph-v1",
    ...definition,
  });
}
