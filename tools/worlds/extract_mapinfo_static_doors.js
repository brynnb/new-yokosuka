#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractMapinfoStaticDoors,
} from "../lib/mapinfo_static_doors.js";

function usage() {
  console.error(
    "Usage: node tools/worlds/extract_mapinfo_static_doors.js "
    + "<MAPINFO.BIN> [--prefix S1_D000_] [--out placements.json]",
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
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--prefix") prefix = argv[++index];
  else if (argv[index] === "--out") output = argv[++index];
  else {
    usage();
    process.exit(2);
  }
}

const inputPath = path.resolve(input);
const extracted = extractMapinfoStaticDoors(
  fs.readFileSync(inputPath),
  prefix,
);
const report = {
  schema: "shenmue-mapinfo-static-door-placements-v1",
  source: path.relative(process.cwd(), inputPath),
  nameTableOffset: `0x${extracted.nameTableOffset.toString(16)}`,
  descriptorsOffset: `0x${extracted.descriptorsOffset.toString(16)}`,
  recordsOffset: `0x${extracted.recordsOffset.toString(16)}`,
  modelNames: extracted.modelNames,
  placementCount: extracted.placements.length,
  placements: extracted.placements,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
  console.log(
    `Wrote ${outputPath} (${extracted.placements.length} placements)`,
  );
} else {
  process.stdout.write(json);
}
