#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  extractScheduledPrograms,
  flattenRoutes,
} from "../lib/scheduled_actor_extractor.js";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const outputPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

function characterMappings() {
  const rows = fs.readFileSync("public/data/chars.csv", "utf8").split(/\r?\n/);
  const mappings = new Map();
  for (const row of rows.slice(1)) {
    const fields = row.split(";").map((field) => field.trim());
    if (fields.length < 3) continue;
    const [characterName, actorCode, modelCode] = fields;
    if (!/^[A-Z0-9_]{4}$/.test(actorCode) || !modelCode) continue;
    mappings.set(actorCode, {
      characterName,
      modelCode,
      evidence: "public/data/chars.csv exact actor ID",
    });
  }
  // chars.csv abbreviates Rena Isayama's ID as SYM, but the shipped HUMANS
  // pair is named ISYM.PKF/ISYM.PKS. Its PAKS entry contains both ISYM.BIN
  // and SHY_L.CHRM, independently binding the scheduler ID to the model.
  mappings.set("ISYM", {
    characterName: "Rena Isayama",
    modelCode: "SHY_L",
    evidence: (
      "HUMANS.AFS entry 275 contains paired ISYM.BIN and SHY_L.CHRM"
    ),
  });
  return mappings;
}

const mappings = characterMappings();
const provenance = new Map();
for (const capture of inventory.captures) {
  for (const program of capture.scheduledPrograms) {
    const key = `${program.actorCode}:${program.byteSha256}`;
    if (!provenance.has(key)) provenance.set(key, []);
    provenance.get(key).push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      inferredDisc: capture.likelyDisc,
      inferredArea: capture.likelyArea,
      inference: capture.inference,
      programHeader: program.programHeader,
    });
  }
}

const remaining = new Set(provenance.keys());
const variants = [];
for (const capture of inventory.captures) {
  if (!capture.scheduledPrograms.some((program) => (
    remaining.has(`${program.actorCode}:${program.byteSha256}`)
  ))) {
    continue;
  }
  const ram = fs.readFileSync(capture.path);
  for (const program of extractScheduledPrograms(ram)) {
    const key = `${program.actorCode}:${program.byteSha256}`;
    if (!remaining.has(key) || program.scheduleTables.length === 0) continue;
    const sources = provenance.get(key).sort(
      (a, b) => a.capturePath.localeCompare(b.capturePath),
    );
    const routes = flattenRoutes(program);
    const selectedAreas = [...new Set(program.scheduleTables.flatMap(
      (table) => table.entries.flatMap((entry) => (
        entry.descriptor.operations
          .filter((operation) => operation.operation === 8)
          .map((operation) => operation.area)
      )),
    ))].sort();
    const mapping = mappings.get(program.actorCode) || null;
    variants.push({
      variantId: key,
      actorCode: program.actorCode,
      identifier: program.identifier,
      characterMapping: mapping,
      programByteSha256: program.byteSha256,
      sourceNormalizedByteSha256: program.sourceNormalizedByteSha256,
      normalizedRelocationCount: program.normalizedRelocationCount,
      nativeMovementScale: program.nativeMovementScale,
      nativeDefaultPathSpeedPerGameSecond:
        program.nativeDefaultPathSpeedPerGameSecond,
      byteLength: program.byteLength,
      representativeProgramHeader: program.programHeader,
      representativeProgramEndAddressExclusive:
        program.programEndAddressExclusive,
      ownership: program.ownership,
      selectedAreas,
      scheduleSelector: program.scheduleSelector,
      scheduleTables: program.scheduleTables,
      sourceCaptures: sources,
      summary: {
        captureCount: sources.length,
        scheduleTableCount: program.scheduleTables.length,
        timetableEntryCount: program.scheduleTables.reduce(
          (count, table) => count + table.entries.length,
          0,
        ),
        provenRouteCount: routes.length,
        provenRoutePointCount: routes.reduce(
          (count, route) => count + route.runtimePoints.length,
          0,
        ),
        unresolvedOperationCandidateCount: program.scheduleTables.reduce(
          (count, table) => count + table.entries.reduce(
            (entryCount, entry) => (
              entryCount
              + entry.descriptor.unresolvedOperationCandidates.length
            ),
            0,
          ),
          0,
        ),
      },
    });
    remaining.delete(key);
  }
}

if (remaining.size > 0) {
  throw new Error(
    `Could not reconstruct ${remaining.size} inventoried program variants.`,
  );
}
variants.sort((a, b) => (
  (a.actorCode < b.actorCode ? -1 : a.actorCode > b.actorCode ? 1 : 0)
  || (
    a.programByteSha256 < b.programByteSha256
      ? -1
      : a.programByteSha256 > b.programByteSha256 ? 1 : 0
  )
));

