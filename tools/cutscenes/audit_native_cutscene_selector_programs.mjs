#!/usr/bin/env node
import fs from "node:fs";

import { CUTSCENES } from "../../play/config/cutscenes.js";

const programPack = JSON.parse(fs.readFileSync(
  "play/data/events/nativeEventPrograms.generated.json",
  "utf8",
));
const programs = new Map(programPack.programs.map(program => [program.id, program]));
const directActivitySelections = CUTSCENES.filter(cutscene => cutscene.activity)
  .map(cutscene => ({
    cutsceneId: cutscene.id,
    packageId: cutscene.packageId,
    worldId: cutscene.worldId,
    slot: cutscene.activity.slot,
    binding: cutscene.activity.binding,
  }));
const programSelections = CUTSCENES.filter(cutscene => cutscene.program)
  .map(cutscene => {
    const program = programs.get(cutscene.program.programId);
    const unresolvedOperations = (program?.functions || [])
      .flatMap(fn => fn.blocks || [])
      .flatMap(block => block.actions || [])
      .filter(action => (
        ["engineOperation", "secondaryEngineOperation"].includes(action.kind)
        && action.adapterStatus !== "proven"
      ))
      .map(action => ({
        operationHex: action.operationHex || null,
        callFileOffset: action.callFileOffset,
        adapterStatus: action.adapterStatus || null,
      }));
    return {
      cutsceneId: cutscene.id,
      packageId: cutscene.packageId,
      programId: cutscene.program.programId,
      entryFunction: cutscene.program.entryFunction,
      kind: program?.preview?.kind || "native-owner",
      available: Boolean(program),
      unresolvedOperations,
    };
  });
const report = {
  schema: "new-yokosuka-native-cutscene-selector-program-audit-v1",
  generatedBy: "tools/cutscenes/audit_native_cutscene_selector_programs.mjs",
  summary: {
    selectionCount: CUTSCENES.length,
    programSelectionCount: programSelections.length,
    directActivitySelectionCount: directActivitySelections.length,
    missingProgramCount: programSelections.filter(item => !item.available).length,
    blockedProgramSelectionCount: programSelections.filter(
      item => item.unresolvedOperations.length > 0,
    ).length,
  },
  programSelections,
  directActivitySelections,
};
fs.writeFileSync(
  "tools/evidence/native-cutscene-selector-program-audit.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report.summary));
