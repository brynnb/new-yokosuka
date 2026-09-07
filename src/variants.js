import state from "./state.js";
import {
  seasonPresets,
  weatherPresets,
} from "./constants.js";
import { variantProfileForZone } from "./SceneCompositions.js";

function zoneVariantProfile(sceneState = state) {
  return sceneState.currentVariantProfile
    || (sceneState.currentZone ? variantProfileForZone(sceneState.currentZone) : null);
}

function variantIndex(group, sceneState = state) {
  if (group.type === "season") {
    return seasonPresets[sceneState.currentSeason]?.index ?? 0;
  }
  if (group.type === "time") return sceneState.currentTimeOfDay;
  if (group.type === "weather") {
    return weatherPresets[sceneState.currentWeatherIndex]?.index ?? 0;
  }
  return null;
}

function entrySuffixes(entry) {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

function matchesSuffix(filename, suffix) {
  return filename.includes(`_${suffix}.`) || filename.includes(`_${suffix}_`);
}

function rootFilename(node) {
  let current = node;
  while (current) {
    if (current._filename) return String(current._filename).toUpperCase();
    current = current.parent || null;
  }
  return "";
}

// Update visibility based on zone variant groups (seasonal + time-of-day).
// Zones like BETD have seasonal variants (summer/winter ground & foliage).
// Zones like D000 have time-of-day variants (day/night building textures).
// This function hides/shows the appropriate variant based on the active toggles.
export function updateModelVisibility(sceneState = state) {
  if (!sceneState.scene) return;

  const zoneData = zoneVariantProfile(sceneState);
  const seasonBtn = globalThis.document?.getElementById("season-btn");

  // In single model mode, skip all variant filtering so individual files
  // can be inspected without being hidden by the variant system.
  if (sceneState.singleModelMode) {
    if (seasonBtn) seasonBtn.classList.add("hidden");
    return;
  }

  // Check if this zone has any season-type groups
  const hasSeasonGroups = zoneData && zoneData.groups.some((g) => g.type === "season");

  if (hasSeasonGroups) {
    if (seasonBtn) seasonBtn.classList.remove("hidden");
    const seasonPreset = seasonPresets[sceneState.currentSeason];
    if (seasonBtn) seasonBtn.innerText = `Season: ${seasonPreset.name}`;
  } else {
    if (seasonBtn) seasonBtn.classList.add("hidden");
  }

  if (!zoneData) return;

  // Hide files that always conflict (e.g. base building shells replaced by time variants)
  if (zoneData.alwaysHide) {
    for (const suffix of zoneData.alwaysHide) {
      sceneState.currentMeshes.forEach((mesh) => {
        const fname = (mesh._filename || "").toUpperCase();
        if (fname.includes(`_${suffix}.`) || fname.includes(`_${suffix}_`)) {
          mesh.setEnabled(false);
        }
      });
    }
  }

  for (const group of zoneData.groups) {
    const activeIndex = variantIndex(group, sceneState);
    if (activeIndex === null) continue;

    // Collect active suffixes so we don't accidentally hide a file that
    // appears at both the active index and an inactive index.
    const activeEntry = group.variants[activeIndex];
    const activeSet = new Set();
    entrySuffixes(activeEntry).forEach(value => activeSet.add(value));
    const controlledSet = new Set(group.variants.flatMap(entrySuffixes));

    // Only touch roots owned by this variant group. Other visibility owners
    // (native room state, cutscene state, and cutaways) remain intact.
    for (const mesh of sceneState.currentMeshes) {
      const filename = (mesh._filename || "").toUpperCase();
      const controlled = [...controlledSet].some(
        suffix => matchesSuffix(filename, suffix),
      );
      if (!controlled) continue;
      mesh.setEnabled(
        [...activeSet].some(suffix => matchesSuffix(filename, suffix)),
      );
    }
  }

  // A few native maps combine their common geometry and seasonal surface
  // overlays in one MT5 root. Those cannot be selected by filename, so the
  // composition identifies the exact native texture IDs that own the faces.
  for (const group of zoneData.surfaceGroups || []) {
    const activeIndex = variantIndex(group, sceneState);
    if (activeIndex === null) continue;
    const activeSet = new Set(entrySuffixes(group.variants[activeIndex]));
    const controlledSet = new Set(group.variants.flatMap(entrySuffixes));
    const assetSet = new Set(group.assets.map(asset => String(asset).toUpperCase()));
    for (const root of sceneState.currentMeshes) {
      const filename = rootFilename(root);
      const ownsAsset = [...assetSet].some(
        asset => matchesSuffix(filename, asset),
      );
      if (!ownsAsset) continue;
      for (const node of [root, ...root.getDescendants(false)]) {
        const textureId = String(node.metadata?.mt5TextureId || "").toLowerCase();
        if (!controlledSet.has(textureId)) continue;
        node.setEnabled(activeSet.has(textureId));
      }
    }
  }
}

// Build the set of suffixes to skip at load time based on variant config
export function buildHiddenSuffixes(sceneState = state) {
  const hiddenSuffixes = new Set();
  const activeSuffixes = new Set();
  const zoneData = zoneVariantProfile(sceneState);

  if (zoneData) {
    if (zoneData.alwaysHide) {
      zoneData.alwaysHide.forEach((s) => hiddenSuffixes.add(s));
    }
    for (const group of zoneData.groups) {
      const activeIndex = variantIndex(group, sceneState);
      if (activeIndex === null) continue;
      // Collect active suffixes first (a suffix used at the active index must not be hidden)
      const activeEntry = group.variants[activeIndex];
      if (activeEntry) {
        entrySuffixes(activeEntry).forEach(value => activeSuffixes.add(value));
      }
      for (let vi = 0; vi < group.variants.length; vi++) {
        if (vi === activeIndex) continue;
        const entry = group.variants[vi];
        if (!entry) continue;
        entrySuffixes(entry).forEach(value => hiddenSuffixes.add(value));
      }
    }
    // Don't hide suffixes that are also active (same file used at multiple indices)
    activeSuffixes.forEach((s) => hiddenSuffixes.delete(s));
  }

  return hiddenSuffixes;
}
