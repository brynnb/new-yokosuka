import compositionData from "./data/scene-compositions.json" with {
  type: "json",
};

const VALID_VARIANT_TYPES = new Set(["season", "time", "weather"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function variantAssets(group) {
  return group.variants.flatMap(value => (
    value ? (Array.isArray(value) ? value : [value]) : []
  ));
}

function validateCompositionData(data) {
  requireRecord(data, "scene composition data");
  if (data.schema !== "new-yokosuka-scene-compositions-v1") {
    throw new Error("unsupported scene composition schema");
  }
  requireRecord(data.families, "scene composition families");
  requireRecord(data.sources, "scene composition sources");
  requireRecord(data.variantProfiles || {}, "additional scene variant profiles");
  requireRecord(data.scenes, "scene compositions");
  for (const [familyId, family] of Object.entries(data.families)) {
    if (!Array.isArray(family.sources) || family.sources.length === 0) {
      throw new Error(`${familyId} must declare at least one source`);
    }
    for (const sourceId of family.sources) {
      if (!data.sources[sourceId]) {
        throw new Error(`${familyId} references an unknown source`);
      }
    }
  }
  for (const [sourceId, source] of Object.entries(data.sources)) {
    if (!data.families[source.family]) {
      throw new Error(`${sourceId} references an unknown environment family`);
    }
    if (!data.families[source.family].sources.includes(sourceId)) {
      throw new Error(`${sourceId} is absent from its environment family`);
    }
    if (!/^S[1-3]_[A-Z0-9]{4}$/.test(source.prefix)) {
      throw new Error(`${sourceId} has an invalid asset prefix`);
    }
    if (!Array.isArray(source.baseAssets) || !Array.isArray(source.residentAssets)) {
      throw new Error(`${sourceId} must declare base and resident assets`);
    }
    const resident = new Set(source.residentAssets);
    if (source.baseAssets.some(asset => !resident.has(asset))) {
      throw new Error(`${sourceId} base assets must also be resident`);
    }
    for (const group of source.groups || []) {
      if (!VALID_VARIANT_TYPES.has(group.type) || !Array.isArray(group.variants)) {
        throw new Error(`${sourceId} has an invalid variant group`);
      }
      if (variantAssets(group).some(asset => !resident.has(asset))) {
        throw new Error(`${sourceId} variant assets must also be resident`);
      }
    }
    for (const group of source.surfaceGroups || []) {
      if (
        !VALID_VARIANT_TYPES.has(group.type)
        || !Array.isArray(group.assets)
        || group.assets.length === 0
        || !Array.isArray(group.variants)
      ) {
        throw new Error(`${sourceId} has an invalid surface variant group`);
      }
      if (group.assets.some(asset => !resident.has(asset))) {
        throw new Error(`${sourceId} surface variants reference non-resident assets`);
      }
      const textureIds = variantAssets(group);
      if (textureIds.some(textureId => !/^[0-9a-f]{16}$/i.test(textureId))) {
        throw new Error(`${sourceId} surface variants have invalid texture IDs`);
      }
    }
  }
  for (const [sceneId, scene] of Object.entries(data.scenes)) {
    if (!data.families[scene.family] || !data.sources[scene.source]) {
      throw new Error(`${sceneId} references an unknown environment source`);
    }
    if (data.sources[scene.source].family !== scene.family) {
      throw new Error(`${sceneId} source is outside its environment family`);
    }
    for (const overlay of scene.overlays || []) {
      if (
        !/^S[1-3]_[A-Z0-9]{4}$/.test(overlay.prefix)
        || !Array.isArray(overlay.assets)
      ) {
        throw new Error(`${sceneId} has an invalid overlay`);
      }
    }
  }
  for (const [profileId, profile] of Object.entries(
    data.variantProfiles || {},
  )) {
    if (data.sources[profileId]) {
      throw new Error(`${profileId} duplicates a scene composition source`);
    }
    for (const group of profile.groups || []) {
      if (
        !VALID_VARIANT_TYPES.has(group.type)
        || !Array.isArray(group.variants)
      ) {
        throw new Error(`${profileId} has an invalid variant group`);
      }
    }
  }
  return data;
}

export const SCENE_COMPOSITIONS = deepFreeze(
  validateCompositionData(compositionData),
);

function entries(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function seasonIndex(context) {
  if (context?.seasonIndex === 0 || context?.seasonIndex === 1) {
    return context.seasonIndex;
  }
  return String(context?.season || "").toLowerCase() === "winter" ? 1 : 0;
}

function weatherIndex(context) {
  if (Number.isInteger(context?.weatherIndex)) return context.weatherIndex;
  return ["clear", "overcast", "rain", "snow"].indexOf(
    String(context?.weather || "clear").toLowerCase(),
  );
}

function timeIndex(context) {
  return Number.isInteger(context?.timeOfDayIndex) ? context.timeOfDayIndex : 0;
}

function activeVariantIndex(group, context) {
  if (group.type === "season") return seasonIndex(context);
  if (group.type === "weather") return Math.max(0, weatherIndex(context));
  return timeIndex(context);
}

function sourceFilename(source, asset) {
  return `${source.prefix}_${asset}.MT5`;
}

export function sceneCompositionSource(sourceId) {
  return SCENE_COMPOSITIONS.sources[String(sourceId || "").toUpperCase()] || null;
}

export function sceneCompositionSourceForPrefix(prefix) {
  const normalized = String(prefix || "").toUpperCase();
  return Object.entries(SCENE_COMPOSITIONS.sources).find(
    ([, source]) => source.prefix === normalized,
  )?.[0] || null;
}

export function variantProfileForZone(zone) {
  const normalized = String(zone || "").toUpperCase();
  const source = sceneCompositionSource(normalized);
  if (!source) {
    return SCENE_COMPOSITIONS.variantProfiles?.[normalized] || null;
  }
  return {
    label: source.label,
    ...(source.alwaysHide ? { alwaysHide: source.alwaysHide } : {}),
    groups: source.groups || [],
    surfaceGroups: source.surfaceGroups || [],
  };
}

export const SCENE_VARIANT_PROFILES = deepFreeze({
  ...Object.fromEntries(
    Object.keys(SCENE_COMPOSITIONS.sources).map(sourceId => [
      sourceId,
      variantProfileForZone(sourceId),
    ]),
  ),
  ...(SCENE_COMPOSITIONS.variantProfiles || {}),
});

export function residentSceneAsset(sourceId, filename) {
  const source = sceneCompositionSource(sourceId);
  if (!source) return false;
  const normalized = String(filename || "").toUpperCase();
  return source.residentAssets.some(
    asset => normalized === sourceFilename(source, asset),
  );
}

function resolvedSourceFilenames(source, context, includeInactiveVariants) {
  const assets = new Set(
    includeInactiveVariants ? source.residentAssets : source.baseAssets,
  );
  if (!includeInactiveVariants) {
    for (const group of source.groups || []) {
      const entry = group.variants[activeVariantIndex(group, context)];
      entries(entry).forEach(asset => assets.add(asset));
    }
  }
  for (const hidden of source.alwaysHide || []) assets.delete(hidden);
  return [...assets].map(asset => sourceFilename(source, asset));
}

function mergedContext(scene, context) {
  return {
    ...(context || {}),
    ...(scene?.context || {}),
  };
}

export function resolveSceneComposition(
  compositionId,
  context = {},
  { includeInactiveVariants = true } = {},
) {
  const normalized = String(compositionId || "");
  const scene = SCENE_COMPOSITIONS.scenes[normalized] || null;
  const sourceId = scene?.source || normalized.toUpperCase();
  const source = sceneCompositionSource(sourceId);
  if (!source) return null;
  const resolvedContext = mergedContext(scene, context);
  const filenames = new Set(resolvedSourceFilenames(
    source,
    resolvedContext,
    scene ? false : includeInactiveVariants,
  ));
  for (const overlay of scene?.overlays || []) {
    for (const asset of overlay.assets) {
      filenames.add(`${overlay.prefix}_${asset}.MT5`);
    }
  }
  return Object.freeze({
    id: scene ? normalized : sourceId,
    label: scene?.label || source.label,
    family: scene?.family || source.family,
    source: sourceId,
    prefix: source.prefix,
    context: Object.freeze(resolvedContext),
    filenames,
    variantProfile: SCENE_VARIANT_PROFILES[sourceId],
    provenance: scene?.provenance || source.provenance || null,
  });
}

export function sceneCompositionIncludes(
  compositionId,
  filename,
  context = {},
  options = {},
) {
  return resolveSceneComposition(compositionId, context, options)
    ?.filenames.has(String(filename || "").toUpperCase()) === true;
}

export function timedMapLayersForSource(sourceId) {
  const source = sceneCompositionSource(sourceId);
  if (!source) return null;
  const pairs = (source.groups || []).filter(group => group.type === "time")
    .flatMap((group) => {
      const day = entries(group.variants[0]);
      const evening = entries(group.variants[2] ?? group.variants[1]);
      if (day.length !== 1 || evening.length !== 1) return [];
      const dayIndex = Number.parseInt(day[0].replace(/^MAP_?/, ""), 10);
      const eveningIndex = Number.parseInt(evening[0].replace(/^MAP_?/, ""), 10);
      return Number.isInteger(dayIndex) && Number.isInteger(eveningIndex)
        ? [[dayIndex, eveningIndex]]
        : [];
    });
  if (pairs.length === 0) return null;
  return Object.freeze({
    modelPrefix: source.prefix,
    dayEveningPairs: Object.freeze(
      pairs.map(pair => Object.freeze(pair)),
    ),
  });
}
