#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const sourcePath = path.join(root, "tools/evidence/scheduled-actors.json");
const registryPath = path.join(
  root,
  "tools/evidence/scheduled-actor-default-idle-evidence.json",
);
const outputPath = path.join(
  root,
  "play/data/shenmue1-schedule-catalog.json",
);

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const registryByCode = new Map(
  registry.actors.map((actor) => [actor.actorCode, actor]),
);
const sourceCodes = new Set(
  source.sourceVariants.map((variant) => variant.actorCode),
);
const missingSourceCodes = [...registryByCode.keys()]
  .filter((actorCode) => !sourceCodes.has(actorCode))
  .sort();
if (missingSourceCodes.length > 0) {
  throw new Error(
    `Missing source schedules for native actors: ${missingSourceCodes.join(", ")}`,
  );
}

const programs = source.sourceVariants.map((variant) => ({
  programId: variant.sourceVariantId,
  actorCode: variant.actorCode,
  label: variant.characterMapping?.characterName || null,
  modelCode: variant.characterMapping?.modelCode || null,
  characterMappingEvidence: variant.characterMapping?.evidence || null,
  nativeRegistry: registryByCode.has(variant.actorCode)
    ? {
        status: registryByCode.get(variant.actorCode).status,
        observationCount: registryByCode.get(variant.actorCode).observationCount,
        exactDefaultMotionStateId: (
          registryByCode.get(variant.actorCode).exactDefaultMotionStateId
        ),
        exactCandidateMotionIds: (
          registryByCode.get(variant.actorCode).exactCandidateMotionIds
        ),
      }
    : null,
  sourceProgramByteSha256: variant.sourceProgramByteSha256,
  byteLength: variant.byteLength,
  nativeMovementScale: variant.nativeMovementScale,
  nativeDefaultPathSpeedPerGameSecond: (
    variant.nativeDefaultPathSpeedPerGameSecond
  ),
  scheduleStatus: variant.scheduleStatus,
  selectedAreas: variant.selectedAreas,
  scheduleSelector: variant.scheduleSelector,
  scheduleTables: variant.scheduleTables,
  sourceFiles: variant.sourceFiles,
  matchingRamVariantIds: variant.matchingRamVariantIds,
  summary: variant.summary,
}));

const catalog = {
  schema: "new-yokosuka-shenmue1-schedule-catalog-v1",
  generatedFrom: [
    "tools/evidence/scheduled-actors.json",
    "tools/evidence/scheduled-actor-default-idle-evidence.json",
  ],
  evidenceBoundary: (
    "Complete Shenmue I PRG1 schedule extraction. This catalog preserves "
    + "native selector slots, calendar/story conditions, empty schedules, "
    + "decoded timetable operations, routes, mappings, and source provenance. "
    + "It is not wired into browser or server playback."
  ),
  summary: {
    nativeRegistryActorCodeCount: registryByCode.size,
    sourceActorCodeCount: sourceCodes.size,
    sourceProgramCount: programs.length,
    decodedProgramCount: programs.filter(
      ({ scheduleStatus }) => scheduleStatus === "decoded",
    ).length,
    mappedProgramCount: programs.filter(({ modelCode }) => modelCode).length,
    unmappedProgramCount: programs.filter(({ modelCode }) => !modelCode).length,
    missingNativeSourceActorCodes: missingSourceCodes,
  },
  linkedRouteTables: source.linkedRouteTables,
  programs,
};

await fs.writeFile(outputPath, `${JSON.stringify(catalog)}\n`);
console.log(
  `Wrote ${path.relative(root, outputPath)}: `
  + `${programs.length} programs / ${sourceCodes.size} actor codes`,
);
