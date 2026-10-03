import {resolveSceneComposition, variantProfileForZone} from "../../src/SceneCompositions.js";
import {isWorldMapFile} from "../../src/WorldMapFiles.js";
import {preparedPlacementModels} from "../../tools/assets/scenery-placement-policy.js";
import {introductionSceneryOwnership} from "../cutscenes/IntroductionEnvironments.js";
import {WORLDS} from "../config/worlds.js";
import {shenmue2WorldSceneRecords} from "./Shenmue2SceneRecords.js";
import {mt7MapEffectDefinition} from "../../src/Mt7MapEffects.js";
import mt7OverlayManifest from '../data/mt7-overlay-manifest.json' with {type: 'json'};
import {YOU_ARCADE_BACKLIT_SIGNS, YOU_ARCADE_HIDDEN_SCREEN_FACES,
  YOU_ARCADE_POSTERS} from "../config/arcadeFixtures.js";

// Reviewed MT5 worlds. Intro stages retain generated cinematic ownership;
// Interior props remain under their existing owners. MT7 selection is shared
// with the original loader, including each disc's distinct scene prefixes.
export const PREPARED_SCENERY_WORLDS = Object.freeze([
  "dobuita", "exterior", "yamanose", "sakuragaoka", "mfsy", "mksg",
  "ms08", "mfbt", "ma00", "ma00race", "op00", "op02", "interior", "arcade",
  ...Object.values(WORLDS).filter(world => world.assetFormat === "MT7").map(world => world.id),
]);

export function preparedSceneryKey(world) {
  if (!PREPARED_SCENERY_WORLDS.includes(world?.id)) return null;
  // The playground uses exactly the harbor scenery/placements. Verify their
  // contracts agree; do not duplicate a large bundle just for another spawn.
  return world.id === "ma00" ? "mfsy" : world.id;
}

export function preparedScenerySpec(world, allFiles) {
  const key = preparedSceneryKey(world);
  if (key && world.assetFormat === "MT7") {
    const records = shenmue2WorldSceneRecords(allFiles, world).sort((a, b) => a.filename.localeCompare(b.filename));
    if (!records.some(record => record.kind === "MAPM")) throw new Error(`Missing prepared scene records: ${world.id}`);
    const filenames = records.map(record => record.filename);
    // PROP contains the original door pivots and picking subtrees. Decode it
    // offline, but do not flatten it into a street or lose its node offsets.
    const ownership = {hierarchyFilenames: records.filter(record => record.kind === "PROP").map(record => record.filename)};
    const effects = records.filter(record => record.kind === "MAPM")
      .map(record => [record.filename, mt7MapEffectDefinition(record.filename, {})]).filter(([, effect]) => effect);
    const zone = world.assetArea || world.nativeArea;
    return {key, zone, records, filenames, variantProfile: null, models: [], ownership, policyFiles: [],
      contract: {format: "mt7", zone, records: records.map(({filename, kind, sourceMember, texturePack}) =>
        ({filename, kind, sourceMember, texturePack})), filenames, ownership, effects,
      depthOverlays: records.map(({filename}) => [filename, mt7OverlayManifest.files[filename]?.revision || null]),
      collisionArea: world.collisionArea || world.nativeArea, collisionDisc: world.collisionDisc,
      timedMapLayers: world.timedMapLayers, placements: world.placements}};
  }
  const introduction = key === "op00" || key === "op02";
  if (!key || world.assetFormat || (!introduction && (world.cutsceneOnly
    || world.loadInactiveEnvironmentVariants === false))) throw new Error(`Unsupported prepared world: ${world.id}`);
  const composition = world.sceneComposition
    ? resolveSceneComposition(world.sceneComposition, {}, {includeInactiveVariants: true}) : null;
  const zone = composition?.source || world.prefix.split("_")[1];
  const filenames = composition ? [...composition.filenames].sort() : allFiles.filter(file => (
    file.startsWith(`${world.prefix}_`) && world.includeFile?.(file)
  )).sort();
  if (!filenames.length || (!introduction && filenames.some(file => !isWorldMapFile(file)))) {
    throw new Error(`Prepared world needs reviewed map resources: ${world.id}`);
  }
  for (const file of filenames) if (!allFiles.includes(file)) throw new Error(`Missing prepared source: ${file}`);
  const variantProfile = composition?.variantProfile || world.variantProfile || variantProfileForZone(zone);
  const fixtures = key === "arcade" ? {signs: YOU_ARCADE_BACKLIT_SIGNS,
    hiddenFaces: YOU_ARCADE_HIDDEN_SCREEN_FACES, posters: YOU_ARCADE_POSTERS} : null;
  const ownership = introduction ? introductionSceneryOwnership(key, filenames) : fixtures ? {
    // The jukebox selector walks native nodes; preserve that map's hierarchy.
    // Other fixture owners select mesh names and face IDs. Keep only their
    // source surfaces separate, allowing the surrounding map to batch normally.
    hierarchyFilenames: ["S3_DGCT_MAP01.MT5"],
    surfaceSelectors: [...new Map(Object.values(fixtures).flat().map(({sourceFilename, meshName}) =>
      [`${sourceFilename}:${meshName}`, {sourceFilename, meshName}])).values()],
    fixtures,
  } : null;
  if (!ownership && variantProfile?.surfaceGroups?.length) throw new Error(`Unreviewed per-surface variants: ${world.id}`);
  const models = preparedPlacementModels(world.placements);
  return {key, zone, filenames, variantProfile, models, ownership, context: composition?.context,
    policyFiles: key === "dobuita" ? ["play/data/d000-runtime-placements.json",
      "play/data/shenmue1-scheduled-scene-objects.json", "tools/evidence/d000-static-fixtures.json"] : [],
    contract: {prefix: world.prefix, zone, filenames, variantProfile,
      collisionArea: world.collisionArea || world.nativeArea, models, placements: world.placements,
      ...(ownership ? {ownership, ...(composition ? {context: composition.context} : {})} : {})},
  };
}