const areas = new Map();
for (const capture of inventory.captures) {
  const key = `${capture.likelyDisc ?? "unknown"}:${capture.likelyArea ?? "unknown"}`;
  if (!areas.has(key)) {
    areas.set(key, {
      disc: capture.likelyDisc,
      area: capture.likelyArea,
      captures: new Set(),
      programVariants: new Set(),
    });
  }
  areas.get(key).captures.add(capture.path);
}
for (const variant of variants) {
  for (const source of variant.sourceCaptures) {
    const key = `${source.inferredDisc ?? "unknown"}:${source.inferredArea ?? "unknown"}`;
    if (!areas.has(key)) {
      areas.set(key, {
        disc: source.inferredDisc,
        area: source.inferredArea,
        captures: new Set(),
        programVariants: new Set(),
      });
    }
    const coverage = areas.get(key);
    coverage.captures.add(source.capturePath);
    if (variant.selectedAreas.includes(source.inferredArea)) {
      coverage.programVariants.add(variant.variantId);
    }
  }
}
const capturedCoverage = [...areas.values()].map((area) => ({
  disc: area.disc,
  area: area.area,
  captureCount: area.captures.size,
  programVariantCount: area.programVariants.size,
  programVariants: [...area.programVariants].sort(),
  status: (
    area.programVariants.size > 0
      ? "RAM scheduler programs inventoried; offline source coverage unresolved"
      : "no scheduled actors found in captured RAM; not proof of absence"
  ),
})).sort((a, b) => (
  (a.disc ?? 99) - (b.disc ?? 99)
  || String(a.area).localeCompare(String(b.area))
));

function catalogAreas() {
  const roots = [
    { disc: 1, root: ".disc-work/mapinfo/disc1/SCENE/01" },
    { disc: 2, root: ".disc-work/mapinfo/disc2/SCENE/02" },
    { disc: 3, root: "extracted_disc3_v2/data/SCENE/03" },
  ];
  const result = [];
  for (const { disc, root } of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[A-Z0-9]{4}$/.test(entry.name)) {
        result.push({ disc, area: entry.name });
      }
    }
  }
  return result;
}

const offlinePath = "tools/evidence/offline-scheduled-actors.json";
const offline = fs.existsSync(offlinePath)
  ? JSON.parse(fs.readFileSync(offlinePath, "utf8"))
  : { files: [] };
