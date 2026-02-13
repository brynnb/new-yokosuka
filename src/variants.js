import state from "./state.js";
import { ZONE_VARIANTS, seasonPresets } from "./constants.js";

// Update visibility based on zone variant groups (seasonal + time-of-day).
// Zones like BETD have seasonal variants (summer/winter ground & foliage).
// Zones like D000 have time-of-day variants (day/night building textures).
// This function hides/shows the appropriate variant based on the active toggles.
export function updateModelVisibility() {
  if (!state.scene) return;

  // Start by showing everything
  state.currentMeshes.forEach((mesh) => mesh.setEnabled(true));

  const zoneData = state.currentZone ? ZONE_VARIANTS[state.currentZone] : null;
  const seasonBtn = document.getElementById("season-btn");

  // In single model mode, skip all variant filtering so individual files
  // can be inspected without being hidden by the variant system.
  if (state.singleModelMode) {
    if (seasonBtn) seasonBtn.classList.add("hidden");
    return;
  }

  // Check if this zone has any season-type groups
  const hasSeasonGroups = zoneData && zoneData.groups.some((g) => g.type === "season");

  if (hasSeasonGroups) {
    if (seasonBtn) seasonBtn.classList.remove("hidden");
    const seasonPreset = seasonPresets[state.currentSeason];
    if (seasonBtn) seasonBtn.innerText = `Season: ${seasonPreset.name}`;
  } else {
    if (seasonBtn) seasonBtn.classList.add("hidden");
  }

  if (!zoneData) return;

  // Hide files that always conflict (e.g. base building shells replaced by time variants)
  if (zoneData.alwaysHide) {
    for (const suffix of zoneData.alwaysHide) {
      state.currentMeshes.forEach((mesh) => {
        const fname = (mesh._filename || "").toUpperCase();
        if (fname.includes(`_${suffix}.`) || fname.includes(`_${suffix}_`)) {
          mesh.setEnabled(false);
        }
      });
    }
  }

  for (const group of zoneData.groups) {
    let activeIndex;

    if (group.type === "season") {
      const seasonPreset = seasonPresets[state.currentSeason];
      // "Show All" mode (-1) = skip this group, show everything
      if (seasonPreset.index === -1) continue;
      activeIndex = seasonPreset.index;
    } else if (group.type === "time") {
      activeIndex = state.currentTimeOfDay;
    } else {
      continue;
    }

    // Collect active suffixes so we don't accidentally hide a file that
    // appears at both the active index and an inactive index.
    const activeEntry = group.variants[activeIndex];
    const activeSet = new Set();
    if (activeEntry) {
      const s = Array.isArray(activeEntry) ? activeEntry : [activeEntry];
      s.forEach((x) => activeSet.add(x));
    }

    // Hide all variants except the active one
    for (let vi = 0; vi < group.variants.length; vi++) {
      if (vi === activeIndex) continue;
      const entry = group.variants[vi];
      if (!entry) continue; // null entries = no file for this index

      // Entry can be a single suffix string or an array of suffixes
      const suffixes = Array.isArray(entry) ? entry : [entry];
      for (const suffix of suffixes) {
        if (activeSet.has(suffix)) continue; // Don't hide if also active
        state.currentMeshes.forEach((mesh) => {
          const fname = (mesh._filename || "").toUpperCase();
          if (fname.includes(`_${suffix}.`) || fname.includes(`_${suffix}_`)) {
            mesh.setEnabled(false);
          }
        });
      }
    }
  }
}

// Build the set of suffixes to skip at load time based on variant config
export function buildHiddenSuffixes() {
  const hiddenSuffixes = new Set();
  const activeSuffixes = new Set();
  const zoneData = state.currentZone ? ZONE_VARIANTS[state.currentZone] : null;

  if (zoneData) {
    if (zoneData.alwaysHide) {
      zoneData.alwaysHide.forEach((s) => hiddenSuffixes.add(s));
    }
    for (const group of zoneData.groups) {
      let activeIndex;
      if (group.type === "season") {
        const sp = seasonPresets[state.currentSeason];
        if (sp.index === -1) continue; // "Show All" = load everything
        activeIndex = sp.index;
      } else if (group.type === "time") {
        activeIndex = state.currentTimeOfDay;
      } else {
        continue;
      }
      // Collect active suffixes first (a suffix used at the active index must not be hidden)
      const activeEntry = group.variants[activeIndex];
      if (activeEntry) {
        const s = Array.isArray(activeEntry) ? activeEntry : [activeEntry];
        s.forEach((x) => activeSuffixes.add(x));
      }
      for (let vi = 0; vi < group.variants.length; vi++) {
        if (vi === activeIndex) continue;
        const entry = group.variants[vi];
        if (!entry) continue;
        const suffixes = Array.isArray(entry) ? entry : [entry];
        suffixes.forEach((s) => hiddenSuffixes.add(s));
      }
    }
    // Don't hide suffixes that are also active (same file used at multiple indices)
    activeSuffixes.forEach((s) => hiddenSuffixes.delete(s));
  }

  return hiddenSuffixes;
}
