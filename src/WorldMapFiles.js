import { residentSceneAsset } from "./SceneCompositions.js";

export function includeHazukiExteriorMapFile(filename) {
  return residentSceneAsset("JHD0", filename);
}

export function isWorldMapFile(filename) {
  // MAP resources are the authored environment, and any enabled layer may
  // contain upward-facing support geometry (curbs, sidewalks, stairs, docks,
  // and floors). Native COLI supplies horizontal boundaries, not floor
  // height, so restricting terrain raycasts to a small MAP whitelist creates
  // holes wherever a raised surface lives in another structural layer.
  return /^S[1-3]_[A-Z0-9]{4}_MAP(?:_?[A-Z0-9]+)?\.MT5$/i.test(filename);
}

export function includeDobuitaMapFile(filename) {
  return residentSceneAsset("D000", filename);
}

const SEVENTY_MAN_BATTLE_MAP_FILES = new Set([
  "S3_MFBT_MAP.MT5",
  "S3_MFBT_MAP01.MT5",
  "S3_MFBT_MAP02.MT5",
  "S3_MFBT_MAP03.MT5",
]);

export function includeSeventyManBattleMapFile(filename) {
  return SEVENTY_MAN_BATTLE_MAP_FILES.has(filename.toUpperCase());
}

export function includeYamanoseMapFile(filename) {
  return residentSceneAsset("JU00", filename);
}

export function includeSakuragaokaMapFile(filename) {
  return residentSceneAsset("JD00", filename);
}

export function isSakuragaokaTerrainFile(filename) {
  return [
    "S1_JD00_MAP01.MT5",
    "S1_JD00_MAP08.MT5",
  ].includes(filename.toUpperCase());
}

export function isSakuragaokaCollisionFile(filename) {
  // MAP01 is the structural road/collision layer. Treating every visual layer
  // as a solid collider traps the player inside MAP and MAP08 scenery even
  // though those meshes still need to remain pickable for terrain grounding.
  return filename.toUpperCase() === "S1_JD00_MAP01.MT5";
}

export function includeNewYokosukaHarborMapFile(filename) {
  return residentSceneAsset("MFSY", filename);
}

const FORKLIFT_RACE_ACTIVE_MAP_FILES = new Set([
  // Exact HRCM map resources resident at the start of the Disc 3 MA00 race.
  "S3_MA00_MAP_00.MT5",
  // The shared normal-weather course surface is not represented by the
  // runtime HRCM inventory, but supplies the road beneath the starting grid.
  // MAP04 has the same geometry as an alternate seasonal layer; loading both
  // would produce coplanar z-fighting.
  "S3_MA00_MAP_02.MT5",
  "S3_MA00_MAP_03.MT5",
  "S3_MA00_MAP_05.MT5",
  "S3_MA00_MAP_06.MT5",
  "S3_MA00_MAP_07.MT5",
  "S3_MA00_MAP_08.MT5",
  "S3_MA00_MAP_11.MT5",
  "S3_MA00_MAP_15.MT5",
  "S3_MA00_MAP_16.MT5",
  "S3_MA00_MAP_17.MT5",
  "S3_MA00_MAP_18.MT5",
  "S3_MA00_MAP_19.MT5",
  "S3_MA00_MAP_20.MT5",
  "S3_MA00_MAP_RACE.MT5",
]);

export function includeForkliftRaceMapFile(filename) {
  return FORKLIFT_RACE_ACTIVE_MAP_FILES.has(filename.toUpperCase());
}

export function includeOldWarehouseDistrictMapFile(filename) {
  return residentSceneAsset("MKSG", filename);
}

export function includeOldWarehouseEightMapFile(filename) {
  return /^S2_MS08_MAP(?:0[1-4])?\.MT5$/i.test(filename);
}

export function isHarborTerrainFile(filename) {
  return [
    "S2_MFSY_MAP02.MT5",
    "S2_MFSY_MAP04.MT5",
    "S2_MKSG_MAP05.MT5",
    "S2_MS08_MAP01.MT5",
    // MAP02 contains the MA00 road at each captured starting-grid position.
    "S3_MA00_MAP_02.MT5",
    // MAP15 contributes additional near-zero-height course surfaces.
    "S3_MA00_MAP_15.MT5",
  ].includes(filename.toUpperCase());
}

export function isHarborCollisionFile(filename) {
  return (
    /^S2_(?:MFSY|MKSG|MS08)_MAP(?:\d+)?\.MT5$/i.test(filename)
    || FORKLIFT_RACE_ACTIVE_MAP_FILES.has(filename.toUpperCase())
  );
}
