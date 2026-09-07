#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { extractMapinfoCharacterPlacements } from "../lib/mapinfo_character_placements.js";

function usage() {
  console.error(
    "Usage: node tools/worlds/extract_mapinfo_character_placements.js "
    + "<MAPINFO.BIN> [--prefix S1_BETD_] [--catalog public/models.json] "
    + "[--out placements.json]",
  );
}

const argv = process.argv.slice(2);
const input = argv.shift();
if (!input) {
  usage();
  process.exit(2);
}

let prefix = "";
let output = "";
let catalogPath = "public/models.json";
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--prefix") prefix = argv[++index];
  else if (argv[index] === "--catalog") catalogPath = argv[++index];
  else if (argv[index] === "--out") output = argv[++index];
  else {
    usage();
    process.exit(2);
  }
}

const inputPath = path.resolve(input);
const bytes = fs.readFileSync(inputPath);
const extracted = extractMapinfoCharacterPlacements(bytes);
const catalog = prefix
  ? new Set(JSON.parse(fs.readFileSync(path.resolve(catalogPath), "utf8")))
  : null;
const placements = extracted.map(
  (placement, index) => ({
    id: `${placement.objectTag}-${index}`,
    model: `${prefix}${placement.model}`,
    position: placement.position,
    rotationDegrees: placement.rotationDegrees,
    scale: placement.scale,
    runtime: {
      objectTag: placement.objectTag,
      placementSource: "mapinfo-chrs",
      ...placement.evidence,
      image: placement.image,
    },
  }),
).filter((placement) => !catalog || catalog.has(placement.model));
const report = {
  schema: "shenmue-mapinfo-character-placements-v1",
  source: path.relative(process.cwd(), inputPath),
  extractedRecordCount: extracted.length,
  placementCount: placements.length,
  placements,
};
const json = `${JSON.stringify(report, null, 2)}\n`;

if (output) {
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
  console.log(`Wrote ${outputPath} (${placements.length} placements)`);
} else {
  process.stdout.write(json);
}
