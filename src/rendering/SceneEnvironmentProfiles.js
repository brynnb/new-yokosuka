import { ZONE_VARIANTS } from "../constants.js";
import { timedMapLayersForSource } from "../SceneCompositions.js";
import nativeLights from "../../play/data/shenmue1-native-lights.json" with { type: "json" };

// Existing /play exclusions: these rooms use their authored emissive/arcade
// lighting rather than the generic point-light pass.
export function nativeLightingArea(area) {
  return !["DGCT", "DSUS"].includes(area) && nativeLights.areas[area] ? area : undefined;
}

// Existing harbor water plane policy, shared by both consumers.
export function sceneWaterHeight(area) {
  return ["MFSY", "MKSG", "MFBT", "MA00"].includes(area) ? -2 : undefined;
}

export function sceneEnvironmentProfile({area, prefix, game, interior = false}) {
  return {
    nativeArea: game === "shenmue2" ? undefined : area,
    nativePointLightingArea: game === "shenmue2" ? undefined : nativeLightingArea(area),
    waterHeight: game === "shenmue2" ? undefined : sceneWaterHeight(area),
    interior,
    timedMapLayers: game === "shenmue2"
      ? shenmue2TimedMapLayers(area, prefix)
      : timedMapLayersForSource(area),
  };
}

function timedMapLayers(
  modelPrefix,
  pairs = [],
  nightOnlyLayers = [],
) {
  return Object.freeze({
    modelPrefix,
    dayEveningPairs: Object.freeze(
      pairs.map((pair) => Object.freeze([...pair])),
    ),
    nightOnlyLayers: Object.freeze([...nightOnlyLayers]),
  });
}

function mapLayerNumber(stem) {
  const match = String(stem || "").match(/^MAP(\d{2})$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function shenmue2TimedMapLayers(area, modelPrefix) {
  const pairs = [];
  const nightOnlyLayers = [];
  for (const group of ZONE_VARIANTS[area]?.groups || []) {
    if (group.type !== "time") continue;
    const dayLayer = mapLayerNumber(group.variants?.[0]);
    const eveningLayer = mapLayerNumber(group.variants?.[2]);
    if (dayLayer !== null && eveningLayer !== null) {
      if (dayLayer !== eveningLayer) pairs.push([dayLayer, eveningLayer]);
    } else if (eveningLayer !== null) {
      nightOnlyLayers.push(eveningLayer);
    }
  }
  if (pairs.length === 0 && nightOnlyLayers.length === 0) return undefined;
  return timedMapLayers(modelPrefix, pairs, nightOnlyLayers);
}
