import assert from "node:assert/strict";
import test from "node:test";
import {
  includeDobuitaMapFile,
  includeHazukiExteriorMapFile,
  includeForkliftRaceMapFile,
  includeNewYokosukaHarborMapFile,
  includeOldWarehouseEightMapFile,
  includeOldWarehouseDistrictMapFile,
  includeSakuragaokaMapFile,
  includeSeventyManBattleMapFile,
  includeYamanoseMapFile,
  isHarborCollisionFile,
  isHarborTerrainFile,
  isSakuragaokaCollisionFile,
  isSakuragaokaTerrainFile,
  isWorldMapFile,
} from "../src/WorldMapFiles.js";

test("recognizes environment MAP resources as floor-support candidates", () => {
  assert.equal(isWorldMapFile("S1_D000_MAP04.MT5"), true);
  assert.equal(isWorldMapFile("S3_MA00_MAP_15.MT5"), true);
  assert.equal(isWorldMapFile("S3_MA00_MAP_RACE.MT5"), true);
  assert.equal(isWorldMapFile("S1_D000_DR01_001.MT5"), false);
});

test("excludes unidentified Dobuita holiday decoration layers from play", () => {
  assert.equal(includeDobuitaMapFile("S1_D000_MAP.MT5"), true);
  assert.equal(includeDobuitaMapFile("S1_D000_MAP06.MT5"), true);
  assert.equal(includeDobuitaMapFile("S1_D000_MAP07.MT5"), true);
  assert.equal(includeDobuitaMapFile("S1_D000_MAP24.MT5"), true);
  assert.equal(includeDobuitaMapFile("S1_D000_MAP25.MT5"), false);
  assert.equal(includeDobuitaMapFile("S1_D000_MAP26.MT5"), false);
  assert.equal(includeDobuitaMapFile("S1_JD00_MAP25.MT5"), false);
});

test("loads the complete JHD0 summer map without seasonal ground overlays", () => {
  assert.equal(includeHazukiExteriorMapFile("S1_JHD0_MAP.MT5"), true);
  assert.equal(includeHazukiExteriorMapFile("S1_JHD0_MAP01.MT5"), true);
  assert.equal(includeHazukiExteriorMapFile("S1_JHD0_MAP03.MT5"), false);
  assert.equal(includeHazukiExteriorMapFile("S1_JHD0_MAP04.MT5"), false);
  assert.equal(includeHazukiExteriorMapFile("S1_JHD0_MAP08.MT5"), true);
  assert.equal(includeHazukiExteriorMapFile("S1_BETD_MAP01.MT5"), false);
});

test("loads Yamanose clock and both seasonal scenery layers", () => {
  for (const suffix of [
    "", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11",
  ]) {
    assert.equal(includeYamanoseMapFile(`S1_JU00_MAP${suffix}.MT5`), true);
  }
  for (const suffix of ["12", "13"]) {
    assert.equal(includeYamanoseMapFile(`S1_JU00_MAP${suffix}.MT5`), false);
  }
  assert.equal(includeYamanoseMapFile("S1_JHD0_MAP.MT5"), false);
});

test("loads Sakuragaoka clock, seasonal, and weather layers", () => {
  for (const suffix of [
    "", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
  ]) {
    assert.equal(includeSakuragaokaMapFile(`S1_JD00_MAP${suffix}.MT5`), true);
  }
  for (const suffix of ["13"]) {
    assert.equal(includeSakuragaokaMapFile(`S1_JD00_MAP${suffix}.MT5`), false);
  }
  assert.equal(includeSakuragaokaMapFile("S1_JU00_MAP.MT5"), false);
});

test("separates Sakuragaoka walkable surfaces from visual scenery", () => {
  assert.equal(isSakuragaokaTerrainFile("S1_JD00_MAP01.MT5"), true);
  assert.equal(isSakuragaokaTerrainFile("S1_JD00_MAP08.MT5"), true);
  assert.equal(isSakuragaokaTerrainFile("S1_JD00_MAP.MT5"), false);

  assert.equal(isSakuragaokaCollisionFile("S1_JD00_MAP01.MT5"), true);
  assert.equal(isSakuragaokaCollisionFile("S1_JD00_MAP08.MT5"), false);
  assert.equal(isSakuragaokaCollisionFile("S1_JD00_MAP.MT5"), false);
});

