#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import transitions from "../../play/data/native-map-transitions.json" with { type: "json" };
import {
  extractMapinfoStaticDoors,
} from "../lib/mapinfo_static_doors.js";

function usage() {
  console.error(
    "Usage: node tools/worlds/extract_mapinfo_static_doors.js "
    + "<MAPINFO.BIN> [--prefix S1_D000_] [--area MS8S] [--out placements.json]",
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
let area = "";
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--prefix") prefix = argv[++index];
  else if (argv[index] === "--area") area = argv[++index];
  else if (argv[index] === "--out") output = argv[++index];
  else {
    usage();
    process.exit(2);
  }
}

const inputPath = path.resolve(input);
// The native door catalog resolves CHRT DefImage aliases into actual model
// names. Multiple static instances can share the same image alias.
const imageModels = Object.fromEntries(transitions.allExactDoorTransitions
  .filter(entry => entry.source.area === area)
  .map(entry => entry.source.nativeDoorObject)
  .filter(door => door?.modelResolution === "exactChrtDefImageBinding")
  .map(door => [door.name, door.chrtDefImageBinding.model.replace(/\.MT5$/i, "")]));
const extracted = extractMapinfoStaticDoors(
  fs.readFileSync(inputPath),
  prefix,
  imageModels,
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
