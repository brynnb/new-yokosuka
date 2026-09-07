#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-character-selection-evidence.json",
);
const executablePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const EXECUTABLE_LOAD_OFFSET = 0x010000;
const HANDLER_POINTER_LITERAL_ADDRESS = 0x0c1197a4;
const CHARACTER_TABLE_POINTER_LITERAL_ADDRESS = 0x0c1148bc;
const ACTOR_CHARACTER_INDEX_OFFSET = 0x08;
const MAXIMUM_CHARACTER_COUNT = 0x1000;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableOffset(address) {
  return (address & 0x00ffffff) - EXECUTABLE_LOAD_OFFSET;
}

function readExecutablePointer(address) {
  const offset = executableOffset(address);
  if (offset < 0 || offset + 4 > executable.length) {
    throw new Error(`Executable literal ${hex(address)} is out of bounds`);
  }
  return executable.readUInt32LE(offset);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

const characterLookupAddress = readExecutablePointer(
  HANDLER_POINTER_LITERAL_ADDRESS,
);
const characterTablePointerAddress = readExecutablePointer(
  CHARACTER_TABLE_POINTER_LITERAL_ADDRESS,
);

const sourceOperations = [];
for (const variant of source.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x2b) continue;
        sourceOperations.push({
          actorCode: variant.actorCode,
          sourceVariantId: variant.sourceVariantId,
          sourceProgramByteSha256: variant.sourceProgramByteSha256,
          journeyStartSecond: entry.startSecond,
          operationFileOffset: operation.fileOffset,
          residentCharacterCode: operation.residentCharacterCode,
          rawOperands: operation.rawOperands,
        });
      }
    }
  }
}

const uniqueCaptures = [...new Map(inventory.captures.map(
  (capture) => [capture.sha256, capture],
)).values()];
const tableObservations = [];
const captureErrors = [];
for (const capture of uniqueCaptures) {
  const data = fs.readFileSync(capture.path);
  const pointerSlotOffset = characterTablePointerAddress & 0x00ffffff;
  if (pointerSlotOffset + 4 > data.length) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      status: "executable-derived character-table pointer slot is absent",
    });
    continue;
  }
  const tablePointer = data.readUInt32LE(pointerSlotOffset);
  const tableOffset = tablePointer & 0x00ffffff;
  if (tableOffset + 4 > data.length) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      tablePointer: hex(tablePointer),
      status: "runtime character-table pointer is out of capture bounds",
    });
    continue;
  }
  const characterCount = data.readUInt32LE(tableOffset);
  const tableByteLength = 4 + characterCount * 4;
  if (
    characterCount > MAXIMUM_CHARACTER_COUNT
    || tableOffset + tableByteLength > data.length
  ) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      tablePointer: hex(tablePointer),
      characterCount,
      status: "runtime character table has invalid bounds",
    });
    continue;
  }
  const tableBytes = data.subarray(
    tableOffset,
    tableOffset + tableByteLength,
  );
  const characterCodes = Array.from(
    { length: characterCount },
    (_, index) => tableBytes.subarray(
      4 + index * 4,
      8 + index * 4,
    ).toString("ascii"),
  );
  if (characterCodes.some((code) => !/^[A-Z0-9_]{4}$/.test(code))) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      tablePointer: hex(tablePointer),
      characterCount,
      status: "runtime character table contains a non-identifier entry",
    });
    continue;
  }
  tableObservations.push({
    capturePath: capture.path,
    captureSha256: capture.sha256,
    likelyDisc: capture.likelyDisc,
    likelyArea: capture.likelyArea,
    tablePointer: hex(tablePointer),
    characterCount,
    tableByteSha256: sha256(tableBytes),
    characterCodes,
  });
}

const tableVariants = [...Map.groupBy(
  tableObservations,
  (observation) => observation.tableByteSha256,
).entries()].map(([tableByteSha256, members]) => ({
  tableByteSha256,
  characterCount: members[0].characterCount,
  captureHashCount: members.length,
  likelyAreas: [...new Set(
    members.map((member) => member.likelyArea).filter(Boolean),
  )].sort(),
  characterCodes: members[0].characterCodes,
})).sort((left, right) => (
  right.captureHashCount - left.captureHashCount
  || left.tableByteSha256.localeCompare(right.tableByteSha256)
));

const characterBindings = [...new Set(sourceOperations.map(
  (operation) => operation.residentCharacterCode,
))].sort().map((residentCharacterCode) => {
  const observations = tableObservations.map((table) => ({
    tableByteSha256: table.tableByteSha256,
    characterIndex: table.characterCodes.indexOf(residentCharacterCode),
  }));
  const indices = [...new Set(observations.map(
    (observation) => observation.characterIndex,
  ))].sort((left, right) => left - right);
  return {
    residentCharacterCode,
    sourceOperationCount: sourceOperations.filter(
      (operation) => (
        operation.residentCharacterCode === residentCharacterCode
      ),
    ).length,
    sourceActorCodes: [...new Set(sourceOperations.filter(
      (operation) => (
        operation.residentCharacterCode === residentCharacterCode
      ),
    ).map((operation) => operation.actorCode))].sort(),
    observedCharacterIndices: indices,
    resolvedCaptureHashCount: observations.filter(
      (observation) => observation.characterIndex >= 0,
    ).length,
    unresolvedCaptureHashCount: observations.filter(
      (observation) => observation.characterIndex < 0,
    ).length,
  };
});

const report = {
  schema: "new-yokosuka-scheduled-actor-character-selection-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), executablePath),
  ],
  evidenceBoundary: (
    "The dispatcher calls the executable-derived function pointer for "
    + "operation 0x2b. That function linearly searches the current resident "
    + "four-character table and returns its zero-based index, which the "
    + "dispatcher stores at actor +0x08. The browser preserves this native "
    + "selection code/index relationship without guessing a HUMANS model."
  ),
  nativeEvidence: {
    dispatcherAddress: "0x0c119444",
    handlerPointerLiteralAddress: hex(HANDLER_POINTER_LITERAL_ADDRESS),
    characterLookupAddress: hex(characterLookupAddress),
    characterTablePointerLiteralAddress:
      hex(CHARACTER_TABLE_POINTER_LITERAL_ADDRESS),
    characterTablePointerAddress: hex(characterTablePointerAddress),
    actorCharacterIndexOffset: hex(ACTOR_CHARACTER_INDEX_OFFSET, 2),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    validCharacterTableCaptureCount: tableObservations.length,
    invalidCharacterTableCaptureCount: captureErrors.length,
    distinctCharacterTableCount: tableVariants.length,
    sourceOperationCount: sourceOperations.length,
    sourceActorCodeCount: new Set(
      sourceOperations.map((operation) => operation.actorCode),
    ).size,
    distinctSelectedCharacterCodeCount: characterBindings.length,
    fullyResolvedSelectedCharacterCodeCount: characterBindings.filter(
      (binding) => binding.unresolvedCaptureHashCount === 0,
    ).length,
  },
  characterBindings,
  sourceOperations,
  tableVariants,
  captureErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${report.summary.sourceOperationCount} operation-0x2b `
  + `selections resolve across ${report.summary.validCharacterTableCaptureCount}`
  + " unique captures.",
);