const linkedRouteTableMap = new Map();
for (const file of offline.files) {
  if (!file.linkedRouteTable) continue;
  const linkedRouteTableId = `MCIR:${file.sha256}`;
  if (!linkedRouteTableMap.has(linkedRouteTableId)) {
    linkedRouteTableMap.set(linkedRouteTableId, {
      linkedRouteTableId,
      sourceFileSha256: file.sha256,
      sourceFiles: [],
      ...file.linkedRouteTable,
    });
  }
  linkedRouteTableMap.get(linkedRouteTableId).sourceFiles.push(file.path);
}
const linkedRouteTables = [...linkedRouteTableMap.values()].map((table) => ({
  ...table,
  sourceFiles: [...new Set(table.sourceFiles)].sort(),
})).sort((left, right) => (
  left.linkedRouteTableId.localeCompare(right.linkedRouteTableId)
));
const sourceVariantMap = new Map();
for (const file of offline.files) {
  for (const program of file.programs) {
    const key = `${program.actorCode}:${program.byteSha256}`;
    if (!sourceVariantMap.has(key)) {
      sourceVariantMap.set(key, {
        sourceVariantId: key,
        actorCode: program.actorCode,
        identifier: program.identifier,
        characterMapping: mappings.get(program.actorCode) || null,
        sourceProgramByteSha256: program.byteSha256,
        byteLength: program.byteLength,
        nativeMovementScale: program.nativeMovementScale,
        nativeDefaultPathSpeedPerGameSecond:
          program.nativeDefaultPathSpeedPerGameSecond,
        selectedAreas: program.selectedAreas || [],
        scheduleSelector: program.scheduleSelector,
        scheduleTables: program.scheduleTables,
        scheduleStatus: program.scheduleSelector === null
          ? "unresolved-selector"
          : program.scheduleTables.length > 0
            ? "decoded"
            : "no-decoded-tables",
        sourceFiles: [],
      });
    }
    sourceVariantMap.get(key).sourceFiles.push({
      path: file.path,
      fileSha256: file.sha256,
      disc: file.inferredDisc,
      containerArea: file.inferredArea,
      linkedRouteTableId: file.linkedRouteTable
        ? `MCIR:${file.sha256}`
        : null,
      programFileOffset: program.programFileOffset,
      programEndFileOffsetExclusive: program.programEndFileOffsetExclusive,
    });
  }
}
const sourceVariants = [...sourceVariantMap.values()].map((variant) => {
  variant.sourceFiles.sort((a, b) => (
    a.path.localeCompare(b.path)
    || a.programFileOffset.localeCompare(b.programFileOffset)
  ));
  const matchingRamVariantIds = variants.filter((candidate) => (
    candidate.actorCode === variant.actorCode
    && candidate.sourceNormalizedByteSha256
      === variant.sourceProgramByteSha256
  )).map((candidate) => candidate.variantId).sort();
  const routes = variant.scheduleTables.flatMap((table) => (
    table.entries.flatMap((entry) => entry.descriptor.routes)
  ));
  return {
    ...variant,
    matchingRamVariantIds,
    summary: {
      sourceFileOccurrenceCount: variant.sourceFiles.length,
      matchingRamVariantCount: matchingRamVariantIds.length,
      scheduleTableCount: variant.scheduleTables.length,
      timetableEntryCount: variant.scheduleTables.reduce(
        (count, table) => count + table.entries.length,
        0,
      ),
      provenRouteCount: routes.length,
      provenRoutePointCount: routes.reduce(
        (count, route) => count + route.runtimePoints.length,
        0,
      ),
    },
  };
}).sort((a, b) => (
  (a.actorCode < b.actorCode ? -1 : a.actorCode > b.actorCode ? 1 : 0)
  || (
    a.sourceProgramByteSha256 < b.sourceProgramByteSha256
      ? -1
      : a.sourceProgramByteSha256 > b.sourceProgramByteSha256 ? 1 : 0
  )
));
const offlineAreas = new Map();
const offlineDiscSourceCounts = new Map();
for (const file of offline.files) {
  if (file.inferredDisc === null) continue;
  if (!offlineDiscSourceCounts.has(file.inferredDisc)) {
    offlineDiscSourceCounts.set(file.inferredDisc, new Set());
  }
  offlineDiscSourceCounts.get(file.inferredDisc).add(file.sha256);
  for (const program of file.programs) {
    if (program.scheduleTables.length === 0) continue;
    for (const selectedArea of program.selectedAreas || []) {
      const key = `${file.inferredDisc}:${selectedArea}`;
      if (!offlineAreas.has(key)) {
        offlineAreas.set(key, {
          sourceHashes: new Set(),
          scheduledProgramVariants: new Set(),
        });
      }
      const area = offlineAreas.get(key);
      area.sourceHashes.add(file.sha256);
      area.scheduledProgramVariants.add(
        `${program.actorCode}:${program.byteSha256}`,
      );
    }
  }
}
const capturedByKey = new Map(capturedCoverage.map(
  (area) => [`${area.disc}:${area.area}`, area],
));
const areaKeys = new Map();
for (const area of [...catalogAreas(), ...capturedCoverage]) {
  areaKeys.set(`${area.disc}:${area.area}`, {
    disc: area.disc,
    area: area.area,
  });
}
const coverage = [...areaKeys.values()].map(({ disc, area }) => {
  const key = `${disc}:${area}`;
  const captured = capturedByKey.get(key);
  const source = offlineAreas.get(key);
  const programVariantCount = captured?.programVariantCount || 0;
  let status = "unresolved: no RAM capture and no extracted cycle-program source";
  const offlineScheduledProgramCount =
    source?.scheduledProgramVariants.size || 0;
  if (offlineScheduledProgramCount > 0) {
    status = (
      "offline timetable and movement paths decoded; non-movement operation "
      + "semantics and free-roaming classification remain unresolved"
    );
  } else if (captured && programVariantCount > 0) {
    status = "partially decoded RAM schedule; offline source coverage unresolved";
  } else if ((offlineDiscSourceCounts.get(disc)?.size || 0) > 0) {
    status = (
      "no area selector found in the complete extracted cycle-program sources"
    );
  }
  return {
    disc,
    area,
    captureCount: captured?.captureCount || 0,
    programVariantCount,
    programVariants: captured?.programVariants || [],
    offlineSourceFileCount: source?.sourceHashes.size || 0,
    offlineScheduledProgramCount,
    completeSchedule: (
      offlineScheduledProgramCount === 0
      && (offlineDiscSourceCounts.get(disc)?.size || 0) > 0
    ),
    classification: (
      offlineScheduledProgramCount > 0
        ? "partially-decoded-scheduled-area"
        : (offlineDiscSourceCounts.get(disc)?.size || 0) > 0
          ? "no-scheduled-area-selector"
          : "unresolved"
    ),
    status,
  };
}).sort((a, b) => a.disc - b.disc || a.area.localeCompare(b.area));

