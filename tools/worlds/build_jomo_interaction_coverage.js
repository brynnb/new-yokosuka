#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";

const [
  placementArgument = "play/data/jomo-runtime-placements.json",
  operationArgument = "tools/evidence/jomo-object-operation-trace.json",
  outputArgument = "tools/evidence/jomo-interaction-coverage.json",
] = process.argv.slice(2);

const placementPath = path.resolve(placementArgument);
const operationPath = path.resolve(operationArgument);
const outputPath = path.resolve(outputArgument);
const placements = JSON.parse(fs.readFileSync(placementPath, "utf8"));
const operations = JSON.parse(fs.readFileSync(operationPath, "utf8"));

const placementByTag = new Map(
  placements.objectTags.map((entry) => [entry.objectTag, entry]),
);
const rows = operations.objects.map((operation) => {
  const placement = placementByTag.get(operation.objectTag) || {};
  const behavior = jomoObjectBehavior(
    placement.model || "",
    operation.objectTag,
    placement,
  ).kind;
  const groupedInteraction = operation.staticGroupIndices.length > 0;
  const staticInteractionRecordOffsets = operation.staticOccurrences
    .filter((occurrence) => {
      const offset = Number.parseInt(occurrence.fileOffset, 16);
      return (
        occurrence.recordWords
        && offset >= 0x9a800
        && offset < 0x9b700
      );
    })
    .map((occurrence) => occurrence.fileOffset);
  const provenInteraction = (
    groupedInteraction || staticInteractionRecordOffsets.length > 0
  );
  return {
    objectTag: operation.objectTag,
    model: placement.model || null,
    activePlacement: Boolean(placement.activePlacement),
    staticGroupIndices: operation.staticGroupIndices,
    staticInteractionRecordOffsets,
    directOperationIds: [
      ...new Set(
        operation.directEngineOperations
          .map((entry) => entry.operationHex)
          .filter(Boolean),
      ),
    ].sort(),
    browserBehavior: behavior,
    coverageStatus: behavior !== "none"
      ? "implemented"
      : provenInteraction && (!placement.model || !placement.activePlacement)
        ? "non-rendered-controller"
      : provenInteraction
        ? "proven-interaction-unimplemented"
        : "no-proven-browser-interaction",
  };
});

const groupCoverage = operations.staticGroups.map((group) => {
  const members = rows.filter(
    (row) => row.staticGroupIndices.includes(group.index),
  );
  return {
    groupIndex: group.index,
    headerWords: group.headerWords,
    memberCount: members.length,
    implementedCount: members.filter(
      (member) => member.coverageStatus === "implemented",
    ).length,
    unimplementedTags: members
      .filter(
        (member) => member.coverageStatus
          === "proven-interaction-unimplemented",
      )
      .map((member) => member.objectTag),
  };
});

const result = {
  schema: "new-yokosuka-jomo-interaction-coverage-v1",
  sources: {
    placements: path.relative(process.cwd(), placementPath),
    operations: path.relative(process.cwd(), operationPath),
  },
  summary: {
    objectTagCount: rows.length,
    activePlacementCount: rows.filter((row) => row.activePlacement).length,
    implementedInteractionCount: rows.filter(
      (row) => row.coverageStatus === "implemented",
    ).length,
    groupedInteractionUnimplementedCount: rows.filter(
      (row) => (
        row.staticGroupIndices.length > 0
        && row.coverageStatus === "proven-interaction-unimplemented"
      ),
    ).length,
    provenInteractionUnimplementedCount: rows.filter(
      (row) => row.coverageStatus === "proven-interaction-unimplemented",
    ).length,
    nonRenderedInteractionControllerCount: rows.filter(
      (row) => row.coverageStatus === "non-rendered-controller",
    ).length,
  },
  groupCoverage,
  objects: rows,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Wrote ${outputPath} `
  + `(${result.summary.implementedInteractionCount} implemented, `
  + `${result.summary.provenInteractionUnimplementedCount} proven gaps)`,
);
