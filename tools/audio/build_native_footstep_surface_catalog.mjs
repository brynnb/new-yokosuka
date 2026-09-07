#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNativeFootstepSurfaces,
} from "../lib/native-footstep-surfaces.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceDefinitions = [
  {
    disc: 1,
    scene: "01",
    candidates: [
      process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_files"),
    ],
  },
  {
    disc: 2,
    scene: "02",
    candidates: [
      process.env.SHENMUE_DISC2_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_disc2_v2"),
    ],
  },
  {
    disc: 3,
    scene: "03",
    candidates: [
      process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_disc3_v2"),
    ],
  },
];
const sources = sourceDefinitions.map(({ disc, scene, candidates }) => {
  const root = candidates.filter(Boolean).find(existsSync);
  if (!root) {
    throw new Error(
      `Disc ${disc} extraction not found. Tried: ${
        candidates.filter(Boolean).join(", ")
      }`,
    );
  }
  return { disc, scene, root };
});
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "play/data/native-footstep-surfaces.json");

function compactGrid(grid) {
  const [
    minimumX,
    maximumX,
    minimumZ,
    maximumZ,
    spanX,
    spanZ,
    cellWidth,
    cellHeight,
    scale,
  ] = grid.headerValues;
  return {
    sectionSource: {
      sectionFileOffset: grid.sectionOffset,
      sectionByteLength: grid.sectionByteLength,
      gridFileOffset: grid.gridOffset,
    },
    grid: {
      width: grid.width,
      height: grid.height,
      minimumX,
      maximumX,
      minimumZ,
      maximumZ,
      spanX,
      spanZ,
      cellWidth,
      cellHeight,
      scale,
      cells: grid.cells,
    },
    records: grid.records.map((record) => ({
      recordOffset: record.recordOffset,
      code: record.code,
      surfaceIndex: record.surfaceIndex,
      priority: record.priority,
      flags: record.flags,
      suppressed: record.suppressed,
      shapeType: record.shapeType,
      geometry: record.geometry,
    })),
  };
}

const candidatesByArea = new Map();
for (const { disc, scene, root } of sources) {
  const sceneRoot = path.join(root, "data", "SCENE", scene);
  for (const entry of readdirSync(sceneRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const area = entry.name.toUpperCase();
    const absolute = path.join(sceneRoot, entry.name, "MAPINFO.BIN");
    if (!existsSync(absolute)) continue;
    const parsed = parseNativeFootstepSurfaces(readFileSync(absolute));
    for (const grid of parsed.grids) {
      const candidate = {
        disc,
        scene,
        area,
        sourcePath: `data/SCENE/${scene}/${entry.name}/MAPINFO.BIN`,
        mapinfoSha256: parsed.sha256,
        mapinfoByteLength: parsed.byteLength,
        grid,
      };
      if (!candidatesByArea.has(area)) candidatesByArea.set(area, []);
      candidatesByArea.get(area).push(candidate);
    }
  }
}

const areas = {};
for (const [area, candidates] of [...candidatesByArea].sort()) {
  // The main free-roam collision context is the largest authored spatial
  // grid for an area. Disc order breaks ties because shared maps are copied
  // byte-for-byte to later discs.
  candidates.sort((left, right) => (
    right.grid.cellCount - left.grid.cellCount
    || right.grid.records.length - left.grid.records.length
    || left.disc - right.disc
    || left.grid.gridOffset - right.grid.gridOffset
  ));
  const selected = candidates[0];
  const compact = compactGrid(selected.grid);
  areas[area] = {
    source: {
      disc: selected.disc,
      path: selected.sourcePath,
      mapinfoSha256: selected.mapinfoSha256,
      mapinfoByteLength: selected.mapinfoByteLength,
      duplicateCandidateCount: candidates.length - 1,
      ...compact.sectionSource,
    },
    grid: compact.grid,
    records: compact.records,
  };
}

const catalog = {
  schema: "new-yokosuka-native-footstep-surfaces-v1",
  generatedFrom: {
    executable: {
      path: "data/1ST_READ.BIN",
      sha256: "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c",
      resolver: "FUN_0c17bb14",
      collisionQuery: "FUN_0c0b3986",
      shapeDispatcher: "FUN_0c08dd84",
      surfaceCode: {
        priority: "floor(low16 / 100)",
        surfaceIndex: "low16 % 100",
      },
      suppressedSurfaceIndices: [15, 19, 20],
      browserToCollisionPoint: ["-browserX", "-browserZ"],
    },
    format: {
      recordSectionSignature: "SOND",
      spatialGridSignature: "sond",
      emptyCellOffset: -4,
      listTerminator: 0xffffffff,
    },
  },
  areaCount: Object.keys(areas).length,
  areas,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(
  `Wrote ${catalog.areaCount} native footstep surface areas to ${outputPath}`,
);