test("loads both harbor clock layers and excludes MAP16 duplicates", () => {
  for (const suffix of [
    "", "01", "02", "03", "04", "05", "06", "07", "08", "10", "11",
    "12", "13", "14", "17", "18",
  ]) {
    assert.equal(
      includeNewYokosukaHarborMapFile(`S2_MFSY_MAP${suffix}.MT5`),
      true,
    );
  }
  for (const suffix of ["09", "15", "16"]) {
    assert.equal(
      includeNewYokosukaHarborMapFile(`S2_MFSY_MAP${suffix}.MT5`),
      false,
    );
  }
});

test("loads the captured MA00 race resources and shared course ground", () => {
  for (const suffix of [
    "00", "02", "03", "05", "06", "07", "08", "11",
    "15", "16", "17", "18", "19", "20", "RACE",
  ]) {
    assert.equal(
      includeForkliftRaceMapFile(`S3_MA00_MAP_${suffix}.MT5`),
      true,
    );
  }
  for (const suffix of ["03I", "04", "09", "18I"]) {
    assert.equal(
      includeForkliftRaceMapFile(`S3_MA00_MAP_${suffix}.MT5`),
      false,
    );
  }
  assert.equal(isHarborTerrainFile("S3_MA00_MAP_02.MT5"), true);
  assert.equal(isHarborTerrainFile("S3_MA00_MAP_15.MT5"), true);
  assert.equal(isHarborCollisionFile("S3_MA00_MAP_RACE.MT5"), true);
});

test("loads only the four numbered 70-man battle arena maps", () => {
  for (const suffix of ["", "01", "02", "03"]) {
    assert.equal(
      includeSeventyManBattleMapFile(`S3_MFBT_MAP${suffix}.MT5`),
      true,
    );
  }
  assert.equal(
    includeSeventyManBattleMapFile("S3_MFBT_MAP_TLYE.MT5"),
    false,
  );
  assert.equal(
    includeSeventyManBattleMapFile("S3_MFBT_KIS_M.MT5"),
    false,
  );
});

test("loads every Old Warehouse District spatial and weather layer", () => {
  assert.equal(includeOldWarehouseDistrictMapFile("S2_MKSG_MAP.MT5"), true);
  for (let index = 1; index <= 8; index++) {
    assert.equal(
      includeOldWarehouseDistrictMapFile(
        `S2_MKSG_MAP${String(index).padStart(2, "0")}.MT5`,
      ),
      true,
    );
  }
  assert.equal(includeOldWarehouseDistrictMapFile("S2_MKSG_MAP09.MT5"), false);
  assert.equal(isHarborTerrainFile("S2_MFSY_MAP02.MT5"), true);
  assert.equal(isHarborTerrainFile("S2_MFSY_MAP04.MT5"), true);
  assert.equal(isHarborTerrainFile("S2_MKSG_MAP04.MT5"), false);
  assert.equal(isHarborTerrainFile("S2_MKSG_MAP05.MT5"), true);
  assert.equal(isHarborCollisionFile("S2_MFSY_MAP10.MT5"), true);
  assert.equal(isHarborCollisionFile("S2_MKSG_MAP08.MT5"), true);
});

test("Warehouse No. 8 loads only its five authored map pieces", () => {
  assert.equal(includeOldWarehouseEightMapFile("S2_MS08_MAP.MT5"), true);
  for (let index = 1; index <= 4; index++) {
    assert.equal(
      includeOldWarehouseEightMapFile(
        `S2_MS08_MAP${String(index).padStart(2, "0")}.MT5`,
      ),
      true,
    );
  }
  assert.equal(includeOldWarehouseEightMapFile("S2_MS08_MAP05.MT5"), false);
  assert.equal(isHarborTerrainFile("S2_MS08_MAP01.MT5"), true);
  assert.equal(isHarborCollisionFile("S2_MS08_MAP04.MT5"), true);
});
