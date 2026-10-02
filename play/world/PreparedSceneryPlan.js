import {resolveSceneComposition, variantProfileForZone} from "../../src/SceneCompositions.js";
import {isWorldMapFile} from "../../src/WorldMapFiles.js";
import {preparedPlacementModels} from "../../tools/assets/scenery-placement-policy.js";

// Reviewed MT5 exploration worlds. Interior machinery, cinematic hierarchies
// and MT7 effects need their own ownership audit before admitting their maps.
export const PREPARED_SCENERY_WORLDS = Object.freeze([
  "dobuita", "exterior", "yamanose", "sakuragaoka", "mfsy", "mksg",
  "ms08", "mfbt", "ma00", "ma00race",
]);

export function preparedSceneryKey(world) {
  if (!PREPARED_SCENERY_WORLDS.includes(world?.id)) return null;
  // The playground uses exactly the harbor scenery/placements. Verify their
  // contracts agree; do not duplicate a large bundle just for another spawn.
  return world.id === "ma00" ? "mfsy" : world.id;
}

export function preparedScenerySpec(world, allFiles) {
  const key = preparedSceneryKey(world);
  if (!key || world.assetFormat || world.interior || world.cutsceneOnly
    || world.loadInactiveEnvironmentVariants === false) throw new Error(`Unsupported prepared world: ${world.id}`);
  const composition = world.sceneComposition
    ? resolveSceneComposition(world.sceneComposition, {}, {includeInactiveVariants: true}) : null;
  const zone = composition?.source || world.prefix.split("_")[1];
  const filenames = composition ? [...composition.filenames].sort() : allFiles.filter(file => (
    file.startsWith(`${world.prefix}_`) && world.includeFile?.(file)
  )).sort();
  if (!filenames.length || filenames.some(file => !isWorldMapFile(file))) {
    throw new Error(`Prepared world needs reviewed map resources: ${world.id}`);
  }
  for (const file of filenames) if (!allFiles.includes(file)) throw new Error(`Missing prepared source: ${file}`);
  const variantProfile = composition?.variantProfile || world.variantProfile || variantProfileForZone(zone);
  if (variantProfile?.surfaceGroups?.length) throw new Error(`Unreviewed per-surface variants: ${world.id}`);
  const models = preparedPlacementModels(world.placements);
  return {key, zone, filenames, variantProfile, models,
    policyFiles: key === "dobuita" ? ["play/data/d000-runtime-placements.json",
      "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"] : [],
    contract: {prefix: world.prefix, zone, filenames, variantProfile,
      collisionArea: world.collisionArea || world.nativeArea, models, placements: world.placements},
  };
}
