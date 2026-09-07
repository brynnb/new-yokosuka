#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  extractScheduledPrograms,
} from "../lib/scheduled_actor_extractor.js";

const inventoryPath = path.resolve(
  process.argv[2]
    || "tools/evidence/scheduled-actor-capture-inventory.json",
);
const sourceManifestPath = path.resolve(
  process.argv[3] || "tools/evidence/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[4]
    || "tools/evidence/scheduled-actor-subordinate-evidence.json",
);
const enginePath = path.resolve(
  process.argv[5] || ".disc-work/exact/1ST_READ.BIN",
);

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const engine = fs.readFileSync(enginePath);

const ENGINE_LOAD_ADDRESS = 0x0c010000;
const SCHEDULER_CLOCK_LITERAL_ADDRESS = 0x0c115b08;
const SCHEDULER_CLOCK_LITERAL_LENGTH = 12;
const SCHEDULER_CLOCK_CACHE_POINTER_OFFSET = 4;
const schedulerClockLiteralOffset = (
  SCHEDULER_CLOCK_LITERAL_ADDRESS - ENGINE_LOAD_ADDRESS
);
const schedulerClockLiteral = engine.subarray(
  schedulerClockLiteralOffset,
  schedulerClockLiteralOffset + SCHEDULER_CLOCK_LITERAL_LENGTH,
);
if (
  schedulerClockLiteral.length !== SCHEDULER_CLOCK_LITERAL_LENGTH
  || schedulerClockLiteral.readUInt32LE(0) !== 0x0c114856
) {
  throw new Error(
    "1ST_READ scheduler clock literal signature does not match "
    + "the reviewed 0x0c115b08 callsite",
  );
}

function pointerBytes(pointer) {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(pointer >>> 0);
  return result;
}

function occurrences(data, bytes) {
  const result = [];
  let cursor = -1;
  while ((cursor = data.indexOf(bytes, cursor + 1)) !== -1) {
    result.push(cursor);
  }
  return result;
}

function physicalAddress(value) {
  return value & 0x00ffffff;
}

function physicalOffset(pointer, length) {
  const offset = physicalAddress(pointer);
  return offset < length ? offset : null;
}

function hex(value) {
  return `0x${(value >>> 0).toString(16)}`;
}

function ramAddress(offset) {
  return hex(0x8c000000 + offset);
}

function browserVector(runtime) {
  return [-runtime[0], runtime[1], runtime[2]];
}

function runtimeVector(data, offset) {
  return [
    data.readFloatLE(offset),
    data.readFloatLE(offset + 4),
    data.readFloatLE(offset + 8),
  ];
}

