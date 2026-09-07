#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourcePath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const executablePath = path.resolve(
  process.argv[4] || ".disc-work/exact/1ST_READ.BIN",
);
const outputPath = path.resolve(
  process.argv[5]
    || "tools/evidence/scheduled-actor-target-registry-evidence.json",
);

const EXECUTABLE_LOAD_ADDRESS = 0x0c010000;
const REGISTRY_HEADER_GLOBAL_ADDRESS = 0x0c217970;
const REGISTRY_RECORDS_GLOBAL_ADDRESS = 0x0c217974;
const LOOKUP_HEADER_LITERAL_ADDRESS = 0x0c0f952c;
const LOOKUP_RECORDS_LITERAL_ADDRESS = 0x0c0f9528;
const RECORD_STRIDE = 24;
const RECORD_CODE_OFFSET = 0;
const RECORD_OBJECT_POINTER_OFFSET = 4;
const HEADER_COUNT_OFFSET = 8;

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const executable = fs.readFileSync(executablePath);

function hex(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function executableUInt32(address) {
  return executable.readUInt32LE(address - EXECUTABLE_LOAD_ADDRESS);
}

function physicalOffset(pointer, byteLength) {
  const offset = pointer & 0x00ffffff;
  return offset < byteLength ? offset : null;
}

function fourcc(data, offset) {
  const value = data.subarray(offset, offset + 4).toString("ascii");
  return /^[\\x20-\\x7e]{4}$/.test(value) ? value : null;
}

if (
  executableUInt32(LOOKUP_HEADER_LITERAL_ADDRESS)
    !== REGISTRY_HEADER_GLOBAL_ADDRESS
  || executableUInt32(LOOKUP_RECORDS_LITERAL_ADDRESS)
    !== REGISTRY_RECORDS_GLOBAL_ADDRESS
) {
  throw new Error("Target-registry lookup globals do not match reviewed code");
}

const sourceTargetCodes = new Set();
const sourceTargetOperationCounts = new Map();
for (const variant of source.sourceVariants) {
  for (const table of variant.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (
          (operation.operation !== 0x17 && operation.operation !== 0x18)
          || typeof operation.targetCode !== "string"
        ) {
          continue;
        }
        sourceTargetCodes.add(operation.targetCode);
        const key = `${operation.operation}:${operation.targetCode}`;
        sourceTargetOperationCounts.set(
          key,
          (sourceTargetOperationCounts.get(key) || 0) + 1,
        );
      }
    }
  }
}

const uniqueCaptures = [...new Map(inventory.captures.map(
  (capture) => [capture.sha256, capture],
)).values()];
const observationsByCode = new Map();
const captureErrors = [];
let residentRegistryCaptureCount = 0;
let absentRegistryCaptureCount = 0;
let recordObservationCount = 0;

for (const capture of uniqueCaptures) {
  const data = fs.readFileSync(capture.path);
  const headerGlobalOffset = physicalOffset(
    REGISTRY_HEADER_GLOBAL_ADDRESS,
    data.length,
  );
  const recordsGlobalOffset = physicalOffset(
    REGISTRY_RECORDS_GLOBAL_ADDRESS,
    data.length,
  );
  if (headerGlobalOffset === null || recordsGlobalOffset === null) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      error: "registry global address outside capture",
    });
    continue;
  }
  const headerPointer = data.readUInt32LE(headerGlobalOffset);
  const recordsPointer = data.readUInt32LE(recordsGlobalOffset);
  if (headerPointer === 0 || recordsPointer === 0) {
    absentRegistryCaptureCount++;
    continue;
  }
  const headerOffset = physicalOffset(headerPointer, data.length);
  const recordsOffset = physicalOffset(recordsPointer, data.length);
  if (
    headerOffset === null
    || recordsOffset === null
    || headerOffset + HEADER_COUNT_OFFSET + 4 > data.length
  ) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      error: "registry header or record pointer outside capture",
    });
    continue;
  }
  const recordCount = data.readUInt32LE(headerOffset + HEADER_COUNT_OFFSET);
  if (
    recordCount === 0
    || recordCount > 1024
    || recordsOffset + recordCount * RECORD_STRIDE > data.length
  ) {
    captureErrors.push({
      capturePath: capture.path,
      captureSha256: capture.sha256,
      recordCount,
      error: "invalid registry record count or extent",
    });
    continue;
  }
  residentRegistryCaptureCount++;
  for (let index = 0; index < recordCount; index++) {
    const recordOffset = recordsOffset + index * RECORD_STRIDE;
    const targetCode = fourcc(data, recordOffset + RECORD_CODE_OFFSET);
    const objectPointer = data.readUInt32LE(
      recordOffset + RECORD_OBJECT_POINTER_OFFSET,
    );
    const objectOffset = physicalOffset(objectPointer, data.length);
    if (
      !targetCode
      || objectPointer === 0
      || objectOffset === null
      || objectOffset + 4 > data.length
    ) {
      captureErrors.push({
        capturePath: capture.path,
        captureSha256: capture.sha256,
        recordIndex: index,
        targetCode,
        objectPointer: hex(objectPointer),
        error: "invalid target registry record",
      });
      continue;
    }
    const targetSubtype = data.readUInt32LE(objectOffset);
    if (!observationsByCode.has(targetCode)) {
      observationsByCode.set(targetCode, []);
    }
    observationsByCode.get(targetCode).push({
      captureSha256: capture.sha256,
      recordIndex: index,
      targetSubtype,
    });
    recordObservationCount++;
  }
}

