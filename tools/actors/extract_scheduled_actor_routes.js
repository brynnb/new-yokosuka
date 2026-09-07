#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractScheduledPrograms,
  flattenRoutes,
  hexAddress,
  RAM_BASE,
  sha256,
} from "../lib/scheduled_actor_extractor.js";

function usage() {
  console.error(
    "Usage: node tools/actors/extract_scheduled_actor_routes.js "
    + "<ram.bin> [output.json]",
  );
  process.exit(2);
}

function characterMappings() {
  const mappings = new Map();
  const rows = fs.readFileSync("public/data/chars.csv", "utf8").split(/\r?\n/);
  for (const row of rows.slice(1)) {
    const [name, actorCode, modelCode] = row.split(";").map(
      (field) => field.trim(),
    );
    if (/^[A-Z0-9_]{4}$/.test(actorCode) && modelCode) {
      mappings.set(actorCode, {
        characterName: name,
        modelCode,
        evidence: "public/data/chars.csv exact actor ID",
      });
    }
  }
  return mappings;
}

const [ramArgument, outputArgument] = process.argv.slice(2);
if (!ramArgument) usage();
const ramPath = path.resolve(ramArgument);
const outputPath = path.resolve(
  outputArgument || "tools/evidence/scheduled-actors-capture.json",
);
const ram = fs.readFileSync(ramPath);
const ramSha256 = sha256(ram);
const mappings = characterMappings();
const discovered = extractScheduledPrograms(ram);
const programs = discovered.filter(
  (program) => program.scheduleTables.length > 0,
).map((program) => ({
  ...program,
  characterMapping: mappings.get(program.actorCode) || null,
  sourceCapture: {
    path: path.relative(process.cwd(), ramPath),
    sha256: ramSha256,
  },
}));
const routes = programs.flatMap(flattenRoutes);
const report = {
  schema: "new-yokosuka-scheduled-actors-capture-v3",
  source: {
    ram: path.relative(process.cwd(), ramPath),
    ramSha256,
    ramBaseAddress: hexAddress(RAM_BASE),
    coordinateConversion: "browser = [-runtimeX, runtimeY, runtimeZ]",
  },
  ownershipRule: (
    "Each aligned ????PRG1 header owns bytes through the next aligned PRG1 "
    + "header. Tables, descriptors, and route arrays must resolve inside it."
  ),
  decodingBoundary: (
    "Only area operation 8 and route operation 1 subtype 0x8016 are decoded. "
    + "Every descriptor retains exact raw bytes and addressed words."
  ),
  programs,
  unresolvedPrograms: discovered.filter((program) => (
    !program.ownership.bounded
  )),
  summary: {
    residentProgramCount: discovered.length,
    scheduledProgramCount: programs.length,
    scheduleTableCount: programs.reduce(
      (count, program) => count + program.scheduleTables.length,
      0,
    ),
    timetableEntryCount: programs.reduce(
      (count, program) => count + program.scheduleTables.reduce(
        (sum, table) => sum + table.entries.length,
        0,
      ),
      0,
    ),
    provenRouteCount: routes.length,
    provenRoutePointCount: routes.reduce(
      (count, route) => count + route.runtimePoints.length,
      0,
    ),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath} (${report.summary.scheduledProgramCount} scheduled `
  + `programs, ${report.summary.timetableEntryCount} entries, `
  + `${report.summary.provenRouteCount} proven routes).`,
);
