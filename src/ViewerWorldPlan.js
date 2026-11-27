// The reviewed gameplay registry is the authoritative source of area layouts.
// Never infer world-space placement from an archive member's local origin.
import { WORLDS } from "../play/config/worlds.js";
import { resolveSceneComposition, sceneCompositionSourceForPrefix } from "./SceneCompositions.js";
import { isWorldMapFile } from "./WorldMapFiles.js";
import { shenmue2WorldSceneRecords } from "../play/world/Shenmue2SceneRecords.js";

const mt5Worlds = Object.values(WORLDS).filter(world => !world.assetFormat && world.prefix);
const byPrefix = new Map();
for (const world of mt5Worlds) if (!byPrefix.has(world.prefix)) byPrefix.set(world.prefix, world);
// Distinguish alternate story staging from the ordinary areas that share its archive.
byPrefix.set("S3_NBIK", WORLDS.nbik);

export function viewerWorldForPrefix(prefix) {
  return byPrefix.get(prefix) || null;
}

export function viewerInteriorPrefix(area, availablePrefixes) {
  const preferred = area === "DGCT" ? WORLDS.arcade
    : mt5Worlds.find(world => world.nativeArea === area && world.interior && !world.cutsceneOnly);
  return preferred && availablePrefixes.has(preferred.prefix) ? preferred.prefix : null;
}

export function viewerMt5ScenePlan(prefix, catalog, context, {composition, filenames, includeFile} = {}) {
  const world = viewerWorldForPrefix(prefix);
  const compositionId = composition || world?.sceneComposition || sceneCompositionSourceForPrefix(prefix);
  const resolved = compositionId && resolveSceneComposition(compositionId, context, {includeInactiveVariants: false});
  const mapFiles = catalog.filter(file => file.startsWith(prefix + "_") && isWorldMapFile(file));
  // Unknown layouts remain inspectable as individual assets. Assemble just the
  // authored map layers if present; never guess coordinates for loose props.
  const filter = resolved ? null : world?.includeFile || includeFile ||
    (mapFiles.length ? file => isWorldMapFile(file) : undefined);
  return {
    world, placements: world?.placements || [],
    filenames: resolved?.filenames || filenames,
    includeFile: filter,
    variantProfile: resolved?.variantProfile || world?.variantProfile,
    variantZone: resolved?.source,
    composition: compositionId || null,
  };
}

// For full Shenmue II area views, match the same disc/scene archive identity
// used by gameplay. MAPM and PROP already carry native world transforms.
export function viewerMt7AreaRecords(records, catalog) {
  if (!records.some(row => row.kind === "MAPM")) return records;
  const names = new Set(records.map(row => row.filename));
  const exactWorld = Object.values(WORLDS).find(world => world.assetFormat === "MT7"
    && (world.scenePrefixes || [world.prefix]).some(prefix =>
      records.some(row => row.kind === "MAPM" && row.filename.startsWith(prefix + "_"))));
  if (exactWorld) {
    const selected = shenmue2WorldSceneRecords({models: catalog}, exactWorld);
    // Only substitute a known complete gameplay scene when it contains the
    // requested map; explicit alternate disc scenes keep their own identities.
    if (selected.some(row => row.kind === "MAPM" && names.has(row.filename))) return selected;
  }
  // A separately selected archive may be an event variant. Its MAPM and
  // PROP nodes have authored transforms even when their member names differ.
  return records.filter(row => row.kind === "MAPM" || row.kind === "PROP");
}