const targets = [...observationsByCode.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([targetCode, observations]) => {
    const subtypeCounts = Object.fromEntries(
      [...Map.groupBy(
        observations,
        (observation) => observation.targetSubtype,
      ).entries()]
        .sort(([left], [right]) => left - right)
        .map(([subtype, matching]) => [subtype, matching.length]),
    );
    const subtypes = Object.keys(subtypeCounts).map(Number);
    return {
      targetCode,
      targetSubtype: subtypes.length === 1 ? subtypes[0] : null,
      byteStableSubtype: subtypes.length === 1,
      observationCount: observations.length,
      captureCount: new Set(
        observations.map((observation) => observation.captureSha256),
      ).size,
      recordIndices: [...new Set(
        observations.map((observation) => observation.recordIndex),
      )].sort((left, right) => left - right),
      subtypeCounts,
      sourceOperationCounts: {
        operation17: sourceTargetOperationCounts.get(`23:${targetCode}`) || 0,
        operation18: sourceTargetOperationCounts.get(`24:${targetCode}`) || 0,
      },
      referencedBySource: sourceTargetCodes.has(targetCode),
    };
  });

const targetByCode = new Map(targets.map((target) => [
  target.targetCode,
  target,
]));
const unresolvedSourceTargetCodes = [...sourceTargetCodes]
  .filter((targetCode) => !targetByCode.get(targetCode)?.byteStableSubtype)
  .sort();
const report = {
  schema: "new-yokosuka-scheduled-actor-target-registry-evidence-v1",
  generatedFrom: {
    captureInventory: path.relative(process.cwd(), inventoryPath),
    captureInventorySha256: crypto.createHash("sha256")
      .update(fs.readFileSync(inventoryPath))
      .digest("hex"),
    scheduledActors: path.relative(process.cwd(), sourcePath),
    scheduledActorsSha256: crypto.createHash("sha256")
      .update(fs.readFileSync(sourcePath))
      .digest("hex"),
    executable: path.relative(process.cwd(), executablePath),
    executableSha256: crypto.createHash("sha256")
      .update(executable)
      .digest("hex"),
  },
  nativeEvidence: {
    lookupAddress: "0x0c0f9458",
    headerGlobalAddress: hex(REGISTRY_HEADER_GLOBAL_ADDRESS),
    recordsGlobalAddress: hex(REGISTRY_RECORDS_GLOBAL_ADDRESS),
    recordCountOffset: hex(HEADER_COUNT_OFFSET, 2),
    recordStride: RECORD_STRIDE,
    recordCodeOffset: hex(RECORD_CODE_OFFSET, 2),
    recordObjectPointerOffset: hex(RECORD_OBJECT_POINTER_OFFSET, 2),
    targetSubtypeRule:
      "dereference record +0x04 and read the first native dword",
    dispatchedSubtypes: [0, 1, 3],
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureCount: uniqueCaptures.length,
    residentRegistryCaptureCount,
    absentRegistryCaptureCount,
    captureErrorCount: captureErrors.length,
    targetRecordCount: targets.length,
    recordObservationCount,
    byteStableTargetSubtypeCount: targets.filter(
      (target) => target.byteStableSubtype,
    ).length,
    sourceTargetCodeCount: sourceTargetCodes.size,
    exactSourceTargetSubtypeCount: (
      sourceTargetCodes.size - unresolvedSourceTargetCodes.length
    ),
    unresolvedSourceTargetSubtypeCount: unresolvedSourceTargetCodes.length,
  },
  targets,
  unresolvedSourceTargetCodes,
  captureErrors,
  evidenceBoundary: (
    "This proves the native registry subtype selected by operations 0x17 "
    + "and 0x18 for every authored target code. It does not assign gameplay "
    + "names to subtype-specific control words or synthesize uncaptured "
    + "controller timing."
  ),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${targets.length} registry targets, `
  + `${report.summary.exactSourceTargetSubtypeCount}/`
  + `${report.summary.sourceTargetCodeCount} source targets exact.`,
);