const report = {
  schema: "new-yokosuka-scheduled-actors-v3",
  generatedFrom: path.relative(process.cwd(), inventoryPath),
  coordinateConversion: "browser = [-runtimeX, runtimeY, runtimeZ]",
  evidenceBoundary: (
    "Descriptor boundaries use exact widths recovered from the native "
    + "dispatcher. Operation 8 selects the area and every operation 1 uses "
    + "the proven movement-path handler; other operations retain numeric "
    + "operands without inferred names. Byte-different loaded program extents "
    + "remain distinct variants."
  ),
  variants,
  sourceVariants,
  linkedRouteTables,
  coverage,
  summary: {
    captureCount: inventory.summary.captureCount,
    actorCodeCount: new Set(variants.map((variant) => variant.actorCode)).size,
    programVariantCount: variants.length,
    sourceActorCodeCount: new Set(
      sourceVariants.map((variant) => variant.actorCode),
    ).size,
    sourceProgramVariantCount: sourceVariants.length,
    sourceVariantsMatchedToRamCount: sourceVariants.filter(
      (variant) => variant.matchingRamVariantIds.length > 0,
    ).length,
    sourceOnlyProgramVariantCount: sourceVariants.filter(
      (variant) => variant.matchingRamVariantIds.length === 0,
    ).length,
    timetableEntryCount: variants.reduce(
      (count, variant) => count + variant.summary.timetableEntryCount,
      0,
    ),
    provenRouteCount: variants.reduce(
      (count, variant) => count + variant.summary.provenRouteCount,
      0,
    ),
    provenRoutePointCount: variants.reduce(
      (count, variant) => count + variant.summary.provenRoutePointCount,
      0,
    ),
    sourceProvenRouteCount: sourceVariants.reduce(
      (count, variant) => count + variant.summary.provenRouteCount,
      0,
    ),
    sourceProvenRoutePointCount: sourceVariants.reduce(
      (count, variant) => count + variant.summary.provenRoutePointCount,
      0,
    ),
    linkedRouteTableCount: linkedRouteTables.length,
    linkedRouteRootCount: linkedRouteTables.reduce(
      (count, table) => count + table.rootCount,
      0,
    ),
    linkedRoutePointCount: linkedRouteTables.reduce(
      (count, table) => count + table.declaredPointCount,
      0,
    ),
    catalogAreaCount: coverage.length,
    capturedAreaCount: capturedCoverage.length,
    unresolvedOperationCandidateCount: variants.reduce(
      (count, variant) => (
        count + variant.summary.unresolvedOperationCandidateCount
      ),
      0,
    ),
    unresolvedSemanticOperationOccurrenceCount:
      offline.summary?.unresolvedSemanticOperationOccurrenceCount ?? null,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const coveragePath = path.resolve(
  "tools/evidence/scheduled-actor-coverage.json",
);
const coverageReport = {
  schema: "new-yokosuka-scheduled-actor-coverage-v1",
  evidenceBoundary: (
    "A zero-selector RAM capture is not proof of absence. Negative coverage "
    + "comes from the complete extracted cycle-program sources for that disc. "
    + "The native descriptor layout and movement paths are decoded, while "
    + "free-roaming versus cutscene/battle/minigame classification and "
    + "non-movement operation semantics remain unresolved in scheduled areas."
  ),
  summary: {
    catalogAreaCount: coverage.length,
    capturedAreaCount: capturedCoverage.length,
    partialOfflineAreaCount: coverage.filter((area) => (
      area.offlineScheduledProgramCount > 0
    )).length,
    partialRamOnlyAreaCount: coverage.filter((area) => (
      area.offlineScheduledProgramCount === 0
      && area.programVariantCount > 0
    )).length,
    capturedWithoutMatchingSelectorCount: coverage.filter((area) => (
      area.captureCount > 0
      && area.programVariantCount === 0
      && area.offlineScheduledProgramCount === 0
    )).length,
    noScheduledAreaSelectorCount: coverage.filter((area) => (
      area.classification === "no-scheduled-area-selector"
    )).length,
    unresolvedAreaCount: coverage.filter(
      (area) => area.classification === "unresolved",
    ).length,
    completeAreaCount: coverage.filter(
      (area) => area.completeSchedule,
    ).length,
  },
  areas: coverage.map((area) => ({
    disc: area.disc,
    area: area.area,
    captureCount: area.captureCount,
    programVariantCount: area.programVariantCount,
    offlineSourceFileCount: area.offlineSourceFileCount,
    offlineScheduledProgramCount: area.offlineScheduledProgramCount,
    completeSchedule: area.completeSchedule,
    classification: area.classification,
    status: area.status,
  })),
};
fs.writeFileSync(coveragePath, `${JSON.stringify(coverageReport, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${report.summary.actorCodeCount} actor codes, `
  + `${report.summary.programVariantCount} byte-exact variants.`,
);