function routeBytes(points) {
  const result = Buffer.alloc(points.length * 12);
  for (let index = 0; index < points.length; index++) {
    for (let axis = 0; axis < 3; axis++) {
      result.writeFloatLE(points[index][axis], index * 12 + axis * 4);
    }
  }
  return result;
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function schedulerClock(data) {
  const matches = occurrences(data, schedulerClockLiteral);
  if (matches.length !== 1) {
    return {
      status: matches.length === 0
        ? "scheduler-clock-literal-not-resident"
        : "scheduler-clock-literal-not-unique",
      literalCandidateAddresses: matches.map(ramAddress),
    };
  }
  const literalOffset = matches[0];
  const cachePointer = data.readUInt32LE(
    literalOffset + SCHEDULER_CLOCK_CACHE_POINTER_OFFSET,
  );
  const cacheOffset = physicalOffset(cachePointer, data.length);
  if (cacheOffset === null || cacheOffset + 4 > data.length) {
    return {
      status: "scheduler-clock-cache-pointer-outside-source-ram",
      literalAddress: ramAddress(literalOffset),
      cachePointer: hex(cachePointer),
    };
  }
  const second = data.readUInt32LE(cacheOffset);
  return {
    status: second < 86400
      ? "exact-scheduler-clock-second"
      : "scheduler-clock-second-out-of-range",
    literalAddress: ramAddress(literalOffset),
    cachePointer: hex(cachePointer),
    second,
  };
}

function sourceOperationReferences(program) {
  const byAddress = new Map();
  for (const table of program.scheduleTables) {
    for (const entry of table.entries) {
      for (const operation of entry.descriptor.operations) {
        if (operation.operation !== 0x16) continue;
        const operationOffset = physicalAddress(
          Number.parseInt(operation.address, 16),
        );
        let occurrence = byAddress.get(operationOffset);
        if (!occurrence) {
          occurrence = {
            operation,
            scheduleReferences: [],
          };
          byAddress.set(operationOffset, occurrence);
        }
        occurrence.scheduleReferences.push({
          scheduleTable: table.scheduleTable,
          journeyStartSecond: entry.startSecond,
        });
      }
    }
  }
  return byAddress;
}

function cursorClassification(operation, cursorPointer) {
  if (cursorPointer === 0) {
    return {
      status: "null",
      address: "0x0",
    };
  }
  const cursor = physicalAddress(cursorPointer);
  const records = operation.subordinateStream.records;
  for (const record of records) {
    const start = physicalAddress(Number.parseInt(record.address, 16));
    const end = start + record.byteLength;
    if (cursor === start) {
      return {
        status: "record-start",
        address: hex(cursorPointer),
        recordIndex: record.recordIndex,
        operation: record.operation,
        offsetWithinRecord: 0,
      };
    }
    if (cursor > start && cursor < end) {
      return {
        status: "inside-record",
        address: hex(cursorPointer),
        recordIndex: record.recordIndex,
        operation: record.operation,
        offsetWithinRecord: cursor - start,
      };
    }
  }
  const terminator = operation.subordinateStream.terminator;
  const terminatorOffset = physicalAddress(
    Number.parseInt(terminator.address, 16),
  );
  if (cursor === terminatorOffset) {
    return {
      status: "terminator",
      address: hex(cursorPointer),
      operation: 0x27,
    };
  }
  const operationOffset = physicalAddress(
    Number.parseInt(operation.address, 16),
  );
  if (cursor === operationOffset + operation.byteLength) {
    return {
      status: "operation-end",
      address: hex(cursorPointer),
    };
  }
  return {
    status: "outside-subordinate-stream",
    address: hex(cursorPointer),
  };
}

function currentRecordClassification(
  operation,
  cursorPointer,
  currentNestedOperation,
) {
  const cursor = physicalAddress(cursorPointer);
  const records = operation.subordinateStream.records;
  const prior = records.filter((record) => {
    const start = physicalAddress(Number.parseInt(record.address, 16));
    return (
      start + record.byteLength === cursor
      && record.operation === currentNestedOperation
    );
  });
  if (prior.length === 1) {
    return {
      status: "cursor-follows-current-record",
      recordIndex: prior[0].recordIndex,
      operation: prior[0].operation,
      address: prior[0].address,
    };
  }
  const atCursor = records.filter((record) => (
    physicalAddress(Number.parseInt(record.address, 16)) === cursor
    && record.operation === currentNestedOperation
  ));
  if (atCursor.length === 1) {
    return {
      status: "cursor-at-current-record",
      recordIndex: atCursor[0].recordIndex,
      operation: atCursor[0].operation,
      address: atCursor[0].address,
    };
  }
  return {
    status: currentNestedOperation === 0
      ? "no-current-nested-operation"
      : "current-record-not-resolved",
    operation: currentNestedOperation,
  };
}

function countBy(items, keyOf) {
  return Object.fromEntries(
    [...Map.groupBy(items, keyOf).entries()]
      .map(([key, values]) => [String(key), values.length])
      .sort(([left], [right]) => left.localeCompare(
        right,
        undefined,
        { numeric: true },
      )),
  );
}

const sourceOperationCount = source.sourceVariants.reduce(
  (count, variant) => count + variant.scheduleTables.reduce(
    (tableCount, table) => tableCount + table.entries.reduce(
      (entryCount, entry) => entryCount + entry.descriptor.operations.filter(
        (operation) => operation.operation === 0x16,
      ).length,
      0,
    ),
    0,
  ),
  0,
);

const sourceRoutesBySignature = new Map();
function addSourceRoute(graph, root, leaf, phase, route) {
  if (!route?.runtimePoints?.length) return;
  const bytes = routeBytes(route.runtimePoints);
  const signature = `${route.runtimePoints.length}:${sha256(bytes)}`;
  let routes = sourceRoutesBySignature.get(signature);
  if (!routes) {
    routes = [];
    sourceRoutesBySignature.set(signature, routes);
  }
  const candidate = {
    linkedRouteTableId: graph.linkedRouteTableId,
    targetCode: root.targetCode,
    rootIndex: root.rootIndex,
    leafIndex: leaf?.leafIndex ?? null,
    phase,
    sourceRouteFileOffset: route.fileOffset,
    pointCount: route.runtimePoints.length,
    runtimePoints: route.runtimePoints,
    browserPoints: route.browserPoints,
    routeWordSha256: sha256(bytes),
  };
  if (!routes.some((existing) => (
    existing.linkedRouteTableId === candidate.linkedRouteTableId
    && existing.targetCode === candidate.targetCode
    && existing.leafIndex === candidate.leafIndex
    && existing.phase === candidate.phase
  ))) {
    routes.push(candidate);
  }
}
for (const graph of source.linkedRouteTables) {
  for (const root of graph.roots) {
    addSourceRoute(graph, root, null, "root-route", root.route);
    for (const group of root.groups || []) {
      for (const leaf of group.leaves || []) {
        addSourceRoute(graph, root, leaf, "leaf-first-route", leaf.firstRoute);
        addSourceRoute(
          graph,
          root,
          leaf,
          "leaf-second-route",
          leaf.secondRoute,
        );
      }
    }
  }
}

const uniqueCaptures = new Map();
for (const capture of inventory.captures) {
  if (!uniqueCaptures.has(capture.sha256)) {
    uniqueCaptures.set(capture.sha256, capture);
  }
}

const captures = [];
const observations = [];
let actorRecordNotUniqueCount = 0;
let sourceOperationPointerUnmatchedCount = 0;
let sourceOperationPointerAmbiguousCount = 0;
for (const capture of uniqueCaptures.values()) {
  const data = fs.readFileSync(capture.path);
  const clock = schedulerClock(data);
  const captureObservations = [];
  const seenActorRecords = new Set();
  const programs = extractScheduledPrograms(data).filter(
    (program) => program.scheduleTables.some(
      (table) => table.entries.some(
        (entry) => entry.descriptor.operations.some(
          (operation) => operation.operation === 0x16,
        ),
      ),
    ),
  );

  for (const program of programs) {
    const operationByAddress = sourceOperationReferences(program);
    const programHeader = Number.parseInt(program.programHeader, 16);
    const ownerPointer = (
      (programHeader & 0x0fffffff) - 4
    ) >>> 0;
    const actorOffsets = occurrences(data, pointerBytes(ownerPointer))
      .filter((offset) => offset + 0x1e0 <= data.length)
      .filter((offset) => data.readUInt16LE(offset + 4) === 0x16);
    if (actorOffsets.length > 1) actorRecordNotUniqueCount += 1;

    for (const actorOffset of actorOffsets) {
      const actorKey = `${capture.sha256}:${actorOffset}`;
      if (seenActorRecords.has(actorKey)) continue;
      seenActorRecords.add(actorKey);
      const activeSourcePointer = data.readUInt32LE(actorOffset + 0x118);
      const nextOperationPointer = data.readUInt32LE(actorOffset + 0x64);
      const sourceOccurrence = operationByAddress.get(
        physicalAddress(activeSourcePointer),
      );
      if (!sourceOccurrence) {
        sourceOperationPointerUnmatchedCount += 1;
        continue;
      }
      const operation = sourceOccurrence.operation;
      const operationOffset = physicalAddress(
        Number.parseInt(operation.address, 16),
      );
      const endMatches = (
        operationOffset + operation.byteLength
        === physicalAddress(nextOperationPointer)
      );
      const exactCandidates = [...operationByAddress.values()].filter(
        (candidate) => {
          const candidateOffset = physicalAddress(
            Number.parseInt(candidate.operation.address, 16),
          );
          return (
            candidateOffset === physicalAddress(activeSourcePointer)
            && candidateOffset + candidate.operation.byteLength
              === physicalAddress(nextOperationPointer)
          );
        },
      );
      if (exactCandidates.length !== 1 || !endMatches) {
        if (exactCandidates.length > 1) {
          sourceOperationPointerAmbiguousCount += 1;
        } else {
          sourceOperationPointerUnmatchedCount += 1;
        }
        continue;
      }

      const subordinateCursorPointer = data.readUInt32LE(
        actorOffset + 0x1dc,
      );
      const currentNestedOperation = data.readUInt32LE(actorOffset + 0xa8);
      const targetSecond = data.readInt32LE(actorOffset + 0x114);
      const inferredInitializationSecond = operation.activationSecond < 0
        ? targetSecond + operation.activationSecond
        : null;
      const waitDeadlineSecond = data.readUInt32LE(actorOffset + 0x78);
      const actorRuntimePosition = runtimeVector(data, actorOffset + 0x24);
      const previousRuntimePosition = runtimeVector(
        data,
        actorOffset + 0x168,
      );
      const currentRoutePointer = data.readUInt32LE(actorOffset + 0x5c);
      const currentRouteOffset = physicalOffset(
        currentRoutePointer,
        data.length,
      );
      const currentRoutePointCount = data.readUInt16LE(actorOffset + 0x60);
      const currentRouteTargetIndex = data.readUInt16LE(actorOffset + 0x62);
      const currentRouteBytes = (
        currentRouteOffset !== null
        && currentRoutePointCount > 0
        && currentRouteOffset + currentRoutePointCount * 12 <= data.length
      ) ? data.subarray(
        currentRouteOffset,
        currentRouteOffset + currentRoutePointCount * 12,
      ) : null;
      const currentRouteSignature = currentRouteBytes
        ? `${currentRoutePointCount}:${sha256(currentRouteBytes)}`
        : null;
      const currentRouteMatches = (
        sourceRoutesBySignature.get(currentRouteSignature) || []
      ).filter((route) => route.targetCode === operation.targetCode);
      const cursor = cursorClassification(
        operation,
        subordinateCursorPointer,
      );
      const currentRecord = currentRecordClassification(
        operation,
        subordinateCursorPointer,
        currentNestedOperation,
      );
      const observation = {
        capturePath: capture.path,
        captureSha256: capture.sha256,
        likelyDisc: capture.likelyDisc,
        likelyArea: capture.likelyArea,
        schedulerClock: clock,
        actorCode: program.actorCode,
        programHeader: program.programHeader,
        sourceNormalizedByteSha256:
          program.sourceNormalizedByteSha256,
        actorRecordAddress: ramAddress(actorOffset),
        actorCurrentOperation: 0x16,
        actorMotionStateId: data.readInt16LE(actorOffset + 6),
        actorRuntimePosition,
        actorBrowserPosition: browserVector(actorRuntimePosition),
        actorFacingFixed: data.readInt16LE(actorOffset + 0x50),
        previousRuntimePosition,
        previousBrowserPosition: browserVector(previousRuntimePosition),
        observedUpdateDisplacement: Math.hypot(
          ...actorRuntimePosition.map(
            (value, axis) => value - previousRuntimePosition[axis],
          ),
        ),
        currentRoutePointer: hex(currentRoutePointer),
        currentRoutePointCount,
        currentRouteTargetIndex,
        currentRouteFrameStep: data.readFloatLE(actorOffset + 0x58),
        currentRoutePathStep: data.readFloatLE(actorOffset + 0x140),
        currentRouteExactSourceMatchCount: currentRouteMatches.length,
        currentRouteExactSourceMatches: currentRouteMatches,
        controllerState: data.readUInt32LE(actorOffset + 0x110),
        targetSecond,
        sourceActivationSecond: operation.activationSecond,
        inferredInitializationSecond,
        initializationAgeSeconds: (
          Number.isFinite(clock.second)
          && Number.isFinite(inferredInitializationSecond)
        ) ? clock.second - inferredInitializationSecond : null,
        activeSourcePointer: hex(activeSourcePointer),
        sourcePointerExactMatch: true,
        nextOperationPointer: hex(nextOperationPointer),
        nextOperationEndExactMatch: true,
        operationAddress: operation.address,
        operationOffsetFromProgramHeader:
          operationOffset - physicalAddress(programHeader),
        operationByteLength: operation.byteLength,
        targetCode: operation.targetCode,
        minimumDelaySeconds: operation.minimumDelaySeconds,
        scheduleReferences: sourceOccurrence.scheduleReferences,
        subordinateRecordCount:
          operation.subordinateStream.records.length,
        runtimeSubordinateRecordCount:
          data.readUInt32LE(actorOffset + 0x11c),
        subordinateCursorPointer: hex(subordinateCursorPointer),
        subordinateCursor: cursor,
        currentNestedOperation,
        currentRecord,
        subordinateIndex: data.readUInt32LE(actorOffset + 0x120),
        controllerActiveFlag: data.readUInt8(actorOffset + 0x1d8),
        controllerInitializedFlag: data.readUInt8(actorOffset + 0x1d9),
        waitDeadlineSecond,
        waitDeadlineDeltaSeconds: Number.isFinite(clock.second)
          ? waitDeadlineSecond - clock.second
          : null,
      };
      observations.push(observation);
      captureObservations.push(observation);
    }
  }

  if (captureObservations.length > 0) {
    captures.push({
      path: capture.path,
      sha256: capture.sha256,
      likelyDisc: capture.likelyDisc,
      likelyArea: capture.likelyArea,
      schedulerClock: clock,
      activeOperation16ObservationCount: captureObservations.length,
    });
  }
}

const exactClockObservations = observations.filter(
  (observation) => (
    observation.schedulerClock.status === "exact-scheduler-clock-second"
  ),
);
const negativeActivationObservations = observations.filter(
  (observation) => observation.sourceActivationSecond < 0,
);
const currentWaitObservations = exactClockObservations.filter(
  (observation) => observation.currentNestedOperation === 0x07,
);
const exactCurrentRouteObservations = observations.filter(
  (observation) => observation.currentRouteExactSourceMatchCount === 1,
);
const report = {
  schema: "new-yokosuka-scheduled-actor-subordinate-evidence-v1",
  generatedFrom: [
    path.relative(process.cwd(), inventoryPath),
    path.relative(process.cwd(), sourceManifestPath),
    path.relative(process.cwd(), enginePath),
  ],
  evidenceBoundary: (
    "Each unique RAM capture is scanned for scheduled programs through the "
    + "same structural PRG1 extractor used by the offline manifest. Runtime "
    + "actor records are found from the relocated owner pointer rather than "
    + "a fixed address. An observation is accepted only when actor +0x04 is "
    + "0x16, actor +0x118 points to exactly one extracted operation-0x16 "
    + "record, and actor +0x64 points exactly to that record's end. The "
    + "report then reads controller state +0x110, target/deadline +0x114, "
    + "current nested opcode +0xa8, subordinate index +0x120, flags "
    + "+0x1d8/+0x1d9, and cursor +0x1dc. Cursor addresses are resolved only "
    + "against exact extracted subordinate-record boundaries. Active route "
    + "pointers at +0x5c are compared byte-for-byte with every root/leaf "
    + "route in the actor's exact MCIR target. Scheduler "
    + "seconds are found structurally from the reviewed executable literal. "
    + "The captures prove observed live phases, not the duration of "
    + "unobserved route segments or a universal frame-to-game-time ratio."
  ),
  nativeEvidence: {
    descriptorGateAddress: "0x0c11a952",
    descriptorGateRule: (
      "wait while schedulerSecond is before journeyStartSecond + 300 or "
      + "before (negative operand ? journeyStartSecond - operand : operand)"
    ),
    controllerStateMachineAddress: "0x0c1264e4",
    controllerInitializationAddress: "0x0c126cca",
    schedulerClockFunctionAddress: "0x0c114856",
    actorCurrentOperationOffset: "0x04",
    actorMotionStateOffset: "0x06",
    actorWaitDeadlineOffset: "0x78",
    actorCurrentNestedOperationOffset: "0xa8",
    actorControllerStateOffset: "0x110",
    actorTargetSecondOffset: "0x114",
    actorSourceOperationPointerOffset: "0x118",
    actorSubordinateRecordCountOffset: "0x11c",
    actorSubordinateIndexOffset: "0x120",
    actorControllerActiveFlagOffset: "0x1d8",
    actorControllerInitializedFlagOffset: "0x1d9",
    actorSubordinateCursorOffset: "0x1dc",
    negativeTargetInitializationRule: (
      "actorTargetSecond = schedulerSecondAtInitialization "
      + "- sourceActivationSecond"
    ),
  },
  summary: {
    inventoryCaptureCount: inventory.captures.length,
    uniqueCaptureHashCount: uniqueCaptures.size,
    sourceOperation16OccurrenceCount: sourceOperationCount,
    captureWithActiveOperation16Count: captures.length,
    exactActiveOperation16ObservationCount: observations.length,
    actorRecordNotUniqueCount,
    sourceOperationPointerUnmatchedCount,
    sourceOperationPointerAmbiguousCount,
    exactSchedulerClockObservationCount: exactClockObservations.length,
    negativeActivationObservationCount:
      negativeActivationObservations.length,
    currentWaitObservationCount: currentWaitObservations.length,
    exactCurrentRouteObservationCount:
      exactCurrentRouteObservations.length,
    nullCurrentRouteObservationCount: observations.filter(
      (observation) => observation.currentRoutePointer === "0x0",
    ).length,
    ambiguousCurrentRouteObservationCount: observations.filter(
      (observation) => observation.currentRouteExactSourceMatchCount > 1,
    ).length,
    unmatchedResidentCurrentRouteObservationCount: observations.filter(
      (observation) => (
        observation.currentRoutePointer !== "0x0"
        && observation.currentRouteExactSourceMatchCount === 0
      ),
    ).length,
    currentRoutePhaseCounts: countBy(
      exactCurrentRouteObservations,
      (observation) => (
        observation.currentRouteExactSourceMatches[0].phase
      ),
    ),
    controllerStateCounts: countBy(
      observations,
      (observation) => observation.controllerState,
    ),
    currentNestedOperationCounts: countBy(
      observations,
      (observation) => observation.currentNestedOperation,
    ),
    subordinateCursorStatusCounts: countBy(
      observations,
      (observation) => observation.subordinateCursor.status,
    ),
    currentRecordStatusCounts: countBy(
      observations,
      (observation) => observation.currentRecord.status,
    ),
    subordinateIndexCounts: countBy(
      observations,
      (observation) => observation.subordinateIndex,
    ),
    controllerActiveFlagCounts: countBy(
      observations,
      (observation) => observation.controllerActiveFlag,
    ),
    controllerInitializedFlagCounts: countBy(
      observations,
      (observation) => observation.controllerInitializedFlag,
    ),
    schedulerClockStatusCounts: countBy(
      observations,
      (observation) => observation.schedulerClock.status,
    ),
  },
  captures,
  observations,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${outputPath}: ${observations.length} exact active operation-0x16 `
  + `observations across ${captures.length} unique captures.`,
);
