#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractScheduledPrograms,
  sha256,
} from "../lib/scheduled_actor_extractor.js";

const captureRoot = path.resolve(process.argv[2] || "captures/pvr");
const outputPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actor-capture-inventory.json",
);

function ramPaths(root) {
  const result = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(child);
      else if (entry.isFile() && entry.name === "ram.bin") result.push(child);
    }
  }
  return result.sort();
}

function occurrences(buffer, expression) {
  const values = new Map();
  const text = buffer.toString("latin1");
  for (const match of text.matchAll(expression)) {
    values.set(match[0], (values.get(match[0]) || 0) + 1);
  }
  return [...values.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function likelyDiscAndArea(ram) {
  const scenePathMatches = [...ram.toString("latin1").matchAll(
    /SCENE\/0[123]\/[A-Z0-9]{4}\x00/g,
  )].map((match) => ({
    value: match[0],
    fileOffset: match.index,
  })).sort((a, b) => b.fileOffset - a.fileOffset);
  if (scenePathMatches.length > 0) {
    // The active loader path is the high-RAM mutable copy. Lower matches are
    // resident executable literals (for example FREE, D000, JOMO, JHD0).
    const value = scenePathMatches[0].value;
    return {
      likelyDisc: Number(value[7]),
      likelyArea: value.slice(9, 13),
      inference: "highest-address null-terminated SCENE/0<disc>/<area> loader path",
      scenePathCandidates: scenePathMatches.map((candidate) => ({
        address: `0x${(0x8c000000 + candidate.fileOffset).toString(16)}`,
        path: candidate.value.slice(0, -1),
      })),
      discScores: { [value[7]]: 1 },
      topAreaScores: { [value.slice(9, 13)]: 1 },
    };
  }
  const assetTags = occurrences(ram, /S[123]_[A-Z0-9]{4}_/g);
  const discs = new Map();
  const areas = new Map();
  for (const { value, count } of assetTags) {
    const disc = Number(value[1]);
    const area = value.slice(3, 7);
    discs.set(disc, (discs.get(disc) || 0) + count);
    areas.set(area, (areas.get(area) || 0) + count);
  }
  const rankedDiscs = [...discs.entries()].sort((a, b) => b[1] - a[1]);
  const rankedAreas = [...areas.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return {
    likelyDisc: rankedDiscs[0]?.[0] ?? null,
    likelyArea: rankedAreas[0]?.[0] ?? null,
    inference: "most frequent resident S<disc>_<area>_ asset tag",
    discScores: Object.fromEntries(rankedDiscs),
    topAreaScores: Object.fromEntries(rankedAreas.slice(0, 12)),
  };
}

function residentTokenSignatures(ram) {
  const signatures = [];
  for (const signature of ["SCN3", "MAPINFO"]) {
    let count = 0;
    let cursor = 0;
    while ((cursor = ram.indexOf(signature, cursor, "ascii")) >= 0) {
      count++;
      cursor += signature.length;
    }
    signatures.push({ signature, count });
  }
  return signatures;
}

const captures = [];
const exactRamGroups = new Map();
const populationGroups = new Map();
const programSetGroups = new Map();
const paths = ramPaths(captureRoot);

for (const [index, ramPath] of paths.entries()) {
  const ram = fs.readFileSync(ramPath);
  const ramSha256 = sha256(ram);
  const programs = extractScheduledPrograms(ram);
  const scheduledPrograms = programs.filter(
    (program) => program.scheduleTables.length > 0,
  );
  const programPopulation = programs.map(
    (program) => `${program.identifier}:${program.byteSha256 || "unbounded"}`,
  ).sort();
  const scheduledProgramSet = scheduledPrograms.map(
    (program) => `${program.identifier}:${program.byteSha256}`,
  ).sort();
  const populationSha256 = sha256(Buffer.from(programPopulation.join("\n")));
  const scheduledProgramSetSha256 = sha256(
    Buffer.from(scheduledProgramSet.join("\n")),
  );
  const relativePath = path.relative(process.cwd(), ramPath);
  const inference = likelyDiscAndArea(ram);
  captures.push({
    path: relativePath,
    sha256: ramSha256,
    byteLength: ram.length,
    ...inference,
    residentSignatures: residentTokenSignatures(ram),
    programCount: programs.length,
    scheduledProgramCount: scheduledPrograms.length,
    programPopulationSha256: populationSha256,
    scheduledProgramSetSha256,
    programIdentifiers: programs.map((program) => program.identifier),
    scheduledPrograms: scheduledPrograms.map((program) => ({
      actorCode: program.actorCode,
      identifier: program.identifier,
      byteSha256: program.byteSha256,
      sourceNormalizedByteSha256: program.sourceNormalizedByteSha256,
      normalizedRelocationCount: program.normalizedRelocationCount,
      nativeMovementScale: program.nativeMovementScale,
      nativeDefaultPathSpeedPerGameSecond:
        program.nativeDefaultPathSpeedPerGameSecond,
      programHeader: program.programHeader,
      scheduleTables: program.scheduleTables.map((table) => ({
        scheduleTable: table.scheduleTable,
        entryCount: table.entries.length,
        startSeconds: table.entries.map((entry) => entry.startSecond),
        areas: [...new Set(table.entries.flatMap((entry) => (
          entry.descriptor.operations
            .filter((operation) => operation.operation === 8)
            .map((operation) => operation.area)
        )))].sort(),
      })),
    })),
  });
  for (const [groups, key] of [
    [exactRamGroups, ramSha256],
    [populationGroups, populationSha256],
    [programSetGroups, scheduledProgramSetSha256],
  ]) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(relativePath);
  }
  if ((index + 1) % 25 === 0 || index + 1 === paths.length) {
    console.error(`Scanned ${index + 1}/${paths.length} RAM captures.`);
  }
}

function groupRecords(groups) {
  return [...groups.entries()]
    .map(([sha256Value, members]) => ({
      sha256: sha256Value,
      count: members.length,
      members,
    }))
    .sort((a, b) => b.count - a.count || a.sha256.localeCompare(b.sha256));
}

const report = {
  schema: "new-yokosuka-scheduled-actor-capture-inventory-v1",
  captureRoot: path.relative(process.cwd(), captureRoot),
  inferenceBoundary: (
    "Disc/area values are ranked resident-asset inferences, not proof of the "
    + "currently active map. Program variants are byte-exact loaded extents."
  ),
  summary: {
    captureCount: captures.length,
    uniqueRamCount: exactRamGroups.size,
    uniqueProgramPopulationCount: populationGroups.size,
    uniqueScheduledProgramSetCount: programSetGroups.size,
  },
  exactRamGroups: groupRecords(exactRamGroups),
  programPopulationGroups: groupRecords(populationGroups),
  scheduledProgramSetGroups: groupRecords(programSetGroups),
  captures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath} with ${captures.length} captures.`);
